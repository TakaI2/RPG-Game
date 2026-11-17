import Phaser from 'phaser'
import { REFLECT } from './SurvivorConfig'

/**
 * 斬撃で弾き返した敵弾（反射弾）。
 * 敵弾は寿命タイマーや追尾リスト、ボスの発射待ちタイマーに紐づいているため書き換えず、
 * 「敵弾を消して、同じ見た目の反射弾を新しく出す」方式にしている。
 * 反射弾は物理ボディを持たず、当たりは距離判定（ブーメラン刃と同じ）。
 */

export type EnemyShot = Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image

export interface ReflectHooks {
  forEachEnemy(cb: (enemy: Phaser.Physics.Arcade.Sprite) => void): void
  /** 狙えるボス（起動中で生存していなければ null） */
  getBoss(): Phaser.Physics.Arcade.Sprite | null
  hitEnemy(enemy: Phaser.Physics.Arcade.Sprite, damage: number, x: number, y: number): void
  hitBoss(damage: number, x: number, y: number): void
}

export interface SurvivorReflect {
  /** 範囲内にある敵弾を列挙する */
  findInRange(projectiles: Phaser.Physics.Arcade.Group, x: number, y: number, radius: number): EnemyShot[]
  /** 敵弾を消して反射弾を出す。弾いた位置（演出用）を返す */
  reflect(shots: readonly EnemyShot[], fromX: number, fromY: number, damage: number, bossDamage: number): Phaser.Math.Vector2[]
  update(delta: number): void
  freeze(): void
  clear(): void
  activeCount(): number
  destroy(): void
}

interface ReflectState {
  sprite: Phaser.GameObjects.Sprite
  vx: number
  vy: number
  age: number
  damage: number
  bossDamage: number
}

const isShot = (go: Phaser.GameObjects.GameObject): go is EnemyShot =>
  go instanceof Phaser.Physics.Arcade.Sprite || go instanceof Phaser.Physics.Arcade.Image

