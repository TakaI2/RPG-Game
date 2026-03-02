import Phaser from 'phaser'

export type FullPortalData = {
  x: number       // タイル座標（map JSON由来）
  y: number
  targetMap: string
  targetX: number  // gameflow.json由来
  targetY: number
}

export class PortalManager {
  private scene: Phaser.Scene
  private sprites: Phaser.Physics.Arcade.Image[]
  private colliders: Phaser.Physics.Arcade.Collider[]

  constructor(scene: Phaser.Scene, portals: FullPortalData[], tileSize: number) {
    this.scene = scene
    this.sprites = []
    this.colliders = []

    portals.forEach(p => {
      const sprite = scene.physics.add.staticImage(
        p.x * tileSize + tileSize / 2,
        p.y * tileSize + tileSize / 2,
        'door',
        0
      )
      sprite.setData('portal', p)
      sprite.setDepth(5)
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
