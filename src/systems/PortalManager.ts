import Phaser from 'phaser'

export type FullPortalData = {
  x: number       // タイル座標（map JSON由来）
  y: number
  spriteKey?: string
  rotation?: number  // 度単位 (0 / 90 / 180 / 270)
  animated?: boolean
  frameCount?: number
  frameRate?: number
  targetMap: string
  targetX: number  // gameflow.json由来
  targetY: number
}

export class PortalManager {
  private scene: Phaser.Scene
  private sprites: (Phaser.Physics.Arcade.Image | Phaser.Physics.Arcade.Sprite)[]
  private colliders: Phaser.Physics.Arcade.Collider[]

  constructor(scene: Phaser.Scene, portals: FullPortalData[], tileSize: number) {
    this.scene = scene
    this.sprites = []
    this.colliders = []

    portals.forEach(p => {
      const key = p.spriteKey ?? 'door'
      const px = p.x * tileSize + tileSize / 2
      const py = p.y * tileSize + tileSize / 2

      let sprite: Phaser.Physics.Arcade.Image | Phaser.Physics.Arcade.Sprite
      if (p.animated) {
        const animKey = `portal-anim-${key}`
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(key, { start: 0, end: (p.frameCount ?? 4) - 1 }),
            frameRate: p.frameRate ?? 8,
            repeat: -1,
          })
        }
        const s = scene.physics.add.staticSprite(px, py, key, 0)
        s.play(animKey)
        sprite = s
      } else {
        sprite = scene.physics.add.staticImage(px, py, key, 0)
      }

      sprite.setData('portal', p)
      sprite.setDepth(5)
      if (p.rotation) sprite.setAngle(p.rotation)
      this.sprites.push(sprite)
    })
  }

  setupOverlap(
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    onTeleport: (p: FullPortalData) => void
  ) {
    this.sprites.forEach(sprite => {
      const collider = this.scene.physics.add.overlap(player, sprite, () => {
        const portalData = sprite.getData('portal') as FullPortalData
        onTeleport(portalData)
      })
      this.colliders.push(collider)
    })
  }

  destroy() {
    this.colliders.forEach(c => { if (c.active) c.destroy() })
    this.colliders = []
    this.sprites.forEach(s => s.destroy())
    this.sprites = []
  }
}
