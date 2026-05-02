import Phaser from 'phaser'

// MainScene の projectiles グループへのアクセス用インターフェース
interface SceneWithProjectiles extends Phaser.Scene {
  projectiles?: Phaser.Physics.Arcade.Group
  addWorldObject?: (go: Phaser.GameObjects.GameObject) => void
}

// アニメーション+回転飛び道具の型（SpriteWithDynamicBody ベース）
export type RotatingProjectile = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  damage: number
  bornAt: number
  life: number
  target: Phaser.GameObjects.Sprite | null
  speed: number
  turnRate: number
}

interface SceneWithRotatingProjectiles extends Phaser.Scene {
  rotatingProjectiles?: RotatingProjectile[]
  addWorldObject?: (go: Phaser.GameObjects.GameObject) => void
}

// 飛び道具の基本型
export type Projectile = Phaser.Physics.Arcade.Image & {
  damage: number
  bornAt: number
  life: number
}

// 火炎弾の型（プレイヤー遠距離攻撃）
export type FireBall = Phaser.Physics.Arcade.Image & {
  damage: number
  originX: number
  originY: number
}

// 誘導魔法弾の型
export type HomingOrb = Projectile & {
  target: Phaser.GameObjects.Sprite | null
  speed: number
  turnRate: number
}

/**
 * 矢を発射する
 */
export function fireArrow(
  scene: Phaser.Scene,
  from: Phaser.GameObjects.Sprite,
  to: Phaser.GameObjects.Sprite,
  speed = 420
): Projectile {
  const v = new Phaser.Math.Vector2(to.x - from.x, to.y - from.y).normalize().scale(speed)
  const group = (scene as SceneWithProjectiles).projectiles
  const proj = (group
    ? group.create(from.x, from.y, 'arrow')
    : scene.physics.add.image(from.x, from.y, 'arrow')) as Projectile

  proj.setVelocity(v.x, v.y)
  proj.damage = 1
  proj.bornAt = scene.time.now
  proj.life = 2500

  // 矢の向きを設定
  proj.setRotation(Phaser.Math.Angle.Between(0, 0, v.x, v.y))
  proj.setSize(32, 16)
  proj.setOffset(16, 24)

  // 寿命で自動消滅
  scene.time.delayedCall(proj.life, () => {
    if (proj.active) proj.destroy()
  })

  // 効果音（存在する場合）
  if (scene.sound.get('sfx_arrow')) {
    scene.sound.play('sfx_arrow', { volume: 0.7 })
  }

  ;(scene as SceneWithProjectiles).addWorldObject?.(proj)
  return proj
}

/**
 * 誘導魔法弾を発射する
 */
export function fireHomingOrb(
  scene: Phaser.Scene,
  from: Phaser.GameObjects.Sprite,
  target: Phaser.GameObjects.Sprite,
  speed = 220,
  turnRate = 6.0,
  life = 3000,
  textureKey = 'hert'
): HomingOrb {
  const group = (scene as SceneWithProjectiles).projectiles
  const orb = (group
    ? group.create(from.x, from.y, textureKey)
    : scene.physics.add.image(from.x, from.y, textureKey)) as HomingOrb

  orb.target = target
  orb.speed = speed
  orb.turnRate = turnRate
  orb.bornAt = scene.time.now
  orb.life = life
  orb.damage = 1

  // 初期速度をターゲット方向に設定
  const dir = new Phaser.Math.Vector2(target.x - from.x, target.y - from.y).normalize()
  orb.setVelocity(dir.x * speed, dir.y * speed)

  // グロー効果
  orb.setBlendMode(Phaser.BlendModes.ADD)
  orb.setScale(0.8)

  // 寿命で自動消滅
  scene.time.delayedCall(life, () => {
    if (orb.active) orb.destroy()
  })

  // 効果音（存在する場合）
  if (scene.sound.get('sfx_orb')) {
    scene.sound.play('sfx_orb', { volume: 0.6 })
  }

  // シーンの誘導弾リストに追加
  if (!(scene as any).homingOrbs) {
    (scene as any).homingOrbs = []
  }
  (scene as any).homingOrbs.push(orb)

  ;(scene as SceneWithProjectiles).addWorldObject?.(orb)
  return orb
}