export function createSurvivorReflect(
  scene: Phaser.Scene,
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void,
  hooks: ReflectHooks,
): SurvivorReflect {
  const pool: Phaser.GameObjects.Sprite[] = []
  const shots: ReflectState[] = []
  let frozen = false

  const obtain = (): Phaser.GameObjects.Sprite => {
    const free = pool.find(sp => !sp.active)
    if (free) return free
    const sp = scene.add.sprite(0, 0, '__WHITE')
    addWorldObject(sp)
    pool.push(sp)
    return sp
  }

  const release = (st: ReflectState): void => {
    // シーン終了時は表示物が先に破棄されている（anims が無い）ため触らない
    if (!st.sprite.scene) return
    st.sprite.anims.stop()
    st.sprite.setActive(false).setVisible(false)
  }

  /** ボス優先、なければ seekRange 内の最寄りの敵 */
  const findTarget = (x: number, y: number): Phaser.Physics.Arcade.Sprite | null => {
    const boss = hooks.getBoss()
    if (boss) return boss
    // コールバック内の代入は TS の絞り込みが効かないため、入れ物に入れる
    const found: { sp: Phaser.Physics.Arcade.Sprite | null; d: number } = {
      sp: null,
      d: REFLECT.seekRange * REFLECT.seekRange,
    }
    hooks.forEachEnemy(sp => {
      const d = Phaser.Math.Distance.Squared(x, y, sp.x, sp.y)
      if (d < found.d) {
        found.d = d
        found.sp = sp
      }
    })
    return found.sp
  }

  const steer = (st: ReflectState, dt: number): void => {
    const target = findTarget(st.sprite.x, st.sprite.y)
    if (!target) return
    const cur = Math.atan2(st.vy, st.vx)
    const want = Math.atan2(target.y - st.sprite.y, target.x - st.sprite.x)
    const diff = Phaser.Math.Angle.Wrap(want - cur)
    const turn = Phaser.Math.Clamp(diff, -REFLECT.turnRate * dt, REFLECT.turnRate * dt)
    const a = cur + turn
    st.vx = Math.cos(a) * REFLECT.speed
    st.vy = Math.sin(a) * REFLECT.speed
  }

  /** 当たったら true（1発で消える） */
  const tryHit = (st: ReflectState): boolean => {
    const x = st.sprite.x
    const y = st.sprite.y
    const boss = hooks.getBoss()
    if (boss) {
      const reach = REFLECT.hitRadius + boss.displayWidth * 0.3
      if (Phaser.Math.Distance.Squared(x, y, boss.x, boss.y) <= reach * reach) {
        hooks.hitBoss(st.bossDamage, x, y)
        return true
      }
    }
    const hit: { sp: Phaser.Physics.Arcade.Sprite | null } = { sp: null }
    hooks.forEachEnemy(sp => {
      if (hit.sp) return
      const reach = REFLECT.hitRadius + sp.displayWidth * 0.25
      if (Phaser.Math.Distance.Squared(x, y, sp.x, sp.y) <= reach * reach) hit.sp = sp
    })
    if (!hit.sp) return false
    hooks.hitEnemy(hit.sp, st.damage, x, y)
    return true
  }

  return {
    findInRange: (projectiles, x, y, radius) => {
      const r2 = radius * radius
      const found: EnemyShot[] = []
      projectiles.getChildren().forEach(go => {
        if (!go.active || !isShot(go)) return
        if (Phaser.Math.Distance.Squared(x, y, go.x, go.y) <= r2) found.push(go)
      })
      return found
    },
    reflect: (list, fromX, fromY, damage, bossDamage) => {
      const points: Phaser.Math.Vector2[] = []
      list.forEach(shot => {
        const x = shot.x
        const y = shot.y
        points.push(new Phaser.Math.Vector2(x, y))
        if (shots.length < REFLECT.max) {
          const sp = obtain()
          const frame = shot.frame
          sp.setTexture(frame.texture.key, frame.name)
          sp.setPosition(x, y).setScale(shot.scaleX, shot.scaleY).setAlpha(1)
            .setActive(true).setVisible(true).setDepth(REFLECT.depth)
            .setTint(REFLECT.tint).setBlendMode(Phaser.BlendModes.ADD)
          const animKey = shot instanceof Phaser.GameObjects.Sprite ? shot.anims.currentAnim?.key : undefined
          if (animKey) sp.play(animKey)
          // プレイヤーから外向きに跳ね返す
          const away = new Phaser.Math.Vector2(x - fromX, y - fromY)
          if (away.lengthSq() < 1) away.setToPolar(Math.random() * Math.PI * 2, 1)
          away.normalize()
          sp.setRotation(Math.atan2(away.y, away.x))
          shots.push({
            sprite: sp,
            vx: away.x * REFLECT.speed,
            vy: away.y * REFLECT.speed,
            age: 0,
            damage,
            bossDamage,
          })
        }
        shot.destroy()
      })
      return points
    },
    update: (delta) => {
      if (frozen) return
      const dt = delta / 1000
      for (let i = shots.length - 1; i >= 0; i--) {
        const st = shots[i]
        st.age += delta
        if (st.age >= REFLECT.life) {
          release(st)
          shots.splice(i, 1)
          continue
        }
        steer(st, dt)
        st.sprite.x += st.vx * dt
        st.sprite.y += st.vy * dt
        st.sprite.setRotation(Math.atan2(st.vy, st.vx))
        if (tryHit(st)) {
          release(st)
          shots.splice(i, 1)
        }
      }
    },
    freeze: () => {
      frozen = true
      shots.forEach(st => st.sprite.anims.pause())
    },
    clear: () => {
      shots.forEach(release)
      shots.length = 0
      frozen = false
    },
    activeCount: () => shots.length,
    destroy: () => {
      shots.length = 0
      pool.forEach(sp => sp.destroy())
      pool.length = 0
    },
  }
}
