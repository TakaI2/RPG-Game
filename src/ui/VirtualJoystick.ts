import Phaser from 'phaser'

export class VirtualJoystick {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private base: Phaser.GameObjects.Arc
  private stick: Phaser.GameObjects.Arc
  private isDragging: boolean = false
  private startX: number = 0
  private startY: number = 0
  private maxDistance: number = 60
  private activePointerId: number | null = null

  public vector: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0)
  public isActive: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(0, 0).setDepth(9000).setScrollFactor(0)

    this.base = scene.add.circle(0, 0, 70, 0x000000, 0.3)
    this.base.setStrokeStyle(3, 0xffffff, 0.6)

    this.stick = scene.add.circle(0, 0, 40, 0xffffff, 0.5)
    this.stick.setStrokeStyle(3, 0xffffff, 0.8)

    this.container.add([this.base, this.stick])
    this.container.setVisible(false)

    this.setupInput()
  }

  private setupInput() {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 画面左半分のみ、かつ別の指でドラッグ中でない場合
      if (pointer.x >= this.scene.scale.width / 2) return
      if (this.activePointerId !== null) return
      this.activePointerId = pointer.id
      this.startDrag(pointer.x, pointer.y)
    })

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || pointer.id !== this.activePointerId) return
      this.updateDrag(pointer.x, pointer.y)
    })

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.activePointerId) return
      this.activePointerId = null
      this.endDrag()
    })
  }

  private startDrag(x: number, y: number) {
    this.isDragging = true
    this.isActive = true
    this.startX = x
    this.startY = y
    this.container.setPosition(x, y)
    this.container.setVisible(true)
  }

  private updateDrag(x: number, y: number) {
    const dx = x - this.startX
    const dy = y - this.startY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > 0) {
      const clampedDistance = Math.min(distance, this.maxDistance)
      const angle = Math.atan2(dy, dx)
      this.stick.setPosition(Math.cos(angle) * clampedDistance, Math.sin(angle) * clampedDistance)
      this.vector.x = Phaser.Math.Clamp(dx / this.maxDistance, -1, 1)
      this.vector.y = Phaser.Math.Clamp(dy / this.maxDistance, -1, 1)
    }
  }

  private endDrag() {
    this.isDragging = false
    this.isActive = false
    this.container.setVisible(false)
    this.stick.setPosition(0, 0)
    this.vector.set(0, 0)
  }

  getContainer(): Phaser.GameObjects.Container { return this.container }

  getVector(): Phaser.Math.Vector2 {
    return this.vector
  }

  get active(): boolean {
    return this.isActive
  }

  setVisible(visible: boolean) {
    if (!this.isDragging) {
      this.container.setVisible(visible)
    }
  }

  destroy() {
    this.container.destroy()
  }
}
