import Phaser from 'phaser'

const LONG_PRESS_MS = 300

export class AttackButton {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private button: Phaser.GameObjects.Arc
  private icon: Phaser.GameObjects.Text
  private isPressed: boolean = false
  private isLongPressed: boolean = false
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private onAttackCallback: (() => void) | null = null
  private onSpecialStartCallback: (() => void) | null = null
  private onSpecialEndCallback: (() => void) | null = null

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene
    this.container = scene.add.container(x, y).setDepth(9000).setScrollFactor(0)

    this.button = scene.add.circle(0, 0, 50, 0xff3333, 0.7)
    this.button.setStrokeStyle(4, 0xffffff, 0.9)
    this.button.setInteractive({ useHandCursor: true })

    this.icon = scene.add.text(0, 0, '⚔', {
      fontSize: '48px',
      color: '#ffffff'
    }).setOrigin(0.5)

    this.container.add([this.button, this.icon])
    this.setupInput()
  }

  private setupInput() {
    this.button.on('pointerover', () => {
      this.button.setFillStyle(0xff5555, 0.9)
      this.button.setScale(1.1)
    })

    this.button.on('pointerout', () => {
      if (!this.isPressed) {
        this.button.setFillStyle(0xff3333, 0.7)
        this.button.setScale(1.0)
      }
      this.cancelLongPress()
    })

    this.button.on('pointerdown', () => {
      this.isPressed = true
      this.isLongPressed = false
      this.button.setFillStyle(0xff0000, 1.0)
      this.button.setScale(0.95)

      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null
        this.isLongPressed = true
        // 長押し判定: 特殊攻撃開始
        this.button.setFillStyle(0xff6600, 1.0)
        this.button.setScale(1.05)
        if (this.onSpecialStartCallback) {
          this.onSpecialStartCallback()
        }
      }, LONG_PRESS_MS)
    })

    this.button.on('pointerup', () => {
      this.isPressed = false
      this.button.setFillStyle(0xff3333, 0.7)
      this.button.setScale(1.0)

      if (this.isLongPressed) {
        // 長押し解除: 特殊攻撃終了
        this.isLongPressed = false
        if (this.onSpecialEndCallback) {
          this.onSpecialEndCallback()
        }
      } else {
        // 短タップ: 通常攻撃
        this.cancelLongPress()
        if (this.onAttackCallback) {
          this.onAttackCallback()
        }
      }
    })
  }

  private cancelLongPress() {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }
    if (this.isLongPressed) {
      this.isLongPressed = false
      if (this.onSpecialEndCallback) {
        this.onSpecialEndCallback()
      }
    }
  }

  setOnAttack(callback: () => void) {
    this.onAttackCallback = callback
  }

  setOnSpecialStart(callback: () => void) {
    this.onSpecialStartCallback = callback
  }

  setOnSpecialEnd(callback: () => void) {
    this.onSpecialEndCallback = callback
  }

  setVisible(visible: boolean) {
    this.container.setVisible(visible)
  }

  destroy() {
    this.cancelLongPress()
    this.container.destroy()
  }
}
