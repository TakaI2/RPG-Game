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

    // 背景オーバーレイ（半透明の赤）
    const overlay = this.scene.add.rectangle(
      0, 0, GAME_W, GAME_H, 0xff0000, 0.3
    ).setOrigin(0, 0)

    // ボスの顔グラフィック（画面右端から）
    let portrait: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle
    if (this.scene.textures.exists(imageKey)) {
      portrait = this.scene.add.image(GAME_W + 300, GAME_H / 2, imageKey).setScale(2)
    } else {
      // 画像がない場合はダミーの赤い四角
      console.warn(`[CutinSystem] Image not found: ${imageKey}, using placeholder`)
      portrait = this.scene.add.rectangle(GAME_W + 300, GAME_H / 2, 200, 200, 0xff0000)
    }

    // 技名テキスト
    const skillText = this.scene.add.text(
      GAME_W / 2, GAME_H / 2 - 100,
      skillName,
      {
        fontSize: '64px',
        fontFamily: 'monospace',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 8
      }
    ).setOrigin(0.5).setAlpha(0)

    this.container.add([overlay, portrait, skillText])
    this.container.setVisible(true)

    // アニメーションシーケンス（手動実装）
    // 1. 顔グラフィックがスライドイン（0.5秒）
    this.scene.tweens.add({
      targets: portrait,
      x: GAME_W - 200,
      duration: 500,
      ease: 'Power3'
    })

    // 2. 技名フェードイン（0.3秒、0.2秒遅延）
    this.scene.tweens.add({
      targets: skillText,
      alpha: 1,
      duration: 300,
      delay: 200
    })

    // 3. durationの70%経過後にフェードアウト開始
    const fadeOutStart = duration * 0.7
    this.scene.time.delayedCall(fadeOutStart, () => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: duration * 0.3,
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