/**
 * 矢を角度指定で発射（ボス用）
 */
export function updateHomingOrbs(scene: Phaser.Scene) {
  const list: HomingOrb[] = (scene as any).homingOrbs ?? []
  const now = scene.time.now

  list.forEach((orb, idx) => {
    // 寿命チェック
    if (now - orb.bornAt > orb.life) {
      orb.destroy()
      list[idx] = null as any
      return
    }

    // 非アクティブまたはターゲットが無効な場合はスキップ
    if (!orb.active || !orb.target || !orb.target.active) return

    // 現在の方向とターゲットへの方向を計算
    const desired = new Phaser.Math.Vector2(orb.target.x - orb.x, orb.target.y - orb.y).normalize()

    if (!orb.body) return // bodyが存在しない場合はスキップ
    const cur = new Phaser.Math.Vector2(orb.body.velocity.x, orb.body.velocity.y)

    if (cur.lengthSq() === 0) return // 速度がゼロの場合はスキップ
    cur.normalize()

    // 最大旋回角度（デルタ時間を考慮）
    const maxTurn = orb.turnRate * (scene.game.loop.delta / 1000)

    // 現在の方向とターゲット方向の角度差
    const currentAngle = Phaser.Math.Angle.BetweenPoints({ x: 0, y: 0 }, cur)
    const desiredAngle = Phaser.Math.Angle.BetweenPoints({ x: 0, y: 0 }, desired)
    const angleDiff = Phaser.Math.Angle.Wrap(desiredAngle - currentAngle)

    // 角度差を最大旋回角度でクランプ
    const clampedAngle = Phaser.Math.Clamp(angleDiff, -maxTurn, maxTurn)

    // 新しい方向を計算
    const newDir = cur.clone().rotate(clampedAngle).normalize()
    orb.setVelocity(newDir.x * orb.speed, newDir.y * orb.speed)
  })

  // 無効な弾を削除
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i] || !list[i].active) list.splice(i, 1)
  }
}

/**
 * 矢を角度指定で発射（ボス用）
 */
export function fireArrowAngle(
  scene: Phaser.Scene,
  projectiles: Phaser.Physics.Arcade.Group,
  x: number,
  y: number,
  angle: number,
  speed = 420
): Projectile {
  if (!projectiles) {
    throw new Error('[Projectile] projectiles group is undefined in fireArrowAngle')
  }
  const proj = projectiles.create(x, y, 'arrow') as Projectile

  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed
  proj.setVelocity(vx, vy)
  proj.damage = 1
  proj.bornAt = scene.time.now
  proj.life = 2500

  // 矢の向きを設定
  proj.setRotation(angle)
  proj.setSize(32, 16)
  proj.setOffset(16, 24)

  // 寿命で自動消滅
  scene.time.delayedCall(proj.life, () => {
    if (proj.active) proj.destroy()
  })

  ;(scene as SceneWithProjectiles).addWorldObject?.(proj)
  return proj
}

/**
 * 誘導魔法弾を座標指定で発射（ボス用）
 */
export function fireOrbAt(
  scene: Phaser.Scene,
  projectiles: Phaser.Physics.Arcade.Group,
  x: number,
  y: number,
  target: Phaser.GameObjects.Sprite,
  speed = 220,
  textureKey = 'orb'
): HomingOrb {
  if (!projectiles) {
    throw new Error('[Projectile] projectiles group is undefined in fireOrbAt')
  }
  const orb = projectiles.create(x, y, textureKey) as HomingOrb

  orb.target = target
  orb.speed = speed
  orb.turnRate = 6.0
  orb.bornAt = scene.time.now
  orb.life = 3000
  orb.damage = 1

  // 初期速度をターゲット方向に設定
  const dir = new Phaser.Math.Vector2(target.x - x, target.y - y).normalize()
  orb.setVelocity(dir.x * speed, dir.y * speed)

  // グロー効果
  orb.setBlendMode(Phaser.BlendModes.ADD)
  orb.setScale(0.8)

  // 寿命で自動消滅
  scene.time.delayedCall(orb.life, () => {
    if (orb.active) orb.destroy()
  })

  // シーンの誘導弾リストに追加
  if (!(scene as any).homingOrbs) {
    (scene as any).homingOrbs = []
  }
  (scene as any).homingOrbs.push(orb)

  ;(scene as SceneWithProjectiles).addWorldObject?.(orb)
  return orb
}

