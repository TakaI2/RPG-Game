import Phaser from 'phaser'
import { GAME_W, GAME_H } from '../config'

/**
 * カットインシステム
 * 必殺技発動時などに画面演出を行う
 */
export class CutinSystem {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private isPlaying: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(0, 0).setDepth(2000).setScrollFactor(0)
    this.container.setVisible(false)
  }

  /**
   * カットイン表示
   * @param imageKey ボスの顔グラフィックキー
   * @param skillName 技名
   * @param duration 表示時間（ms）
   * @param onComplete 完了コールバック
   */
  show(imageKey: string, skillName: string, duration: number, onComplete: () => void) {
    if (this.isPlaying) {
      console.warn('[CutinSystem] Already playing cutin')
      return
    }

    this.isPlaying = true
    this.container.removeAll(true)

    // 背景オーバーレイ（グラデーション風の赤黒）
    const overlay = this.scene.add.rectangle(
      0, 0, GAME_W, GAME_H, 0x000000, 0.7
    ).setOrigin(0, 0)

    // 集中線エフェクト
    const concentrationLines = this.createConcentrationLines()

    // スピードライン（横線）
    const speedLines = this.createSpeedLines()

    // ボスの顔グラフィック（画面右端から）
    let portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle
    if (this.scene.textures.exists(imageKey)) {
      portrait = this.scene.add.image(GAME_W + 300, GAME_H / 2, imageKey).setScale(2.5)
    } else {
      // 画像がない場合はダミーの赤い四角（より派手に）
      console.warn(`[CutinSystem] Image not found: ${imageKey}, using placeholder`)
      portrait = this.scene.add.rectangle(GAME_W + 300, GAME_H / 2, 256, 256, 0xff3333)
      // 枠を追加
      const border = this.scene.add.rectangle(GAME_W + 300, GAME_H / 2, 256, 256)
        .setStrokeStyle(8, 0xffff00)
      this.container.add(border)
      // 影を追加
      const shadow = this.scene.add.rectangle(GAME_W + 310, GAME_H / 2 + 10, 256, 256, 0x000000, 0.5)
      this.container.add(shadow)
    }

    // 技名テキスト（より派手に）
    const skillText = this.scene.add.text(
      GAME_W / 2, GAME_H / 2 - 150,
      skillName,
      {
        fontSize: '80px',
        fontFamily: 'Impact, Arial Black, sans-serif',
        color: '#ffff00',
        stroke: '#ff0000',
        strokeThickness: 10,
        shadow: {
          offsetX: 5,
          offsetY: 5,
          color: '#000000',
          blur: 10,
          fill: true
        }
      }
    ).setOrigin(0.5).setAlpha(0).setScale(0.5)

    // フラッシュ用の白いオーバーレイ
    const flashOverlay = this.scene.add.rectangle(
      0, 0, GAME_W, GAME_H, 0xffffff, 1
    ).setOrigin(0, 0).setAlpha(0)

    this.container.add([overlay, ...concentrationLines, ...speedLines, portrait, skillText, flashOverlay])
    this.container.setVisible(true)

    // === アニメーションシーケンス ===

    // 0. 最初にカメラフラッシュ
    this.scene.cameras.main.flash(150, 255, 200, 200)

    // カメラシェイク
    this.scene.cameras.main.shake(400, 0.008)

    // 1. フラッシュエフェクト
    this.scene.tweens.add({
      targets: flashOverlay,
      alpha: { from: 1, to: 0 },
      duration: 200,
      ease: 'Power2'
    })

    // 2. 顔グラフィックがスライドイン（0.4秒、より速く）
    this.scene.tweens.add({
      targets: portrait,
      x: GAME_W - 250,
      duration: 400,
      ease: 'Back.easeOut'
    })

    // 3. 集中線の拡大アニメーション
    concentrationLines.forEach((line, i) => {
      this.scene.tweens.add({
        targets: line,
        scaleX: { from: 0.5, to: 1.5 },
        scaleY: { from: 0.5, to: 1.5 },
        alpha: { from: 0.8, to: 0 },
        duration: 600,
        delay: i * 20
      })
    })

    // 4. スピードラインの移動アニメーション
    speedLines.forEach((line, i) => {
      this.scene.tweens.add({
        targets: line,
        x: line.x - 1000,
        alpha: { from: 0.7, to: 0 },
        duration: 500,
        delay: i * 30
      })
    })

    // 5. 技名のスケール＆フェードイン（0.3秒、0.15秒遅延）
    this.scene.tweens.add({
      targets: skillText,
      alpha: 1,
      scale: 1,
      duration: 300,
      delay: 150,
      ease: 'Back.easeOut'
    })

    // 技名の振動エフェクト
    this.scene.tweens.add({
      targets: skillText,
      angle: { from: -2, to: 2 },
      duration: 100,
      yoyo: true,
      repeat: 3,
      delay: 450
    })

    // 6. durationの60%経過後にフェードアウト開始
    const fadeOutStart = duration * 0.6
    this.scene.time.delayedCall(fadeOutStart, () => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: duration * 0.4,
        onComplete: () => {
          this.container.setVisible(false)
          this.container.setAlpha(1)
          this.isPlaying = false
          onComplete()
        }
      })
    })
  }

  /**
   * 集中線エフェクトを作成
   */
  private createConcentrationLines(): Phaser.GameObjects.Graphics[] {
    const lines: Phaser.GameObjects.Graphics[] = []
    const centerX = GAME_W / 2
    const centerY = GAME_H / 2

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const line = this.scene.add.graphics()
      line.lineStyle(3, 0xffffff, 0.6)
      line.beginPath()
      line.moveTo(centerX, centerY)
      const length = 800
      line.lineTo(
        centerX + Math.cos(angle) * length,
        centerY + Math.sin(angle) * length
      )
      line.strokePath()
      lines.push(line)
    }

    return lines
  }

  /**
   * スピードライン（横線）エフェクトを作成
   */
  private createSpeedLines(): Phaser.GameObjects.Graphics[] {
    const lines: Phaser.GameObjects.Graphics[] = []

    for (let i = 0; i < 15; i++) {
      const line = this.scene.add.graphics()
      line.lineStyle(4, 0xffffff, 0.5)
      const y = Phaser.Math.Between(50, GAME_H - 50)
      const length = Phaser.Math.Between(200, 500)
      line.beginPath()
      line.moveTo(GAME_W, y)
      line.lineTo(GAME_W - length, y)
      line.strokePath()
      lines.push(line)
    }

    return lines
  }

  /**
   * カットインを即座に停止
   */
  stop() {
    if (!this.isPlaying) return

    this.scene.tweens.killTweensOf(this.container)
    this.container.setVisible(false)
    this.container.setAlpha(1)
    this.isPlaying = false
  }

  /**
   * 現在再生中か
   */
  get playing(): boolean {
    return this.isPlaying
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stop()
    this.container.destroy()
  }
}
