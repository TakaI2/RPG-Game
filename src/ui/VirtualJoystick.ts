import Phaser from 'phaser'

/**
 * 仮想ジョイスティック
 * マウス/タッチ操作でプレイヤーを移動するためのUI
 */
export class VirtualJoystick {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private base: Phaser.GameObjects.Arc
  private stick: Phaser.GameObjects.Arc
  private isDragging: boolean = false
  private startX: number = 0
  private startY: number = 0
  private maxDistance: number = 60 // ジョイスティックの最大移動距離

  public vector: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0)
  public isActive: boolean = false

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene
    this.container = scene.add.container(x, y).setDepth(9000).setScrollFactor(0)

    // ベース（外側の円）
    this.base = scene.add.circle(0, 0, 70, 0x000000, 0.3)
    this.base.setStrokeStyle(3, 0xffffff, 0.6)

    // スティック（内側の円）
    this.stick = scene.add.circle(0, 0, 40, 0xffffff, 0.5)
    this.stick.setStrokeStyle(3, 0xffffff, 0.8)

    this.container.add([this.base, this.stick])
    this.container.setVisible(false)

    this.setupInput()
  }

  private setupInput() {
    // ポインターダウン
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 画面左半分のみ反応
      if (pointer.x < this.scene.scale.width / 2) {
        this.startDrag(pointer.x, pointer.y)
      }
    })

    // ポインタームーブ
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        this.updateDrag(pointer.x, pointer.y)
      }
    })

    // ポインターアップ
    this.scene.input.on('pointerup', () => {
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
      // 最大距離を超えないようにクランプ
      const clampedDistance = Math.min(distance, this.maxDistance)
      const angle = Math.atan2(dy, dx)

      const stickX = Math.cos(angle) * clampedDistance
      const stickY = Math.sin(angle) * clampedDistance

      this.stick.setPosition(stickX, stickY)

      // 正規化されたベクトルを計算（-1〜1の範囲）
      this.vector.x = (dx / this.maxDistance)
      this.vector.y = (dy / this.maxDistance)

      // クランプ（-1〜1の範囲に制限）
      this.vector.x = Phaser.Math.Clamp(this.vector.x, -1, 1)
      this.vector.y = Phaser.Math.Clamp(this.vector.y, -1, 1)
    }
  }

  private endDrag() {
    this.isDragging = false
    this.isActive = false
    this.container.setVisible(false)
    this.stick.setPosition(0, 0)
    this.vector.set(0, 0)
  }

  /**
   * 方向ベクトルを取得（-1〜1の範囲）
   */
  getVector(): Phaser.Math.Vector2 {
    return this.vector
  }

  /**
   * ジョイスティックが操作されているか
   */
  get active(): boolean {
    return this.isActive
  }

  /**
   * 表示/非表示を設定
   */
  setVisible(visible: boolean) {
    // ドラッグ中でない場合のみ変更可能
    if (!this.isDragging) {
      this.container.setVisible(visible)
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.container.destroy()
  }
}
