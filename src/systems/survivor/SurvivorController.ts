import Phaser from 'phaser'
import type { AudioBus } from '../AudioBus'
import type { Boss } from '../../types/BossTypes'
import { getDirectionFromVelocity } from '../AnimationManager'
import { BOSS, BURST, COLORS, GAUGE, MELEE, SE } from './SurvivorConfig'
import { createSurvivorEffects, type SurvivorEffects } from './SurvivorEffects'
import { createEnemyField, type EnemyField, type SvEnemySprite } from './SurvivorEnemies'
import { createSurvivorHud, type SurvivorHud, type SurvivorResultKind } from './SurvivorHud'

/**
 * サバイバーモード（ヴァンパイアサバイバー風）の統括。
 * - 自動近接攻撃（全方位斬撃）
 * - 撃破ゲージ → 火炎バースト（全方位回転放射）
 * - 雑魚の無限湧き（SurvivorEnemies）
 * - 最深部ボスの休眠／起動
 */

export interface SurvivorDeps {
  scene: Phaser.Scene
  player: Phaser.Physics.Arcade.Sprite
  projectiles: Phaser.Physics.Arcade.Group
  audioBus: AudioBus
  tileSize: number
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void
  /** プレイヤーにダメージ。無敵時間中などで適用されなかった場合は false */
  damagePlayer: (amount: number) => boolean
  damageBoss: (amount: number) => void
  getBoss: () => Boss | null
  onBossEngage: (boss: Boss) => void
}

export interface SurvivorStartParams {
  walls: Phaser.Physics.Arcade.StaticGroup
  wallGrid: boolean[][]
  worldW: number
  worldH: number
}

export interface SurvivorController {
  start(params: SurvivorStartParams): void
  stop(): void
  isActive(): boolean
  /** ボスAIを動かしてよいか（サバイバーモード外では常に true） */
  isBossAwake(): boolean
  update(delta: number): void
  /** 斬撃中・バースト中のプレイヤーアニメ。null なら通常のアニメ処理 */
  getPlayerAnimOverride(moveDir: string): string | null
  freeze(): void
  showResult(kind: SurvivorResultKind): void
  getUiObjects(): Phaser.GameObjects.GameObject[]
  destroy(): void
}

const FLAME_SCALE_MIN = 0.15
const FLAME_SCALE_MAX = 1.3
const DEPTH_FLAME = 9