/**
 * アニメーション付き・回転追従する飛び道具を生成（ボスultimate用）
 * textureKey は spritesheet でロード済みであること
 */
export function createAnimatedOrbAt(
  scene: Phaser.Scene,
  projectiles: Phaser.Physics.Arcade.Group,
  x: number,
  y: number,
  target: Phaser.GameObjects.Sprite,
  speed: number,
  textureKey: string,
  frames: number
): RotatingProjectile {
  const sprite = scene.physics.add.sprite(x, y, textureKey) as RotatingProjectile

  // アニメーション登録（未登録のときのみ）
  const animKey = `${textureKey}-fly`
  if (!scene.anims.exists(animKey)) {
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: frames - 1 }),
      frameRate: 8,
      repeat: -1
    })
  }
  sprite.anims.play(animKey, true)

  // 追尾プロパティ
  sprite.target = target
  sprite.speed = speed
  sprite.turnRate = 6.0
  sprite.bornAt = scene.time.now
  sprite.life = 3000
  sprite.damage = 1
  sprite.setScale(0.8)

  // projectiles グループに追加（先にグループ追加してからvelocity設定）
  // ※ group.add() が body をリセットする場合があるため、velocity は後で設定する
  projectiles.add(sprite)

  // 初速度とプレイヤー方向への回転（group.add 後に設定）
  const dir = new Phaser.Math.Vector2(target.x - x, target.y - y).normalize()
  sprite.setVelocity(dir.x * speed, dir.y * speed)
  sprite.setRotation(Math.atan2(dir.y, dir.x))

  // 回転追従リストに登録
  const sceneExt = scene as SceneWithRotatingProjectiles
  if (!sceneExt.rotatingProjectiles) sceneExt.rotatingProjectiles = []
  sceneExt.rotatingProjectiles.push(sprite)

  // 寿命で自動消滅
  scene.time.delayedCall(sprite.life, () => {
    if (sprite.active) sprite.destroy()
  })

  sceneExt.addWorldObject?.(sprite)
  return sprite
}

/**
 * アニメーション付き飛び道具を毎フレーム更新（MainScene.update から呼ぶ）
 * 追尾 + 進行方向への回転を更新する
 */
export function updateRotatingProjectiles(scene: Phaser.Scene) {
  const sceneExt = scene as SceneWithRotatingProjectiles
  const list = sceneExt.rotatingProjectiles
  if (!list) return

  const now = scene.time.now

  for (let i = list.length - 1; i >= 0; i--) {
    const proj = list[i]

    if (!proj.active) {
      list.splice(i, 1)
      continue
    }

    if (now - proj.bornAt > proj.life) {
      proj.destroy()
      list.splice(i, 1)
      continue
    }

    if (!proj.target || !proj.target.active) continue

    const desired = new Phaser.Math.Vector2(proj.target.x - proj.x, proj.target.y - proj.y).normalize()

    const vel = proj.body.velocity
    const cur = new Phaser.Math.Vector2(vel.x, vel.y)

    // 速度がゼロの場合はターゲット方向に直接発射
    if (cur.lengthSq() === 0) {
      proj.setVelocity(desired.x * proj.speed, desired.y * proj.speed)
      proj.setRotation(Math.atan2(desired.y, desired.x))
      continue
    }
    cur.normalize()

    const maxTurn = proj.turnRate * (scene.game.loop.delta / 1000)
    const currentAngle = Phaser.Math.Angle.BetweenPoints({ x: 0, y: 0 }, cur)
    const desiredAngle = Phaser.Math.Angle.BetweenPoints({ x: 0, y: 0 }, desired)
    const angleDiff = Phaser.Math.Angle.Wrap(desiredAngle - currentAngle)
    const clampedAngle = Phaser.Math.Clamp(angleDiff, -maxTurn, maxTurn)
    const newDir = cur.clone().rotate(clampedAngle).normalize()

    proj.setVelocity(newDir.x * proj.speed, newDir.y * proj.speed)
    proj.setRotation(Math.atan2(newDir.y, newDir.x))
  }
}
