import Phaser from 'phaser'
import { createEnemyAnimations, getDirectionFromVelocity } from '../AnimationManager'
import { fireOrbAt } from '../Projectile'
import { ENEMY_AI, ENEMY_KINDS, SPAWN, type SurvivorEnemyKind } from './SurvivorConfig'
import type { SurvivorEffects } from './SurvivorEffects'

/**
 * サバイバーモードの雑魚敵。
 * 1つの Physics Group をプールとして使い回すことで、何体湧いてもコライダー数は一定に保つ。
 */

export type SvEnemySprite = Phaser.Physics.Arcade.Sprite

interface SvEnemyState {
  kind: SurvivorEnemyKind
  hp: number
  dead: boolean
  lastShot: number
  knockUntil: number
  dir: string
}

export interface EnemyFieldContext {
  scene: Phaser.Scene
  player: Phaser.Physics.Arcade.Sprite
  projectiles: Phaser.Physics.Arcade.Group
  effects: SurvivorEffects
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void
  wallGrid: boolean[][]
  tileSize: number
  worldW: number
  worldH: number
  /** 撃破時（explodeAll による一掃では呼ばない） */
  onKill: (x: number, y: number) => void
}

export interface EnemyFieldUpdateOptions {
  spawning: boolean
  bossActive: boolean
  bossPhase2: boolean
  bossX: number
  bossY: number
}

export interface EnemyField {
  readonly group: Phaser.Physics.Arcade.Group
  update(delta: number, opts: EnemyFieldUpdateOptions): void
  forEachAlive(cb: (sprite: SvEnemySprite) => void): void
  isAlive(sprite: SvEnemySprite): boolean
  contactDamage(sprite: SvEnemySprite): number
  /** ダメージを与える。撃破したら true */
  hit(sprite: SvEnemySprite, amount: number, srcX: number, srcY: number, knockback: boolean): boolean
  /** 全敵を撃破演出付きで消す（ボス撃破時） */
  explodeAll(): void
  /** 全敵の動きを止める（ゲームオーバー時） */
  freeze(): void
  destroy(): void
}

const DEPTH_ENEMY = 6
const DEATH_FADE_DELAY = 250
const DEATH_FADE_DURATION = 300
const SPAWN_FADE_DURATION = 220
const MAP_MARGIN_TILES = 2

