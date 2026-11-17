import Phaser from 'phaser'
import { BLADE } from './SurvivorConfig'

/**
 * ブーメラン刃。一定間隔で狙った方向へ飛び、弧を描いてプレイヤーの元へ戻る。
 * 往路・復路とも貫通してダメージを与える（当たりは距離判定）。
 */

type Target = Phaser.GameObjects.Components.Transform & { active: boolean }

export interface BladeHooks {
  /** 生存中の雑魚を列挙 */
  forEachEnemy(cb: (enemy: Phaser.Physics.Arcade.Sprite) => void): void
  hitEnemy(enemy: Phaser.Physics.Arcade.Sprite, damage: number, x: number, y: number): void
  /** 当たり判定対象のボス（起動中で生存していなければ null） */
  getBoss(): Phaser.Physics.Arcade.Sprite | null
  hitBoss(damage: number, x: number, y: number): void
  onThrow(): void
}

export interface SurvivorBlades {
  update(delta: number, count: number, damage: number, facing: Phaser.Math.Vector2): void
  freeze(): void
  clear(): void
  destroy(): void
}

interface BladeState {
  img: Phaser.GameObjects.Image
  returning: boolean
  t: number
  startX: number
  startY: number
  dirX: number
  dirY: number
  speed: number
  /** 対象ごとの次にヒット可能な時刻 */
  hitReady: Map<Phaser.GameObjects.GameObject, number>
}

const RETURN_ACCEL_SCALE = 1.5

export function createSurvivorBlades(
  scene: Phaser.Scene,
  player: Target,
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void,
  hooks: BladeHooks,
): SurvivorBlades {
  const pool: Phaser.GameObjects.Image[] = []
  const blades: BladeState[] = []
  let throwAcc = 0
  let clock = 0
  let frozen = false
  const hasTexture = scene.textures.exists(BLADE.texture)

  const obtain = (): Phaser.GameObjects.Image => {
    const free = pool.find(img => !img.active)
    if (free) return free
    const img = scene.add.image(0, 0, hasTexture ? BLADE.texture : '__WHITE')
    addWorldObject(img)
    pool.push(img)
    return img
  }

  const nearestEnemyDir = (): Phaser.Math.Vector2 | null => {
    let best = Number.POSITIVE_INFINITY
    let dir: Phaser.Math.Vector2 | null = null
    hooks.forEachEnemy(sp => {
      const d = Phaser.Math.Distance.Squared(player.x, player.y, sp.x, sp.y)
      if (d < best && d > 1) {
        best = d
        dir = new Phaser.Math.Vector2(sp.x - player.x, sp.y - player.y)
      }
    })
    return dir
  }

  const throwBlades = (count: number, facing: Phaser.Math.Vector2): void => {
    const aim = nearestEnemyDir() ?? facing.clone()
    if (aim.lengthSq() < 1e-6) aim.set(0, 1)
    const base = Math.atan2(aim.y, aim.x)
    const spread = Phaser.Math.DegToRad(BLADE.spreadDeg)
    for (let i = 0; i < count; i++) {
      // 0, +1, -1, +2, -2 … の順で扇状に開く
      const k = Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1)
      const a = base + k * spread
      const img = obtain()
      img.setActive(true).setVisible(true).setPosition(player.x, player.y)
        .setScale(BLADE.scale).setDepth(BLADE.depth).setAlpha(1)
        .setBlendMode(Phaser.BlendModes.ADD)
      blades.push({
        img,
        returning: false,
        t: 0,
        startX: player.x,
        startY: player.y,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        speed: BLADE.returnSpeed,
        hitReady: new Map(),
      })
    }
    hooks.onThrow()
  }

  const tryHit = (b: BladeState, damage: number): void => {
    const r2 = BLADE.hitRadius * BLADE.hitRadius
    const x = b.img.x
    const y = b.img.y
    const ready = (go: Phaser.GameObjects.GameObject): boolean => (b.hitReady.get(go) ?? 0) <= clock

    hooks.forEachEnemy(sp => {
      if (!ready(sp)) return
      const reach = BLADE.hitRadius + sp.displayWidth * 0.25
      if (Phaser.Math.Distance.Squared(x, y, sp.x, sp.y) > Math.max(r2, reach * reach)) return
      b.hitReady.set(sp, clock + BLADE.rehitCooldown)
      hooks.hitEnemy(sp, damage, x, y)
    })

    const boss = hooks.getBoss()
    if (boss && ready(boss)) {
      const reach = BLADE.hitRadius + boss.displayWidth * 0.3
      if (Phaser.Math.Distance.Squared(x, y, boss.x, boss.y) <= reach * reach) {
        b.hitReady.set(boss, clock + BLADE.rehitCooldown)
        hooks.hitBoss(Math.max(1, Math.round(damage * BLADE.bossDamageScale)), x, y)
      }
    }
  }

  const release = (b: BladeState): void => {
    b.img.setActive(false).setVisible(false)
  }

  const updateBlade = (b: BladeState, delta: number, damage: number): boolean => {
    b.t += delta
    b.img.rotation += Phaser.Math.DegToRad(BLADE.spinDegPerSec) * (delta / 1000)

    if (!b.returning) {
      const p = Math.min(1, b.t / BLADE.outDuration)
      const e = Phaser.Math.Easing.Cubic.Out(p)
      b.img.setPosition(b.startX + b.dirX * BLADE.outDistance * e, b.startY + b.dirY * BLADE.outDistance * e)
      if (p >= 1) {
        b.returning = true
        b.t = 0
        b.hitReady.clear()   // 復路でも同じ敵に当たる
      }
    } else {
      const dx = player.x - b.img.x
      const dy = player.y - b.img.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= BLADE.returnCatchRadius || b.t >= BLADE.maxReturnMs) {
        release(b)
        return false
      }
      b.speed += BLADE.returnSpeed * RETURN_ACCEL_SCALE * (delta / 1000)
      const step = Math.min(dist, b.speed * (delta / 1000))
      b.img.setPosition(b.img.x + (dx / dist) * step, b.img.y + (dy / dist) * step)
    }
    tryHit(b, damage)
    return true
  }

  const clear = (): void => {
    blades.forEach(release)
    blades.length = 0
    throwAcc = 0
    frozen = false
  }

  return {
    update: (delta, count, damage, facing) => {
      if (frozen) return
      clock += delta
      if (count > 0) {
        throwAcc += delta
        if (throwAcc >= BLADE.interval) {
          throwAcc = 0
          throwBlades(count, facing)
        }
      }
      for (let i = blades.length - 1; i >= 0; i--) {
        if (!updateBlade(blades[i], delta, damage)) blades.splice(i, 1)
      }
    },
    freeze: () => { frozen = true },
    clear,
    destroy: () => {
      blades.length = 0
      pool.forEach(img => img.destroy())
      pool.length = 0
    },
  }
}
