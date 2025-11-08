import Phaser from 'phaser'

/**
 * BGM/SE管理システム
 * ストーリーパートでの音声制御を一元管理
 */
export class AudioBus {
  private scene: Phaser.Scene
  private currentBgm: Phaser.Sound.BaseSound | null = null
  private bgmKey: string = ''

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * BGM再生
   * @param key アセットキー
   * @param options ループ・ボリューム・フェード設定
   */
  playBgm(key: string, options?: { loop?: boolean; volume?: number; fade?: number }) {
    const loop = options?.loop ?? true
    const volume = options?.volume ?? 0.7
    const fade = options?.fade ?? 0

    // 既存のBGMを停止
    if (this.currentBgm && this.currentBgm.isPlaying) {
      if (fade > 0) {
        this.scene.tweens.add({
          targets: this.currentBgm,
          volume: 0,
          duration: fade,
          onComplete: () => {
            this.currentBgm?.stop()
            this.startNewBgm(key, loop, volume, fade)
          }
        })
        return
      } else {
        this.currentBgm.stop()
      }
    }

    this.startNewBgm(key, loop, volume, fade)
  }

  private startNewBgm(key: string, loop: boolean, volume: number, fade: number) {
    // 新しいBGMを開始
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] BGM not found: ${key}`)
      return
    }

    this.bgmKey = key
    this.currentBgm = this.scene.sound.add(key, { loop, volume: fade > 0 ? 0 : volume })
    this.currentBgm.play()

    // フェードイン
    if (fade > 0) {
      this.scene.tweens.add({
        targets: this.currentBgm,
        volume: volume,
        duration: fade
      })
    }

    console.log(`[AudioBus] BGM started: ${key}`)
  }

  /**
   * BGM停止
   * @param options フェード設定
   */
  stopBgm(options?: { fade?: number }) {
    const fade = options?.fade ?? 0

    if (!this.currentBgm || !this.currentBgm.isPlaying) {
      return
    }

    if (fade > 0) {
      this.scene.tweens.add({
        targets: this.currentBgm,
        volume: 0,
        duration: fade,
        onComplete: () => {
          this.currentBgm?.stop()
          this.currentBgm = null
          this.bgmKey = ''
        }
      })
    } else {
      this.currentBgm.stop()
      this.currentBgm = null
      this.bgmKey = ''
    }

    console.log('[AudioBus] BGM stopped')
  }

  /**
   * BGMクロスフェード
   * @param from 現在のBGMキー（確認用）
   * @param to 新しいBGMキー
   * @param time クロスフェード時間
   * @param loop ループ設定
   */
  cross(from: string, to: string, time: number, loop: boolean = true) {
    if (this.bgmKey !== from) {
      console.warn(`[AudioBus] cross: current BGM is ${this.bgmKey}, not ${from}`)
    }

    this.playBgm(to, { loop, fade: time })
  }

  /**
   * SE再生
   * @param key アセットキー
   */
  se(key: string) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] SE not found: ${key}`)
      return
    }

    this.scene.sound.play(key)
    console.log(`[AudioBus] SE played: ${key}`)
  }

  /**
   * クリーンアップ
   */
  destroy() {
    if (this.currentBgm) {
      this.currentBgm.stop()
      this.currentBgm = null
    }
  }
}