export function createEnemyField(ctx: EnemyFieldContext): EnemyField {
  const { scene, player } = ctx
  const group = scene.physics.add.group({ maxSize: SPAWN.poolSize })
  const states = new Map<SvEnemySprite, SvEnemyState>()

  ENEMY_KINDS.forEach(k => {
    if (scene.textures.exists(k.texture)) createEnemyAnimations(scene, k.animPrefix, k.texture)
  })
  const availableKinds = ENEMY_KINDS.filter(k => scene.textures.exists(k.texture))

  let spawnAcc = 0
  let summonAcc = 0
  let elapsed = 0

  const isWalkable = (x: number, y: number): boolean => {
    const margin = MAP_MARGIN_TILES * ctx.tileSize
    if (x < margin || y < margin || x > ctx.worldW - margin || y > ctx.worldH - margin) return false
    const col = Math.floor(x / ctx.tileSize)
    const row = Math.floor(y / ctx.tileSize)
    return ctx.wallGrid[row]?.[col] === false
  }

  const findPointAround = (cx: number, cy: number, dMin: number, dMax: number): Phaser.Math.Vector2 | null => {
    for (let i = 0; i < SPAWN.retries; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Phaser.Math.FloatBetween(dMin, dMax)
      const x = cx + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      if (isWalkable(x, y)) return new Phaser.Math.Vector2(x, y)
    }
    return null
  }

  const pickKind = (): SurvivorEnemyKind | null => {
    const pool = availableKinds.filter(k => k.minTime <= elapsed)
    const total = pool.reduce((s, k) => s + k.weight, 0)
    if (total <= 0) return null
    let r = Math.random() * total
    for (const k of pool) {
      r -= k.weight
      if (r <= 0) return k
    }
    return pool[pool.length - 1]
  }

  const aliveCount = (): number => {
    let n = 0
    states.forEach(st => { if (!st.dead) n++ })
    return n
  }

  const spawn = (kind: SurvivorEnemyKind, x: number, y: number): void => {
    const sp = group.get(x, y, kind.texture) as SvEnemySprite | null
    if (!sp) return
    if (!sp.getData('svInit')) {
      sp.setData('svInit', true)
      ctx.addWorldObject(sp)
    }
    sp.setTexture(kind.texture)
    sp.enableBody(true, x, y, true, true)
    sp.setActive(true).setVisible(true).clearTint().setScale(kind.scale).setDepth(DEPTH_ENEMY)
    const body = sp.body as Phaser.Physics.Arcade.Body
    body.setSize(ENEMY_AI.bodyWidth, ENEMY_AI.bodyHeight, true)
    sp.setVelocity(0, 0)
    states.set(sp, { kind, hp: kind.hp, dead: false, lastShot: elapsed, knockUntil: 0, dir: 'down' })
    sp.play(`${kind.animPrefix}-walk-down`)
    sp.setAlpha(0)
    scene.tweens.add({ targets: sp, alpha: 1, duration: SPAWN_FADE_DURATION })
  }

  const kill = (sp: SvEnemySprite, st: SvEnemyState, notify: boolean): void => {
    st.dead = true
    sp.setVelocity(0, 0)
    ;(sp.body as Phaser.Physics.Arcade.Body).enable = false
    sp.clearTint()
    ctx.effects.blood(sp.x, sp.y, 14)
    ctx.effects.sparks(sp.x, sp.y, 6)
    const deadAnim = `${st.kind.animPrefix}-dead`
    if (scene.anims.exists(deadAnim)) sp.play(deadAnim)
    if (notify) ctx.onKill(sp.x, sp.y)
    scene.tweens.add({
      targets: sp,
      alpha: 0,
      delay: DEATH_FADE_DELAY,
      duration: DEATH_FADE_DURATION,
      onComplete: () => {
        // 撃破後に再利用されていない場合のみプールへ戻す
        if (states.get(sp) === st && sp.body) {
          states.delete(sp)
          sp.disableBody(true, true)
        }
      },
    })
  }

  const hit = (sp: SvEnemySprite, amount: number, srcX: number, srcY: number, knockback: boolean): boolean => {
    const st = states.get(sp)
    if (!st || st.dead) return false
    st.hp -= amount
    if (st.hp <= 0) {
      kill(sp, st, true)
      return true
    }
    sp.setTintFill(0xffffff)
    scene.time.delayedCall(70, () => {
      if (states.get(sp) === st && !st.dead) sp.clearTint()
    })
    if (knockback) {
      const away = new Phaser.Math.Vector2(sp.x - srcX, sp.y - srcY)
      if (away.lengthSq() < 1) away.set(Math.random() - 0.5, Math.random() - 0.5)
      away.normalize().scale(ENEMY_AI.knockbackSpeed)
      sp.setVelocity(away.x, away.y)
      st.knockUntil = elapsed + ENEMY_AI.knockbackDuration
    }
    return false
  }

  const updateSpawning = (delta: number, opts: EnemyFieldUpdateOptions): void => {
    if (!opts.spawning) return
    const ramp = Phaser.Math.Clamp(elapsed / SPAWN.rampDuration, 0, 1)
    let interval = Phaser.Math.Linear(SPAWN.intervalStart, SPAWN.intervalMin, ramp)
    let maxAlive: number = SPAWN.maxAlive
    if (opts.bossActive) {
      interval *= SPAWN.bossIntervalScale
      maxAlive = SPAWN.bossMaxAlive
    }

    spawnAcc += delta
    const perTick = 1 + Math.floor(elapsed / SPAWN.extraPerTickEvery)
    let alive = aliveCount()
    while (spawnAcc >= interval) {
      spawnAcc -= interval
      for (let i = 0; i < perTick && alive < maxAlive; i++) {
        const kind = pickKind()
        const p = findPointAround(player.x, player.y, SPAWN.distMin, SPAWN.distMax)
        if (!kind || !p) continue
        spawn(kind, p.x, p.y)
        alive++
      }
    }

    // ボス第2形態: ボスの周囲に眷属を召喚
    if (opts.bossActive && opts.bossPhase2) {
      summonAcc += delta
      if (summonAcc >= SPAWN.bossPhase2SummonInterval) {
        summonAcc = 0
        const kind = availableKinds[0]
        for (let i = 0; i < SPAWN.bossPhase2SummonCount && kind; i++) {
          const a = (i / SPAWN.bossPhase2SummonCount) * Math.PI * 2
          const x = opts.bossX + Math.cos(a) * SPAWN.bossPhase2SummonRadius
          const y = opts.bossY + Math.sin(a) * SPAWN.bossPhase2SummonRadius
          if (isWalkable(x, y)) {
            spawn(kind, x, y)
            ctx.effects.blood(x, y, 8)
          }
        }
      }
    }
  }

  const updateAI = (): void => {
    states.forEach((st, sp) => {
      if (st.dead || !sp.active) return
      const dx = player.x - sp.x
      const dy = player.y - sp.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 置き去りにされた敵は前方へ再配置
      if (dist > SPAWN.recycleDistance) {
        const p = findPointAround(player.x, player.y, SPAWN.distMin, SPAWN.distMax)
        if (p) sp.setPosition(p.x, p.y)
        return
      }

      if (elapsed < st.knockUntil) return

      const ranged = st.kind.ranged
      const prefix = st.kind.animPrefix
      if (ranged && dist <= ranged.range) {
        sp.setVelocity(0, 0)
        st.dir = getDirectionFromVelocity(dx, dy)
        if (elapsed - st.lastShot >= ranged.interval) {
          st.lastShot = elapsed
          const orb = fireOrbAt(scene, ctx.projectiles, sp.x, sp.y, player, ranged.speed, ranged.texture)
          orb.damage = ranged.damage
          orb.turnRate = ranged.turnRate
          sp.play(`${prefix}-atk-${st.dir}`, true)
        }
        const cur = sp.anims.currentAnim?.key ?? ''
        if (!cur.includes('-atk-') || !sp.anims.isPlaying) sp.play(`${prefix}-idle-${st.dir}`, true)
        return
      }

      if (dist > 1) {
        sp.setVelocity((dx / dist) * st.kind.speed, (dy / dist) * st.kind.speed)
        st.dir = getDirectionFromVelocity(dx, dy)
      }
      sp.play(`${prefix}-walk-${st.dir}`, true)
    })
  }

  return {
    group,
    update: (delta, opts) => {
      elapsed += delta
      updateSpawning(delta, opts)
      updateAI()
    },
    forEachAlive: (cb) => {
      states.forEach((st, sp) => { if (!st.dead && sp.active) cb(sp) })
    },
    isAlive: (sp) => {
      const st = states.get(sp)
      return !!st && !st.dead && sp.active
    },
    contactDamage: (sp) => states.get(sp)?.kind.damage ?? 0,
    hit,
    explodeAll: () => {
      states.forEach((st, sp) => {
        if (st.dead || !sp.active) return
        ctx.effects.fire(sp.x, sp.y, 10)
        kill(sp, st, false)
      })
    },
    freeze: () => {
      states.forEach((st, sp) => {
        if (!sp.active) return
        sp.setVelocity(0, 0)
        if (!st.dead) sp.anims.pause()
      })
    },
    destroy: () => {
      states.clear()
      group.destroy(true)
    },
  }
}
