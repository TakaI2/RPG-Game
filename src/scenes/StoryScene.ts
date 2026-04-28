import Phaser from 'phaser'
import DialogUI from '../systems/Dialog'
import { StoryRunner } from '../systems/StoryRunner'
import { AudioBus } from '../systems/AudioBus'
import { events } from '../systems/Events'

/** OGGのURLにM4Aフォールバックを追加（iOS Safari対応） */
function audioUrls(url: string): string[] {
  return url.endsWith('.ogg') ? [url, url.replace(/\.ogg$/, '.m4a')] : [url]
}
import { GAME_W, GAME_H } from '../config'
import type { ThenAction } from '../types/GameFlowTypes'

/**
 * ストーリーパート専用シーン（M2: 完全版）
 * - 背景画像表示（位置・スケール調整可）
 * - 立ち絵表示（画面中央、位置・スケール調整可）
 * - BGM/SE再生
 */
export default class StoryScene extends Phaser.Scene {
  private ui!: DialogUI
  private runner!: StoryRunner
  private audio!: AudioBus
  private spaceKey!: Phaser.Input.Keyboard.Key
  private scriptId!: string
  private thenAction!: ThenAction
  private waitingForSpace = false
  private isSkipping = false

  // 背景・立ち絵
  private bgImage?: Phaser.GameObjects.Image
  private portraitImage?: Phaser.GameObjects.Image
  private skipBtn?: Phaser.GameObjects.Image
  private fadeOverlay?: Phaser.GameObjects.Rectangle

  // クリーンアップ用
  private checkInterval?: Phaser.Time.TimerEvent

  constructor() {
    super('StoryScene')
  }

  init(data: { id: string; then?: ThenAction }) {
    this.scriptId = data?.id || 'intro'
    this.thenAction = data?.then ?? { action: 'stay' }
    this.isSkipping = false
    this.waitingForSpace = false
    this.checkInterval = undefined
    console.log(`[StoryScene] init with id: ${this.scriptId}`, 'then:', this.thenAction)

    if (!data || !data.id) {
      console.warn('[StoryScene] No id provided, using default: intro')
    }
  }

  preload() {
    console.log('[StoryScene] preload start')

    // DialogUI用のportraitテクスチャを生成（必要な場合）
    if (!this.textures.exists('portrait')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 200, 200).generateTexture('portrait', 200, 200).clear()
    }

