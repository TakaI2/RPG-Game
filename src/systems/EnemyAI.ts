import Phaser from 'phaser'
import { fireArrow, fireHomingOrb } from './Projectile'

// 基本の敵タイプ
export type EnemyWithAI = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  state: 'patrol' | 'chase' | 'attack' | 'return'
  speed: number
  hp: number
  patrolPoints: Phaser.Math.Vector2[]
  patrolIndex: number
}

// 遠距離攻撃敵（Archer）の状態
export type ArcherState = 'patrol' | 'aim' | 'shoot' | 'cooldown' | 'return'

export type Archer = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  enemyType: 'archer'
  state: ArcherState
  speed: number
  hp: number
  patrolPoints: Phaser.Math.Vector2[]
  patrolIndex: number
  sight: number
  cooldownTime: number
  lastShot: number
  aimDuration: number
  aimStart: number
}

// メイジの状態
export type MageState = 'patrol' | 'aim' | 'cast' | 'shoot' | 'cooldown' | 'return'

export type Mage = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  enemyType: 'mage'
  state: MageState
  speed: number
  hp: number
  patrolPoints: Phaser.Math.Vector2[]
  patrolIndex: number
  sight: number
  cooldownTime: number
  lastCast: number
  aimDuration: number
  castDuration: number
  aimStart: number
  castStart: number
}

// Bruteの状態
export type BruteState = 'patrol' | 'windup' | 'dash' | 'recover' | 'return'

export type Brute = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  enemyType: 'brute'
  state: BruteState
  speed: number
  dashSpeed: number
  hp: number
  patrolPoints: Phaser.Math.Vector2[]
  patrolIndex: number
  sight: number
  windupDuration: number
  dashDuration: number
  recoverDuration: number
  windupStart: number
  dashStart: number
  recoverStart: number
  dashDirection: Phaser.Math.Vector2 | null
}

export type AnyEnemy = EnemyWithAI | Archer | Mage | Brute

export function makeEnemy(scene: Phaser.Scene, x: number, y: number): EnemyWithAI {
  const en = scene.physics.add.sprite(x, y, 'enemy16').setScale(2) as EnemyWithAI
  en.state = 'patrol'
  en.speed = 180
  en.hp = 3
  en.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 10 * 32, y)]
  en.patrolIndex = 0
  return en
}

// Archer（弓兵）を生成
export function makeArcher(scene: Phaser.Scene, x: number, y: number): Archer {
  const archer = scene.physics.add.sprite(x, y, 'archer') as Archer
  archer.enemyType = 'archer'
  archer.state = 'patrol'
  archer.speed = 160
  archer.hp = 4
  archer.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 8 * 32, y)]
  archer.patrolIndex = 0
  archer.sight = 360
  archer.cooldownTime = 2000
  archer.lastShot = 0
  archer.aimDuration = 600
  archer.aimStart = 0
  return archer
}

// Mage（メイジ）を生成
export function makeMage(scene: Phaser.Scene, x: number, y: number): Mage {
  const mage = scene.physics.add.sprite(x, y, 'mage') as Mage
  mage.enemyType = 'mage'
  mage.state = 'patrol'
  mage.speed = 140
  mage.hp = 3
  mage.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 6 * 32, y)]
  mage.patrolIndex = 0
  mage.sight = 400
  mage.cooldownTime = 3000
  mage.lastCast = 0
  mage.aimDuration = 500
  mage.castDuration = 400
  mage.aimStart = 0
  mage.castStart = 0
  return mage
}

// Brute（突進戦士）を生成
export function makeBrute(scene: Phaser.Scene, x: number, y: number): Brute {
  const brute = scene.physics.add.sprite(x, y, 'brute') as Brute
  brute.enemyType = 'brute'
  brute.state = 'patrol'
  brute.speed = 120
  brute.dashSpeed = 480
  brute.hp = 8
  brute.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 5 * 32, y)]
  brute.patrolIndex = 0
  brute.sight = 280
  brute.windupDuration = 800
  brute.dashDuration = 600
  brute.recoverDuration = 1000
  brute.windupStart = 0
  brute.dashStart = 0
  brute.recoverStart = 0
  brute.dashDirection = null
  return brute
}

