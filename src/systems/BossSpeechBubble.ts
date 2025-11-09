import Phaser from 'phaser'

/**
 * ボスセリフ吹き出しシステム
 * ボスの頭上にセリフを表示
 */
export class BossSpeechBubble {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private bubble: Phaser.GameObjects.Graphics
  private speechText: Phaser.GameObjects.Text
  private isVisible: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(0, 0).setDepth(1500).setScrollFactor(1)

    // 吹き出し背景
    this.bubble = scene.add.graphics()

    // テキスト
    this.speechText = scene.add.text(200, 40, '', {
      fontSize: '32px',
      fontFamily: 'monospace',
      color: '#ff6666',
      align: 'center',
      wordWrap: { width: 380 }
    }).setOrigin(0.5)

    this.container.add([this.bubble, this.speechText])
    this.container.setVisible(false)
  }

  /**
   * セリフ表示
   * @param boss ボススプライト
   * @param text セリフ内容
   * @param duration 表示時間（ms）
   * @param color テキストカラー（オプション）
   * @param onComplete 完了コールバック
   */
  show(
    boss: Phaser.GameObjects.Sprite,
    text: string,
    duration: number,
    color: string = '#ff6666',
    onComplete?: () => void
  ) {
    if (this.isVisible) {
      this.hide()
    }

    // テキスト設定
    this.speechText.setText(text)
    this.speechText.setColor(color)

    // 吹き出しサイズを計算
    const textBounds = this.speechText.getBounds()
    const padding = 20
    const bubbleWidth = Math.max(textBounds.width + padding * 2, 200)
    const bubbleHeight = textBounds.height + padding * 2

    // 吹き出し描画
    this.bubble.clear()
    this.bubble.fillStyle(0x000000, 0.85)
    this.bubble.fillRoundedRect(
      200 - bubbleWidth / 2,
      40 - bubbleHeight / 2,
      bubbleWidth,
      bubbleHeight,
      12
    )

    // 吹き出しのしっぽ（下向き三角形）
    this.bubble.fillTriangle(
      200 - 15, 40 + bubbleHeight / 2,    // 左
      200 + 15, 40 + bubbleHeight / 2,    // 右
      200, 40 + bubbleHeight / 2 + 20     // 下
    )

    // ボスの頭上に配置
    this.container.setPosition(boss.x - 200, boss.y - 150)
    this.container.setVisible(true)
    this.isVisible = true

    // フェードイン
    this.container.setAlpha(0)
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200
    })

    // duration後にフェードアウト
    this.scene.time.delayedCall(duration, () => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.container.setVisible(false)
          this.isVisible = false
          if (onComplete) onComplete()
        }
      })
    })
  }

  /**
   * セリフを即座に非表示
   */
  hide() {
    this.container.setVisible(false)
    this.isVisible = false
    this.scene.tweens.killTweensOf(this.container)
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.hide()
    this.container.destroy()
  }
}