    // JSONスクリプトをロード（既にキャッシュ済みならスキップ）
    if (!this.cache.json.has(`story_${this.scriptId}`)) {
      this.load.json(`story_${this.scriptId}`, `assets/story/scripts/${this.scriptId}.json`)
    }
  }

  create() {
    console.log('[StoryScene] create')

    // JSONスクリプトを取得
    const scriptData = this.cache.json.get(`story_${this.scriptId}`)

    if (!scriptData) {
      console.error(`[StoryScene] Script data not found: story_${this.scriptId}`)
      // フォールバック: story:end を発火して MainScene に制御を戻す
      events.emit('story:end', { id: this.scriptId, then: this.thenAction })
      this.scene.stop()
      return
    }

    // 必要なアセットを動的にロードしてから初期化
    this.loadScriptAssets(scriptData.script, () => {
      this.initializeStory(scriptData)
    })
  }

  private initializeStory(scriptData: { script: { op: string; [key: string]: unknown }[] }) {
    console.log('[StoryScene] initializeStory')

    // ストーリー開始イベントを発火（BGMはBGMManagerが適切に停止する）
    events.emit('story-start')
    console.log('[StoryScene] story-start event emitted')

    // 黒背景
    this.cameras.main.setBackgroundColor('#000000')
    this.cameras.main.fadeIn(300)

    // AudioBus作成
    this.audio = new AudioBus(this)

    // フェードオーバーレイ（fade.in / fade.out コマンド用）
    this.fadeOverlay = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000)
      .setAlpha(0).setDepth(1500).setScrollFactor(0)

    // DialogUI作成
    this.ui = new DialogUI(this)

    // StoryRunner作成
    this.runner = new StoryRunner(this, this.audio)
    this.runner.load(scriptData)

    // フック設定
    this.runner.hooks({
      onSay: async (payload) => {
        await this.showSay(payload)
      },
      onBg: async (payload) => {
        await this.showBg(payload)
      },
      onPortraitShow: async (payload) => {
        await this.showPortrait(payload)
      },
      onPortraitHide: async () => {
        this.hidePortrait()
      },
      onEnd: (_returnTo) => {
        this.endStory()
      },
      onFadeIn: async (color, duration, alpha) => {
        await this.doFadeIn(color, duration, alpha)
      },
      onFadeOut: async (duration) => {
        await this.doFadeOut(duration)
      }
    })

    // Spaceキー設定
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // 既存のリスナーを削除してから新しいリスナーを追加
    this.spaceKey.removeAllListeners()
    this.spaceKey.on('down', () => this.onAdvance())

    // 左クリックでも進められるようにする
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.onAdvance()
      }
    })

    // スキップボタン（右下）
    this.skipBtn = this.add.image(GAME_W - 120, GAME_H - 60, 'btn_skip')
      .setDepth(2000)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    this.skipBtn.on('pointerdown', () => this.skipStory())
    this.skipBtn.on('pointerover', () => this.skipBtn?.setAlpha(0.75))
    this.skipBtn.on('pointerout', () => this.skipBtn?.setAlpha(1))

    // シーン終了時のクリーンアップ
    this.events.once('shutdown', this.cleanup, this)

    // 最初のステップを実行
    this.runner.step()
  }

  private loadScriptAssets(script: { op: string; [key: string]: unknown }[], onComplete: () => void) {
    const bgSet = new Set<string>()
    const portraitSet = new Set<string>()
    const bgmSet = new Set<string>()
    const seSet = new Set<string>()

    // スクリプトから使用アセットを抽出
    script.forEach(op => {
      if (op.op === 'bg' && op.name) {
        bgSet.add(op.name as string)
      }
      if ((op.op === 'say' || op.op === 'portrait.show') && op.portrait) {
        portraitSet.add(op.portrait as string)
      }
      if (op.op === 'bgm.play' && op.name) {
        bgmSet.add(op.name as string)
      }
      if (op.op === 'se' && op.name) {
        seSet.add(op.name as string)
      }
    })

    // 背景画像をロード（未ロードのみ）
    bgSet.forEach(bg => {
      if (!this.textures.exists(`story_bg_${bg}`))
        this.load.image(`story_bg_${bg}`, `assets/story/bg/${bg}`)
    })

    // 立ち絵をロード（未ロードのみ）
    portraitSet.forEach(portrait => {
      if (!this.textures.exists(`story_portrait_${portrait}`))
        this.load.image(`story_portrait_${portrait}`, `assets/story/portraits/${portrait}`)
    })

    // BGMをロード（未ロードのみ）
    bgmSet.forEach(bgm => {
      if (!this.cache.audio.has(bgm))
        this.load.audio(bgm, audioUrls(`assets/story/bgm/${bgm}`))
    })

    // SEをロード（未ロードのみ）
    seSet.forEach(se => {
      if (!this.cache.audio.has(se))
        this.load.audio(se, audioUrls(`assets/story/se/${se}`))
    })

    console.log('[StoryScene] BGM/SE/BG/Portrait assets to load:', {
      bgm: Array.from(bgmSet),
      se: Array.from(seSet),
      bg: Array.from(bgSet),
      portrait: Array.from(portraitSet)
    })

    // アセットがない場合は即座にコールバック
    if (bgSet.size === 0 && portraitSet.size === 0 && bgmSet.size === 0 && seSet.size === 0) {
      console.log('[StoryScene] No assets to load, calling onComplete immediately')
      onComplete()
      return
    }

    // アセットロード完了時にコールバックを呼ぶ
    this.load.once('complete', () => {
      console.log('[StoryScene] Assets loaded, calling onComplete')
      // pixelArt: true によるニアレストネイバーを上書きし、背景・立ち絵を線形補間で描画
      bgSet.forEach(bg => {
        this.textures.get(`story_bg_${bg}`).setFilter(Phaser.Textures.FilterMode.LINEAR)
      })
      portraitSet.forEach(portrait => {
        this.textures.get(`story_portrait_${portrait}`).setFilter(Phaser.Textures.FilterMode.LINEAR)
      })
      onComplete()
    })

    console.log('[StoryScene] Starting asset load...')
    this.load.start()
  }

  private cleanup() {
    console.log('[StoryScene] cleanup')

    // BGM停止
    if (this.audio) {
      this.audio.stopBgm({ fade: 0 })
      this.audio.destroy()
    }

    // 画像の削除
    if (this.bgImage) {
      this.bgImage.destroy()
      this.bgImage = undefined
    }
    if (this.portraitImage) {
      this.portraitImage.destroy()
      this.portraitImage = undefined
    }
    if (this.skipBtn) {
      this.skipBtn.destroy()
      this.skipBtn = undefined
    }
    if (this.fadeOverlay) {
      this.fadeOverlay.destroy()
      this.fadeOverlay = undefined
    }

    // Spaceキーリスナーを削除
    if (this.spaceKey) {
      this.spaceKey.removeAllListeners()
    }

    // checkIntervalを削除
    if (this.checkInterval) {
      this.checkInterval.remove()
      this.checkInterval = undefined
    }
  }

  private async showBg(payload: { name: string; x?: number; y?: number; scaleX?: number; scaleY?: number; fade?: number }): Promise<void> {
    console.log('[StoryScene] showBg:', payload)

    const x = payload.x ?? 0
    const y = payload.y ?? 0
    const scaleX = payload.scaleX ?? 1.0
    const scaleY = payload.scaleY ?? 1.0
    const fade = payload.fade ?? 0

    const key = `story_bg_${payload.name}`

    if (!this.textures.exists(key)) {
      console.warn(`[StoryScene] Background not found: ${key}`)
      return
    }

    // 既存の背景を削除
    if (this.bgImage) {
      this.bgImage.destroy()
    }

    // 新しい背景を作成
    this.bgImage = this.add.image(x, y, key).setOrigin(0, 0).setDepth(-1000)
    this.bgImage.setScale(scaleX, scaleY)

    // フェードイン
    if (fade > 0) {
      this.bgImage.setAlpha(0)
      this.tweens.add({
        targets: this.bgImage,
        alpha: 1,
        duration: fade
      })
    }
  }

  private async showPortrait(payload: { portrait: string; x?: number; y?: number; scale?: number }): Promise<void> {
    const key = `story_portrait_${payload.portrait}`
    if (!this.textures.exists(key)) {
      console.warn(`[StoryScene] Portrait not found: ${key}`)
      return
    }

    if (this.portraitImage) {
      this.portraitImage.destroy()
    }

    const x = payload.x ?? GAME_W / 2
    const y = payload.y ?? GAME_H / 2
    const scale = payload.scale ?? 1.0

    this.portraitImage = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDepth(-500)
    this.portraitImage.setScale(scale)
    this.portraitImage.setAlpha(0)
    this.tweens.add({ targets: this.portraitImage, alpha: 1, duration: 300 })
  }

  private hidePortrait(): void {
    if (this.portraitImage) {
      this.portraitImage.destroy()
      this.portraitImage = undefined
    }
  }

  private async showSay(payload: {
    name: string
    lines: string[]
    portrait?: string
    portraitX?: number
    portraitY?: number
    portraitScale?: number
  }): Promise<void> {
    console.log('[StoryScene] showSay START:', { name: payload.name, lines: payload.lines })

    // sayにportrait指定がある場合のみ立ち絵を更新（なければ現在の立ち絵を維持）
    if (payload.portrait) {
      await this.showPortrait({
        portrait: payload.portrait,
        x: payload.portraitX,
        y: payload.portraitY,
        scale: payload.portraitScale
      })
    }

    // ダイアログ表示
    console.log('[StoryScene] Calling ui.show with lines:', payload.lines)
    this.ui.show(payload.name, { lines: payload.lines })
    this.waitingForSpace = true

    // Spaceキーが押されるまで待機
    return new Promise((resolve) => {
      // 既存のcheckIntervalがあれば削除
      if (this.checkInterval) {
        this.checkInterval.remove()
      }

      this.checkInterval = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          if (!this.ui.visible) {
            console.log('[StoryScene] DialogUI closed, resolving showSay promise')
            if (this.checkInterval) {
              this.checkInterval.remove()
              this.checkInterval = undefined
            }
            this.waitingForSpace = false
            resolve()
          }
        }
      })
    })
  }

  /**
   * ストーリーをスキップして即終了
   */
  private skipStory() {
    if (this.isSkipping) return
    this.isSkipping = true
    // 待機中のタイマーを即座に停止（showSay のPromiseは未解決のまま放置、scene.stop で破棄される）
    if (this.checkInterval) {
      this.checkInterval.remove()
      this.checkInterval = undefined
    }
    this.endStory()
  }

  /**
   * ストーリーを進める（Spaceキーまたは左クリック）
   */
  private onAdvance() {
    if (this.isSkipping) return
    console.log('[StoryScene] Advance triggered, ui.visible:', this.ui.visible, 'waitingForSpace:', this.waitingForSpace)
    if (this.ui.visible) {
      console.log('[StoryScene] Calling ui.next()')
      this.ui.next()
    } else if (!this.waitingForSpace) {
      console.log('[StoryScene] Calling runner.step()')
      this.runner.step()
    } else {
      console.log('[StoryScene] Waiting for current say to complete')
    }
  }

  private doFadeIn(color: string, duration: number, alpha: number): Promise<void> {
    return new Promise(resolve => {
      const colorInt = parseInt(color.replace('#', ''), 16)
      this.fadeOverlay!.setFillStyle(colorInt).setAlpha(0)
      this.tweens.add({ targets: this.fadeOverlay, alpha, duration, onComplete: () => resolve() })
    })
  }

  private doFadeOut(duration: number): Promise<void> {
    return new Promise(resolve => {
      this.tweens.add({ targets: this.fadeOverlay, alpha: 0, duration, onComplete: () => resolve() })
    })
  }

  /**
   * ストーリー終了処理
   * story:end イベントを発火して MainScene に制御を渡し、自身を停止する
   */
  private endStory() {
    console.log(`[StoryScene] endStory, id: ${this.scriptId}, then:`, this.thenAction)

    // story:end イベントを発火（MainScene の executeThen が受け取る）
    events.emit('story:end', { id: this.scriptId, then: this.thenAction })
    console.log('[StoryScene] story:end event emitted')

    // 自身を停止（shutdownイベントでcleanupが呼ばれる）
    this.scene.stop()
  }
}