export function updateEnemyAI(scene: Phaser.Scene, en: EnemyWithAI, player: Phaser.Physics.Arcade.Sprite) {
  if (!en.active) return
  const dist = Phaser.Math.Distance.Between(en.x, en.y, player.x, player.y)
  const vision = 220, attackR = 44

  const moveTowards = (target: Phaser.Math.Vector2 | Phaser.GameObjects.Sprite, speed: number) => {
    const tx = (target as any).x
    const ty = (target as any).y
    const v = new Phaser.Math.Vector2(tx - en.x, ty - en.y).normalize().scale(speed)
    en.setVelocity(v.x, v.y)
  }

  switch (en.state) {
    case 'patrol': {
      const target = en.patrolPoints[en.patrolIndex]
      moveTowards(target, en.speed * 0.7)
      if (Phaser.Math.Distance.Between(en.x, en.y, target.x, target.y) < 8) {
        en.patrolIndex = (en.patrolIndex + 1) % en.patrolPoints.length
      }
      if (dist < vision) en.state = 'chase'
      break
    }
    case 'chase': {
      moveTowards(player, en.speed)
      if (dist < attackR) en.state = 'attack'
      if (dist > vision * 1.4) en.state = 'return'
      break
    }
    case 'attack': {
      if (dist < attackR) {
        player.setTint(0xffaaaa)
        scene.time.delayedCall(120, () => player.clearTint())
      }
      en.state = 'chase'
      break
    }
    case 'return': {
      const home = en.patrolPoints[0]
      moveTowards(home, en.speed * 0.8)
      if (Phaser.Math.Distance.Between(en.x, en.y, home.x, home.y) < 12) en.state = 'patrol'
      if (dist < vision) en.state = 'chase'
      break
    }
  }
}

// Archerの更新
export function updateArcherAI(scene: Phaser.Scene, archer: Archer, player: Phaser.Physics.Arcade.Sprite) {
  if (!archer.active) return

  const dist = Phaser.Math.Distance.Between(archer.x, archer.y, player.x, player.y)
  const now = scene.time.now

  const moveTowards = (target: Phaser.Math.Vector2 | Phaser.GameObjects.Sprite, speed: number) => {
    const tx = (target as any).x
    const ty = (target as any).y
    const v = new Phaser.Math.Vector2(tx - archer.x, ty - archer.y).normalize().scale(speed)
    archer.setVelocity(v.x, v.y)
  }

  switch (archer.state) {
    case 'patrol': {
      const target = archer.patrolPoints[archer.patrolIndex]
      moveTowards(target, archer.speed * 0.7)
      if (Phaser.Math.Distance.Between(archer.x, archer.y, target.x, target.y) < 8) {
        archer.patrolIndex = (archer.patrolIndex + 1) % archer.patrolPoints.length
      }
      if (dist < archer.sight) {
        archer.state = 'aim'
        archer.aimStart = now
        archer.setVelocity(0, 0)
      }
      break
    }
    case 'aim': {
      archer.setVelocity(0, 0)
      if (now - archer.aimStart >= archer.aimDuration) {
        archer.state = 'shoot'
      }
      break
    }
    case 'shoot': {
      // 矢を発射
      if (now - archer.lastShot >= archer.cooldownTime) {
        fireArrow(scene, archer, player, 420)
        archer.lastShot = now
        archer.state = 'cooldown'
      }
      break
    }
    case 'cooldown': {
      archer.setVelocity(0, 0)
      if (now - archer.lastShot >= archer.cooldownTime) {
        if (dist < archer.sight) {
          archer.state = 'aim'
          archer.aimStart = now
        } else {
          archer.state = 'return'
        }
      }
      break
    }
    case 'return': {
      const home = archer.patrolPoints[0]
      moveTowards(home, archer.speed * 0.8)
      if (Phaser.Math.Distance.Between(archer.x, archer.y, home.x, home.y) < 12) {
        archer.state = 'patrol'
      }
      if (dist < archer.sight) {
        archer.state = 'aim'
        archer.aimStart = now
      }
      break
    }
  }
}

