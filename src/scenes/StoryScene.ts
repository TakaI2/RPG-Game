import Phaser from 'phaser'
import DialogUI from '../systems/Dialog'
import { StoryRunner } from '../systems/StoryRunner'
import { AudioBus } from '../systems/AudioBus'
import { events } from '../systems/Events'
import { GAME_W, GAME_H } from '../config'

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
  private waitingForSpace = false

  // 背景・立ち絵
  private bgImage?: Phaser.GameObjects.Image
  private portraitImage?: Phaser.GameObjects.Image

  // クリーンアップ用
  private checkInterval?: Phaser.Time.TimerEvent

  constructor() {
    super('StoryScene')
  }

  init(data: { id: string }) {
    this.scriptId = data?.id || 'intro'
    console.log(`[StoryScene] init with id: ${this.scriptId}`, 'data:', data)

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

    // JSONスクリプトをロード
    this.load.json(`story_${this.scriptId}`, `assets/story/scripts/${this.scriptId}.json`)
  }

  create() {
    console.log('[StoryScene] create')

    // JSONスクリプトを取得
    const scriptData = this.cache.json.get(`story_${this.scriptId}`)

    if (!scriptData) {
      console.error(`[StoryScene] Script data not found: story_${this.scriptId}`)
      // フォールバック: ゲームに戻る
      events.emit('story:end', { id: this.scriptId })
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

    // ストーリー開始イベントを発火（BGM停止用）
    events.emit('story-start')
    console.log('[StoryScene] story-start event emitted')

    // 全てのBGMを強制停止（MainSceneのBGMを確実に停止）
    this.sound.stopAll()
    console.log('[StoryScene] All sounds stopped')

    // 黒背景
    this.cameras.main.setBackgroundColor('#000000')
    this.cameras.main.fadeIn(300)

    // AudioBus作成
    this.audio = new AudioBus(this)

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
      onEnd: (returnTo) => {
        this.endStory(returnTo)
      }
    })

    // Spaceキー設定
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // 既存のリスナーを削除してから新しいリスナーを追加
    this.spaceKey.removeAllListeners()
    this.spaceKey.on('down', () => this.onSpacePressed())

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
      if (op.op === 'say' && op.portrait) {
        portraitSet.add(op.portrait as string)
      }
      if (op.op === 'bgm.play' && op.name) {
        bgmSet.add(op.name as string)
      }
      if (op.op === 'se' && op.name) {
        seSet.add(op.name as string)
      }
    })

    // 背景画像をロード
    bgSet.forEach(bg => {
      this.load.image(`story_bg_${bg}`, `assets/story/bg/${bg}`)
    })

    // 立ち絵をロード
    portraitSet.forEach(portrait => {
      this.load.image(`story_portrait_${portrait}`, `assets/story/portraits/${portrait}`)
    })

    // BGMをロード
    bgmSet.forEach(bgm => {
      this.load.audio(bgm, `assets/story/bgm/${bgm}`)
    })

    // SEをロード
    seSet.forEach(se => {
      this.load.audio(se, `assets/story/se/${se}`)
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
      onComplete()
    })

    console.log('[StoryScene] Starting asset load...')
    this.load.start()
  }

  private cleanup() {
    console.log('[StoryScene] cleanup')

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

  private async showSay(payload: {
    name: string
    lines: string[]
    portrait?: string
    portraitX?: number
    portraitY?: number
    portraitScale?: number
  }): Promise<void> {
    console.log('[StoryScene] showSay START:', { name: payload.name, lines: payload.lines })

    // 立ち絵の更新
    if (payload.portrait) {
      const key = `story_portrait_${payload.portrait}`

      if (!this.textures.exists(key)) {
        console.warn(`[StoryScene] Portrait not found: ${key}`)
      } else {
        // 既存の立ち絵を削除
        if (this.portraitImage) {
          this.portraitImage.destroy()
        }

        // デフォルト: 画面中央
        const x = payload.portraitX ?? GAME_W / 2
        const y = payload.portraitY ?? GAME_H / 2
        const scale = payload.portraitScale ?? 1.0

        // 新しい立ち絵を作成
        this.portraitImage = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDepth(-500)
        this.portraitImage.setScale(scale)

        // フェードイン
        this.portraitImage.setAlpha(0)
        this.tweens.add({
          targets: this.portraitImage,
          alpha: 1,
          duration: 300
        })
      }
    } else {
      // portrait指定がない場合は立ち絵を非表示
      if (this.portraitImage) {
        this.portraitImage.destroy()
        this.portraitImage = undefined
      }
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
            // DialogUIが閉じた = 会話終了
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

  private onSpacePressed() {
    console.log('[StoryScene] Space pressed, ui.visible:', this.ui.visible, 'waitingForSpace:', this.waitingForSpace)
    if (this.ui.visible) {
      // DialogUIのnextを呼ぶ（タイプ中なら即表示、終わったら次へ）
      console.log('[StoryScene] Calling ui.next()')
      this.ui.next()
    } else if (!this.waitingForSpace) {
      // 次のステップへ
      console.log('[StoryScene] Calling runner.step()')
      this.runner.step()
    } else {
      console.log('[StoryScene] Waiting for current say to complete')
    }
  }

  private endStory(returnTo: string) {
    console.log(`[StoryScene] endStory, returnTo: ${returnTo}`)

    // BGM停止
    this.audio.stopBgm({ fade: 500 })

    // クリーンアップ
    if (this.bgImage) {
      this.bgImage.destroy()
    }
    if (this.portraitImage) {
      this.portraitImage.destroy()
    }
    this.audio.destroy()

    // 手動でクリーンアップを呼ぶ
    this.cleanup()

    // ストーリー終了イベントを発火
    events.emit('story-end', { nextScene: returnTo })
    console.log('[StoryScene] story-end event emitted, nextScene:', returnTo)

    // デバッグ情報を出力
    console.log('[StoryScene] Scene transition check:')
    console.log('  returnTo:', returnTo)
    console.log('  scriptId:', this.scriptId)
    console.log('  returnTo === "title":', returnTo === 'title')
    console.log('  scriptId === "clear":', this.scriptId === 'clear')
    console.log('  scriptId === "gameover":', this.scriptId === 'gameover')

    // clear/gameoverの場合はタイトルに、それ以外は指定されたシーンに遷移
    let targetScene: string | null = null

    if (returnTo === 'title' || this.scriptId === 'clear' || this.scriptId === 'gameover') {
      console.log('[StoryScene] Transitioning to TitleScene')
      targetScene = 'TitleScene'
    } else if (returnTo && returnTo !== 'none') {
      // シーンキーのマッピング（game -> MainScene）
      targetScene = returnTo === 'game' ? 'MainScene' : returnTo
      console.log(`[StoryScene] Transitioning to scene: ${targetScene} (original returnTo: ${returnTo})`)
    }

    if (targetScene) {
      // シーンを開始（start()が自動的に現在のシーンを停止する）
      console.log('[StoryScene] Starting scene:', targetScene)
      this.scene.start(targetScene)
    } else {
      console.warn('[StoryScene] No scene to start! returnTo:', returnTo)
      this.scene.stop()
    }
  }
}
