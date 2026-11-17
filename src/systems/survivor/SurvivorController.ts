import Phaser from 'phaser'
import type { AudioBus } from '../AudioBus'
import type { Boss } from '../../types/BossTypes'
import { getDirectionFromVelocity } from '../AnimationManager'
import type { FxManager } from '../fx/FxManager'
import { BOSS, BURST, COLORS, DROP, GAUGE, MELEE, PICKUP, SE, UPGRADE_VALUES, type SurvivorEnemyKind } from './SurvivorConfig'
import { createSurvivorBlades, type SurvivorBlades } from './SurvivorBlades'
import { createSurvivorPickups, type PickupKind, type SurvivorPickups } from './SurvivorPickups'
import { createSurvivorUpgrades, type SurvivorUpgrades } from './SurvivorUpgrades'
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
  /** プレイヤーを回復（最大HPを超えない） */
  healPlayer: (amount: number) => void
  /** 現在HP / 最大HP（0〜1） */
  getPlayerHpRatio: () => number
  /** エフェクトプリセット再生（null なら従来の演出のみ） */
  fx: FxManager | null
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

  const effects: SurvivorEffects = createSurvivorEffects(scene, deps.addWorldObject, deps.fx)
  const hud: SurvivorHud = createSurvivorHud(scene, () => tryBurst())
  const upgrades: SurvivorUpgrades = createSurvivorUpgrades()

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
  let money = 0
  let lastCoinSe = 0
  let guaranteeGap: number = DROP.guaranteeFirst
  let nextGuarantee: number = DROP.guaranteeFirst
  const facing = new Phaser.Math.Vector2(0, 1)

  let field: EnemyField | null = null
  let flames: Phaser.Physics.Arcade.Group | null = null
  let colliders: Phaser.Physics.Arcade.Collider[] = []

  const burstKey = scene.input.keyboard?.addKey(GAUGE.key) ?? null
  burstKey?.on('down', () => tryBurst())

  const isBurstActive = (): boolean => clock < burstUntil

  const bossIsAlive = (boss: Boss | null): boolean =>
    !!boss && boss.active && boss.state !== 'defeated'

  // ── アイテム取得 ──
  const onCollect = (kind: PickupKind): void => {
    if (!active || ended) return
    if (kind.type === 'coin') {
      money += kind.value
      hud.setMoney(money)
      if (clock - lastCoinSe >= SE.coinSeCool) {
        lastCoinSe = clock
        audioBus.playSe(SE.coin, { volume: SE.coinVolume, rate: SE.coinRate })
      }
      return
    }
    if (kind.type === 'heal') {
      deps.healPlayer(PICKUP.healAmount)
      hud.toast(`HP +${PICKUP.healAmount}`, COLORS.heal)
      effects.onPickupHeal(player)
      audioBus.playSe(SE.heal, { volume: 0.7 })
      return
    }
    const def = upgrades.def(kind.id)
    if (!upgrades.levelUp(kind.id)) return
    const lv = upgrades.level(kind.id)
    hud.toast(`${def.label} ${lv >= def.max ? 'MAX' : `Lv${lv}`}`, def.color)
    hud.setUpgrades(upgrades.all())
    effects.onPickupUpgrade(player, def.color)
    audioBus.playSe(SE.upgrade, { volume: 0.7, rate: SE.upgradeRate })
  }

  const pickups: SurvivorPickups = createSurvivorPickups(scene, deps.addWorldObject, (kind) => onCollect(kind))

  const blades: SurvivorBlades = createSurvivorBlades(scene, player, deps.addWorldObject, {
    forEachEnemy: (cb) => { field?.forEachAlive(cb) },
    hitEnemy: (sp, damage, x, y) => {
      const ex = sp.x
      const ey = sp.y
      field?.hit(sp, damage, x, y, true)
      effects.onEnemyHit(ex, ey)
      effects.damageNumber(ex, ey - 24, damage, '#c8ffb0')
    },
    getBoss: () => {
      const boss = deps.getBoss()
      return bossEngaged && boss && bossIsAlive(boss) ? boss : null
    },
    hitBoss: (damage, x, y) => {
      const boss = deps.getBoss()
      if (!boss) return
      deps.damageBoss(damage)
      effects.onBossHit(x, y)
      effects.damageNumber(boss.x, boss.y - 40, damage, '#ffd23f')
    },
    onThrow: () => { audioBus.playSe(SE.blade, { volume: 0.4, rate: SE.bladeRate }) },
  })

  // ── 撃破・ゲージ ──
  /** 強化を1つ落とす。全強化が上限なら回復に置き換える */
  const dropUpgradeOrHeal = (x: number, y: number): void => {
    const id = upgrades.pickRandom()
    pickups.drop(id ? { type: 'upgrade', id } : { type: 'heal' }, x, y)
  }

  const rollDrops = (x: number, y: number, kind: SurvivorEnemyKind): void => {
    pickups.drop({ type: 'coin', value: kind.coin }, x, y)

    // バースト中の撃破はコインのみ（大量撃破でアイテムが溢れないように）
    if (!isBurstActive() && Math.random() < DROP.chance) {
      const hpRatio = Phaser.Math.Clamp(deps.getPlayerHpRatio(), 0, 1)
      const healShare = DROP.healShare + DROP.lowHpHealBoost * (1 - hpRatio)
      if (Math.random() < healShare) pickups.drop({ type: 'heal' }, x, y)
      else dropUpgradeOrHeal(x, y)
    }

    // 確定ドロップ（バースト中の撃破も数える）
    if (kills >= nextGuarantee) {
      dropUpgradeOrHeal(x, y)
      guaranteeGap = Math.min(DROP.guaranteeMax, guaranteeGap + DROP.guaranteeStep)
      nextGuarantee += guaranteeGap
    }
  }

  const onKill = (x: number, y: number, kind: SurvivorEnemyKind): void => {
    kills++
    rollDrops(x, y, kind)
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
    effects.onBurstStart(player)
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
      const range = upgrades.burstRange()
      if (dist >= range) {
        killFlame(fb)
        return
      }
      // 射程が伸びたぶん炎も大きくする
      const scaleMax = FLAME_SCALE_MAX * Math.sqrt(range / UPGRADE_VALUES.burstRange[0])
      fb.setScale(Phaser.Math.Linear(FLAME_SCALE_MIN, scaleMax, dist / range))
    })
  }

  // ── 自動近接攻撃 ──
  const updateMelee = (): void => {
    if (clock < meleeReadyAt || !field) return
    const radius = upgrades.meleeRadius()
    const damage = upgrades.meleeDamage()

    const targets: SvEnemySprite[] = []
    let nearestDist = Number.POSITIVE_INFINITY
    let nearestX = player.x
    let nearestY = player.y + 1

    field.forEachAlive(sp => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, sp.x, sp.y)
      if (d <= radius + sp.displayWidth * 0.25) {
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
      if (d <= radius + boss.displayWidth * 0.3) {
        bossInRange = true
        if (d < nearestDist) {
          nearestX = boss.x
          nearestY = boss.y
        }
      }
    }

    if (targets.length === 0 && !bossInRange) return

    meleeReadyAt = clock + upgrades.meleeCooldown()
    animLockUntil = clock + MELEE.animLock
    slashDir = getDirectionFromVelocity(nearestX - player.x, nearestY - player.y)
    player.play(`hero-atk-${slashDir}`)
    effects.onSlash(player, radius)
    audioBus.playSe(SE.slash, { volume: 0.7 })

    targets.forEach(sp => {
      const x = sp.x
      const y = sp.y
      field?.hit(sp, damage, player.x, player.y, true)
      effects.onEnemyHit(x, y)
      effects.damageNumber(x, y - 24, damage, '#ffffff')
    })
    if (targets.length > 0) audioBus.playSe(SE.hit, { volume: 0.5 })

    if (bossInRange && boss) {
      deps.damageBoss(MELEE.bossDamage)
      effects.onBossHit(boss.x, boss.y)
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
    effects.onBossEngage(
      Phaser.Math.Linear(boss.x, player.x, BOSS.engageFxToward),
      Phaser.Math.Linear(boss.y, player.y, BOSS.engageFxToward),
    )
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
      effects.onBossDefeat(boss.x, boss.y)
      pickups.scatterCoins(boss.x, boss.y, DROP.bossCoins, DROP.bossCoinValue, DROP.bossCoinRadius)
      dropUpgradeOrHeal(boss.x, boss.y)
      // 撃破後すぐにリザルトへ進むため、場のアイテムを一斉に吸い寄せる
      pickups.vacuumAll()
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
        effects.onPlayerHit(player.x, player.y)
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
      field.hit(sp, upgrades.burstDamage(), fb.x, fb.y, true)
      effects.onFlameHit(sp.x, sp.y)
    }))

    const boss = deps.getBoss()
    if (boss) {
      colliders.push(physics.add.overlap(flameGroup, boss, (a, b) => {
        const fb = (flameGroup.contains(a as Phaser.GameObjects.GameObject) ? a : b) as Phaser.Physics.Arcade.Sprite
        if (!fb.active || !bossEngaged || !bossIsAlive(boss)) return
        killFlame(fb)
        if (clock < bossFireCoolUntil) return
        bossFireCoolUntil = clock + BURST.bossHitCool
        effects.onFlameHit(fb.x, fb.y)
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
    money = 0
    lastCoinSe = 0
    guaranteeGap = DROP.guaranteeFirst
    nextGuarantee = DROP.guaranteeFirst
    facing.set(0, 1)
    upgrades.reset()
    pickups.clear()
    blades.clear()
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
    hud.setUpgrades(upgrades.all())
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
      const body = player.body as Phaser.Physics.Arcade.Body | null
      if (body && body.velocity.lengthSq() > 1) facing.copy(body.velocity).normalize()
      blades.update(delta, upgrades.bladeCount(), upgrades.bladeDamage(), facing)
      pickups.update(delta, player, Math.max(PICKUP.magnetRadius, upgrades.meleeRadius() + PICKUP.magnetMeleeMargin))
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
      pickups.freeze()
      blades.freeze()
      burstUntil = clock
      if (flameLoopPlaying) {
        audioBus.stopSeLoop(SE.burstLoop)
        flameLoopPlaying = false
      }
    },
    showResult: (kind) => {
      ended = true
      if (kind === 'clear') {
        // 拾いきれなかったコインは回収したことにする
        money += pickups.settleCoins()
        hud.setMoney(money)
      }
      hud.showResult(kind, clock, kills, money)
    },
    getUiObjects: () => [hud.container],
    destroy: () => {
      stop()
      effects.destroy()
      pickups.destroy()
      blades.destroy()
      if (burstKey) {
        burstKey.removeAllListeners()
        scene.input.keyboard?.removeKey(burstKey)
      }
    },
  }
}
