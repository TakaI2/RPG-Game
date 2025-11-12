import Phaser from 'phaser'

/**
 * 攻撃ボタン
 * マウス/タッチで攻撃を実行するためのUI
 */
export class AttackButton {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private button: Phaser.GameObjects.Arc
  private icon: Phaser.GameObjects.Text
  private isPressed: boolean = false
  private onAttackCallback: (() => void) | null = null

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene
    this.container = scene.add.container(x, y).setDepth(9000).setScrollFactor(0)

    // ボタン本体（円形）
    this.button = scene.add.circle(0, 0, 50, 0xff3333, 0.7)
    this.button.setStrokeStyle(4, 0xffffff, 0.9)
    this.button.setInteractive({ useHandCursor: true })

    // アイコン（剣マーク）
    this.icon = scene.add.text(0, 0, '⚔', {
      fontSize: '48px',
      color: '#ffffff'
    }).setOrigin(0.5)

    this.container.add([this.button, this.icon])

    this.setupInput()
  }

  private setupInput() {
    // ポインターオーバー
    this.button.on('pointerover', () => {
      this.button.setFillStyle(0xff5555, 0.9)
      this.button.setScale(1.1)
    })

    // ポインターアウト
    this.button.on('pointerout', () => {
      if (!this.isPressed) {
        this.button.setFillStyle(0xff3333, 0.7)
        this.button.setScale(1.0)
      }
    })

    // ポインターダウン
    this.button.on('pointerdown', () => {
      this.isPressed = true
      this.button.setFillStyle(0xff0000, 1.0)
      this.button.setScale(0.95)

      // 攻撃実行
      if (this.onAttackCallback) {
        this.onAttackCallback()
      }
    })

    // ポインターアップ
    this.button.on('pointerup', () => {
      this.isPressed = false
      this.button.setFillStyle(0xff3333, 0.7)
      this.button.setScale(1.0)
    })
  }

  /**
   * 攻撃コールバックを設定
   */
  setOnAttack(callback: () => void) {
    this.onAttackCallback = callback
  }

  /**
   * ボタンの表示/非表示
   */
  setVisible(visible: boolean) {
    this.container.setVisible(visible)
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.container.destroy()
  }
}
