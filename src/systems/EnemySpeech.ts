import Phaser from 'phaser'

export class EnemySpeech {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private bubble: Phaser.GameObjects.Graphics
  private speechText: Phaser.GameObjects.Text
  private isVisible: boolean = false
  private delayTimer: Phaser.Time.TimerEvent | null = null
  private loopTimer: Phaser.Time.TimerEvent | null = null
  private loopLines: string[] | null = null
  private loopOwner: Phaser.GameObjects.Sprite | null = null
  private loopDisplayMs: number = 2000
  private loopIntervalMs: number = 5000
  private loopIndex: number = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(0, 0).setDepth(1200).setScrollFactor(1)

    this.bubble = scene.add.graphics()

    this.speechText = scene.add.text(0, 0, '', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 200 }
    }).setOrigin(0.5)

    this.container.add([this.bubble, this.speechText])
    this.container.setVisible(false)
  }

  startLoop(owner: Phaser.GameObjects.Sprite, lines: string[], displayMs: number, intervalMs: number): void {
    this.stopLoop()
    this.loopLines = lines
    this.loopOwner = owner
    this.loopDisplayMs = displayMs
    this.loopIntervalMs = intervalMs
    this.loopIndex = 0
    this._showNextLine()
  }

  private _showNextLine(): void {
    if (!this.loopLines || !this.loopOwner) return
    const text = this.loopLines[this.loopIndex]
    this.loopIndex = (this.loopIndex + 1) % this.loopLines.length
    this.show(this.loopOwner, text, this.loopDisplayMs)
    // 表示時間 + フェード時間(250ms) + インターバルの後に次のセリフへ
    this.loopTimer = this.scene.time.delayedCall(
      this.loopDisplayMs + 250 + this.loopIntervalMs,
      () => { this._showNextLine() }
    )
  }

  stopLoop(): void {
    if (this.loopTimer) {
      this.loopTimer.remove()
      this.loopTimer = null
    }
    this.loopLines = null
    this.loopOwner = null
    this.hide()
  }

  show(owner: Phaser.GameObjects.Sprite, text: string, duration: number): void {
    this.hide()

    this.speechText.setText(text)

    // getBounds()は初回呼び出し時にゼロを返す場合があるため、
    // フォントサイズベースで推定する
    const padding = 10
    const estimatedLineHeight = 22 // 18px font + line spacing
    const textWidth = this.speechText.width || 120
    const textHeight = this.speechText.height || estimatedLineHeight
    const bubbleWidth = Math.max(textWidth + padding * 2, 80)
    const bubbleHeight = Math.max(textHeight + padding * 2, 36)

    this.bubble.clear()
    this.bubble.fillStyle(0x000000, 0.85)
    this.bubble.fillRoundedRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 8)
    // 吹き出しのしっぽ（下向き三角形）
    this.bubble.fillTriangle(
      -8, bubbleHeight / 2,
      8, bubbleHeight / 2,
      0, bubbleHeight / 2 + 12
    )

    this.container.setPosition(owner.x, owner.y - 80)
    this.container.setVisible(true)
    this.container.setAlpha(1)
    this.isVisible = true

    this.delayTimer = this.scene.time.delayedCall(duration, () => {
      this.delayTimer = null
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          this.container.setVisible(false)
          this.isVisible = false
        }
      })
    })
  }

  update(owner: Phaser.GameObjects.Sprite): void {
    if (this.isVisible) {
      this.container.setPosition(owner.x, owner.y - 80)
    }
  }

  hide(): void {
    if (this.delayTimer) {
      this.delayTimer.remove()
      this.delayTimer = null
    }
    this.scene.tweens.killTweensOf(this.container)
    this.container.setVisible(false)
    this.container.setAlpha(1)
    this.isVisible = false
  }

  destroy(): void {
    this.stopLoop()
    this.container.destroy()
  }
}