// Mageの更新
export function updateMageAI(scene: Phaser.Scene, mage: Mage, player: Phaser.Physics.Arcade.Sprite) {
  if (!mage.active) return

  const dist = Phaser.Math.Distance.Between(mage.x, mage.y, player.x, player.y)
  const now = scene.time.now

  const moveTowards = (target: Phaser.Math.Vector2 | Phaser.GameObjects.Sprite, speed: number) => {
    const tx = (target as any).x
    const ty = (target as any).y
    const v = new Phaser.Math.Vector2(tx - mage.x, ty - mage.y).normalize().scale(speed)
    mage.setVelocity(v.x, v.y)
  }

  switch (mage.state) {
    case 'patrol': {
      const target = mage.patrolPoints[mage.patrolIndex]
      moveTowards(target, mage.speed * 0.7)
      if (Phaser.Math.Distance.Between(mage.x, mage.y, target.x, target.y) < 8) {
        mage.patrolIndex = (mage.patrolIndex + 1) % mage.patrolPoints.length
      }
      if (dist < mage.sight) {
        mage.state = 'aim'
        mage.aimStart = now
        mage.setVelocity(0, 0)
      }
      break
    }
    case 'aim': {
      mage.setVelocity(0, 0)
      if (now - mage.aimStart >= mage.aimDuration) {
        mage.state = 'cast'
        mage.castStart = now
      }
      break
    }
    case 'cast': {
      mage.setVelocity(0, 0)
      if (now - mage.castStart >= mage.castDuration) {
        mage.state = 'shoot'
      }
      break
    }
    case 'shoot': {
      // 誘導魔法弾を発射
      if (now - mage.lastCast >= mage.cooldownTime) {
        fireHomingOrb(scene, mage, player, 220, 6.0, 3000)
        mage.lastCast = now
        mage.state = 'cooldown'
      }
      break
    }
    case 'cooldown': {
      mage.setVelocity(0, 0)
      if (now - mage.lastCast >= mage.cooldownTime) {
        if (dist < mage.sight) {
          mage.state = 'aim'
          mage.aimStart = now
        } else {
          mage.state = 'return'
        }
      }
      break
    }
    case 'return': {
      const home = mage.patrolPoints[0]
      moveTowards(home, mage.speed * 0.8)
      if (Phaser.Math.Distance.Between(mage.x, mage.y, home.x, home.y) < 12) {
        mage.state = 'patrol'
      }
      if (dist < mage.sight) {
        mage.state = 'aim'
        mage.aimStart = now
      }
      break
    }
  }
}

// Bruteの更新
export function updateBruteAI(scene: Phaser.Scene, brute: Brute, player: Phaser.Physics.Arcade.Sprite) {
  if (!brute.active) return

  const dist = Phaser.Math.Distance.Between(brute.x, brute.y, player.x, player.y)
  const now = scene.time.now

  const moveTowards = (target: Phaser.Math.Vector2 | Phaser.GameObjects.Sprite, speed: number) => {
    const tx = (target as any).x
    const ty = (target as any).y
    const v = new Phaser.Math.Vector2(tx - brute.x, ty - brute.y).normalize().scale(speed)
    brute.setVelocity(v.x, v.y)
  }

  switch (brute.state) {
    case 'patrol': {
      const target = brute.patrolPoints[brute.patrolIndex]
      moveTowards(target, brute.speed * 0.7)
      if (Phaser.Math.Distance.Between(brute.x, brute.y, target.x, target.y) < 8) {
        brute.patrolIndex = (brute.patrolIndex + 1) % brute.patrolPoints.length
      }
      if (dist < brute.sight) {
        brute.state = 'windup'
        brute.windupStart = now
        brute.setVelocity(0, 0)
        // 突進方向を記録
        brute.dashDirection = new Phaser.Math.Vector2(player.x - brute.x, player.y - brute.y).normalize()
      }
      break
    }
    case 'windup': {
      brute.setVelocity(0, 0)
      // 溜めエフェクト（色を変える）
      brute.setTint(0xff8888)
      if (now - brute.windupStart >= brute.windupDuration) {
        brute.state = 'dash'
        brute.dashStart = now
        brute.clearTint()
      }
      break
    }
    case 'dash': {
      // 突進
      if (brute.dashDirection) {
        brute.setVelocity(
          brute.dashDirection.x * brute.dashSpeed,
          brute.dashDirection.y * brute.dashSpeed
        )
      }
      if (now - brute.dashStart >= brute.dashDuration) {
        brute.state = 'recover'
        brute.recoverStart = now
        brute.setVelocity(0, 0)
      }
      break
    }
    case 'recover': {
      brute.setVelocity(0, 0)
      // 硬直エフェクト（少し暗く）
      brute.setTint(0x888888)
      if (now - brute.recoverStart >= brute.recoverDuration) {
        brute.clearTint()
        brute.state = 'return'
      }
      break
    }
    case 'return': {
      const home = brute.patrolPoints[0]
      moveTowards(home, brute.speed * 0.8)
      if (Phaser.Math.Distance.Between(brute.x, brute.y, home.x, home.y) < 12) {
        brute.state = 'patrol'
      }
      if (dist < brute.sight) {
        brute.state = 'windup'
        brute.windupStart = now
        brute.dashDirection = new Phaser.Math.Vector2(player.x - brute.x, player.y - brute.y).normalize()
      }
      break
    }
  }
}