export function createSurvivorController(deps: SurvivorDeps): SurvivorController {
  const { scene, player, audioBus } = deps

  const effects: SurvivorEffects = createSurvivorEffects(scene, deps.addWorldObject)
  const hud: SurvivorHud = createSurvivorHud(scene, () => tryBurst())

  let active = false
  let ended = false   // リザルト表示後は時間・ロジックを止める
  let clock = 0
  let kills = 0
  let gauge = 0
  let meleeReadyAt = 0
  let animLockUntil = 0
  let slashDir = 'down'
  let burstUntil = 0
  let burstAngle = 0
  let burstAcc = 0
  let flameLoopPlaying = false
  let bossEngaged = false
  let bossDefeatHandled = false
  let bossFireCoolUntil = 0
  let lastKillSe = 0

  let field: EnemyField | null = null
  let flames: Phaser.Physics.Arcade.Group | null = null
  let colliders: Phaser.Physics.Arcade.Collider[] = []

  const burstKey = scene.input.keyboard?.addKey(GAUGE.key) ?? null
  burstKey?.on('down', () => tryBurst())

  const isBurstActive = (): boolean => clock < burstUntil

  const bossIsAlive = (boss: Boss | null): boolean =>
    !!boss && boss.active && boss.state !== 'defeated'

  // ── 撃破・ゲージ ──
  const onKill = (): void => {
    kills++
    if (clock - lastKillSe >= SE.killSeCool) {
      lastKillSe = clock
      audioBus.playSe(SE.kill, { volume: 0.45, rate: 0.6 })
    }
    // バースト中の撃破はゲージに加算しない（無限連鎖防止）
    if (isBurstActive() || gauge >= GAUGE.max) return
    gauge++
    if (gauge >= GAUGE.max) {
      hud.setButtonVisible(true)
      hud.banner('FLAME READY!', COLORS.gaugeFull, 600)
      audioBus.playSe(SE.gaugeFull, { volume: 0.7 })
    }
  }

  // ── 火炎バースト ──
  const tryBurst = (): void => {
    if (!active || ended || gauge < GAUGE.max || isBurstActive()) return
    gauge = 0
    burstUntil = clock + BURST.duration
    burstAcc = BURST.interval
    burstAngle = Math.random() * Math.PI * 2
    hud.setButtonVisible(false)
    hud.banner('FLAME BURST!!', COLORS.fire, 700)
    effects.shake(300, 0.012)
    effects.flash(250, COLORS.fire)
    effects.fire(player.x, player.y, 40)
    audioBus.playSe(SE.burstStart, { volume: 0.8 })
    if (!flameLoopPlaying) {
      audioBus.playSeLoop(SE.burstLoop, 0.7)
      flameLoopPlaying = true
    }
  }

  const killFlame = (fb: Phaser.Physics.Arcade.Sprite): void => {
    fb.disableBody(true, true)
  }

  const spawnFlame = (angle: number): void => {
    if (!flames) return
    const fb = flames.get(player.x, player.y, BURST.texture) as Phaser.Physics.Arcade.Sprite | null
    if (!fb) return
    if (!fb.getData('svInit')) {
      fb.setData('svInit', true)
      deps.addWorldObject(fb)
    }
    fb.enableBody(true, player.x, player.y, true, true)
    fb.setActive(true).setVisible(true).setDepth(DEPTH_FLAME).setScale(FLAME_SCALE_MIN)
    fb.setBlendMode(Phaser.BlendModes.ADD)
    fb.setData('ox', player.x)
    fb.setData('oy', player.y)
    fb.setVelocity(Math.cos(angle) * BURST.speed, Math.sin(angle) * BURST.speed)
    fb.setRotation(angle)
  }

  const updateBurst = (delta: number): void => {
    if (isBurstActive()) {
      burstAngle += Phaser.Math.DegToRad(BURST.spinDegPerSec) * (delta / 1000)
      burstAcc += delta
      while (burstAcc >= BURST.interval) {
        burstAcc -= BURST.interval
        for (let s = 0; s < BURST.streams; s++) {
          spawnFlame(burstAngle + (s * Math.PI * 2) / BURST.streams)
        }
      }
    } else if (flameLoopPlaying) {
      audioBus.stopSeLoop(SE.burstLoop)
      flameLoopPlaying = false
    }

    flames?.getChildren().forEach(obj => {
      const fb = obj as Phaser.Physics.Arcade.Sprite
      if (!fb.active) return
      const ox = fb.getData('ox') as number
      const oy = fb.getData('oy') as number
      const dist = Phaser.Math.Distance.Between(ox, oy, fb.x, fb.y)
      if (dist >= BURST.range) {
        killFlame(fb)
        return
      }
      fb.setScale(Phaser.Math.Linear(FLAME_SCALE_MIN, FLAME_SCALE_MAX, dist / BURST.range))
    })
  }

  // ── 自動近接攻撃 ──
  const updateMelee = (): void => {
    if (clock < meleeReadyAt || !field) return

    const targets: SvEnemySprite[] = []
    let nearestDist = Number.POSITIVE_INFINITY
    let nearestX = player.x
    let nearestY = player.y + 1

    field.forEachAlive(sp => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, sp.x, sp.y)
      if (d <= MELEE.radius + sp.displayWidth * 0.25) {
        targets.push(sp)
        if (d < nearestDist) {
          nearestDist = d
          nearestX = sp.x
          nearestY = sp.y
        }
      }
    })

    const boss = deps.getBoss()
    let bossInRange = false
    if (bossEngaged && boss && bossIsAlive(boss)) {
      const d = Phaser.Math.Distance.Between(player.x, player.y, boss.x, boss.y)
      if (d <= MELEE.radius + boss.displayWidth * 0.3) {
        bossInRange = true
        if (d < nearestDist) {
          nearestX = boss.x
          nearestY = boss.y
        }
      }
    }

    if (targets.length === 0 && !bossInRange) return

    meleeReadyAt = clock + MELEE.cooldown
    animLockUntil = clock + MELEE.animLock
    slashDir = getDirectionFromVelocity(nearestX - player.x, nearestY - player.y)
    player.play(`hero-atk-${slashDir}`)
    effects.slash(player, MELEE.radius)
    audioBus.playSe(SE.slash, { volume: 0.7 })

    targets.forEach(sp => {
      const x = sp.x
      const y = sp.y
      field?.hit(sp, MELEE.damage, player.x, player.y, true)
      effects.sparks(x, y, 7)
      effects.damageNumber(x, y - 24, MELEE.damage, '#ffffff')
    })
    if (targets.length > 0) audioBus.playSe(SE.hit, { volume: 0.5 })

    if (bossInRange && boss) {
      deps.damageBoss(MELEE.bossDamage)
      effects.sparks(boss.x, boss.y, 12)
      effects.damageNumber(boss.x, boss.y - 40, MELEE.bossDamage, '#ffd23f')
    }
  }

  // ── ボス ──
  const engageBoss = (boss: Boss): void => {
    bossEngaged = true
    // BossAI はフェーズ1の倍率を初期化しないため、ここで適用する
    const phase1 = boss.config.phases.find(p => p.phase === 1)
    if (phase1 && phase1.attackCooldown > 0) boss.attackCooldown = 3000 / phase1.attackCooldown
    boss.lastAttackTime = scene.time.now
    hud.banner('WARNING', COLORS.warning, 1200)
    effects.shake(600, 0.01)
    effects.flash(400, COLORS.warning)
    audioBus.playSe(SE.bossEngage, { volume: 0.8 })
    deps.onBossEngage(boss)
  }

  const updateBoss = (): { alive: boolean; phase2: boolean; x: number; y: number } => {
    const boss = deps.getBoss()
    if (!boss) return { alive: false, phase2: false, x: 0, y: 0 }

    if (!bossEngaged && bossIsAlive(boss)) {
      boss.setVelocity(0, 0)
      const d = Phaser.Math.Distance.Between(player.x, player.y, boss.x, boss.y)
      if (d <= BOSS.engageDistance) engageBoss(boss)
    }

    const alive = bossIsAlive(boss)
    if (bossEngaged && !alive && !bossDefeatHandled) {
      bossDefeatHandled = true
      field?.explodeAll()
      effects.shake(500, 0.015)
      effects.fire(boss.x, boss.y, 60)
    }
    return { alive: bossEngaged && alive, phase2: boss.phase === 2, x: boss.x, y: boss.y }
  }

  // ── コライダー ──
  const setupColliders = (walls: Phaser.Physics.Arcade.StaticGroup): void => {
    if (!field || !flames) return
    const enemies = field.group
    const flameGroup = flames
    const physics = scene.physics

    colliders.push(physics.add.collider(enemies, walls))
    colliders.push(physics.add.collider(enemies, enemies))

    colliders.push(physics.add.overlap(player, enemies, (a, b) => {
      const sp = (a === player ? b : a) as SvEnemySprite
      if (!field?.isAlive(sp)) return
      if (deps.damagePlayer(field.contactDamage(sp))) {
        effects.shake(90, 0.005)
        effects.blood(player.x, player.y, 6)
      }
    }))

    colliders.push(physics.add.overlap(flameGroup, walls, (a, b) => {
      const fb = (flameGroup.contains(a as Phaser.GameObjects.GameObject) ? a : b) as Phaser.Physics.Arcade.Sprite
      if (fb.active) killFlame(fb)
    }))

    colliders.push(physics.add.overlap(flameGroup, enemies, (a, b) => {
      const isAFlame = flameGroup.contains(a as Phaser.GameObjects.GameObject)
      const fb = (isAFlame ? a : b) as Phaser.Physics.Arcade.Sprite
      const sp = (isAFlame ? b : a) as SvEnemySprite
      if (!fb.active || !field?.isAlive(sp)) return
      killFlame(fb)
      field.hit(sp, BURST.damage, fb.x, fb.y, true)
      effects.fire(sp.x, sp.y, 4)
    }))

    const boss = deps.getBoss()
    if (boss) {
      colliders.push(physics.add.overlap(flameGroup, boss, (a, b) => {
        const fb = (flameGroup.contains(a as Phaser.GameObjects.GameObject) ? a : b) as Phaser.Physics.Arcade.Sprite
        if (!fb.active || !bossEngaged || !bossIsAlive(boss)) return
        killFlame(fb)
        if (clock < bossFireCoolUntil) return
        bossFireCoolUntil = clock + BURST.bossHitCool
        effects.fire(fb.x, fb.y, 5)
        deps.damageBoss(BURST.bossDamage)
      }))
    }
  }

  const resetState = (): void => {
    ended = false
    clock = 0
    kills = 0
    gauge = 0
    meleeReadyAt = 0
    animLockUntil = 0
    burstUntil = 0
    burstAcc = 0
    bossEngaged = false
    bossDefeatHandled = false
    bossFireCoolUntil = 0
    lastKillSe = 0
  }

  const stop = (): void => {
    colliders.forEach(c => { if (c.active) c.destroy() })
    colliders = []
    field?.destroy()
    field = null
    flames?.destroy(true)
    flames = null
    if (flameLoopPlaying) {
      audioBus.stopSeLoop(SE.burstLoop)
      flameLoopPlaying = false
    }
    active = false
    resetState()
    hud.reset()
    hud.setVisible(false)
  }

  return {
    start: (params) => {
      stop()
      active = true
      field = createEnemyField({
        scene,
        player,
        projectiles: deps.projectiles,
        effects,
        addWorldObject: deps.addWorldObject,
        wallGrid: params.wallGrid,
        tileSize: deps.tileSize,
        worldW: params.worldW,
        worldH: params.worldH,
        onKill,
      })
      flames = scene.physics.add.group({ maxSize: BURST.poolSize })
      setupColliders(params.walls)
      hud.setVisible(true)
      hud.update(0, 0, 0, GAUGE.max, 0)
    },
    stop,
    isActive: () => active,
    isBossAwake: () => !active || bossEngaged,
    update: (delta) => {
      if (!active || ended || !field) return
      clock += delta
      const bossInfo = updateBoss()
      field.update(delta, {
        spawning: !bossDefeatHandled,
        bossActive: bossInfo.alive,
        bossPhase2: bossInfo.phase2,
        bossX: bossInfo.x,
        bossY: bossInfo.y,
      })
      updateMelee()
      updateBurst(delta)
      const burstRatio = isBurstActive() ? (burstUntil - clock) / BURST.duration : 0
      hud.update(clock, kills, gauge, GAUGE.max, burstRatio)
    },
    getPlayerAnimOverride: (moveDir) => {
      if (!active) return null
      if (clock < animLockUntil) return `hero-atk-${slashDir}`
      if (isBurstActive()) return `hero-special-${moveDir}`
      return null
    },
    freeze: () => {
      field?.freeze()
      burstUntil = clock
      if (flameLoopPlaying) {
        audioBus.stopSeLoop(SE.burstLoop)
        flameLoopPlaying = false
      }
    },
    showResult: (kind) => {
      ended = true
      hud.showResult(kind, clock, kills)
    },
    getUiObjects: () => [hud.container],
    destroy: () => {
      stop()
      effects.destroy()
      if (burstKey) {
        burstKey.removeAllListeners()
        scene.input.keyboard?.removeKey(burstKey)
      }
    },
  }
}
