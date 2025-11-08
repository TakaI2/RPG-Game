import Phaser from 'phaser'

// 飛び道具の基本型
export type Projectile = Phaser.Physics.Arcade.Image & {
  damage: number
  bornAt: number
  life: number
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
  const proj = scene.physics.add.image(from.x, from.y, 'arrow') as Projectile

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
  life = 3000
): HomingOrb {
  const orb = scene.physics.add.image(from.x, from.y, 'orb') as HomingOrb

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

  return orb
}

/**
 * すべての誘導魔法弾を更新する（シーンのupdateで呼ぶ）
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
