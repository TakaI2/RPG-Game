import Phaser from 'phaser'
import { GAME_W, GAME_H } from '../config'
import type { GameFlowConfig, StoryThenConfig } from '../types/GameFlowTypes'

/** OGGのURLにM4Aフォールバックを追加（iOS Safari対応） */
function audioUrls(url: string): string[] {
  return url.endsWith('.ogg') ? [url, url.replace(/\.ogg$/, '.m4a')] : [url]
}

type StoryOp = { op: string; [key: string]: unknown }

const BAR_W = 620
const BAR_H = 50

export default class ChapterLoadingScene extends Phaser.Scene {
  private chapterId!: string
  private chapterStart!: StoryThenConfig
  private loadedBgKeys: string[] = []
  private loadedPortraitKeys: string[] = []
  private progressBar!: Phaser.GameObjects.Graphics
  private percentText!: Phaser.GameObjects.Text

  constructor() {
    super('ChapterLoadingScene')
  }

  init(data: { chapterId: string }) {
    this.chapterId = data.chapterId
    this.loadedBgKeys = []
    this.loadedPortraitKeys = []
  }

  create() {
    const config = this.cache.json.get('gameflow') as GameFlowConfig
    const chapter = config.chapters?.find(c => c.id === this.chapterId)

    this.chapterStart = chapter?.start ?? config.chapters[0].start

    const cx = GAME_W / 2
    const cy = GAME_H / 2

    this.cameras.main.setBackgroundColor('#000000')

    // ─── 背景画像（フルスクリーン）────────────────────────────────────────
    const loadingImages = config.assets?.loadingImages ?? []
    if (loadingImages.length > 0) {
      const imgFile = loadingImages[Math.floor(Math.random() * loadingImages.length)]
      const key = `loading_img_${imgFile}`
      if (this.textures.exists(key)) {
        this.add.image(cx, cy, key).setDisplaySize(GAME_W, GAME_H).setDepth(0)
      }
    }

    // ─── 半透明オーバーレイ（文字を読みやすくする）───────────────────────
    this.add.rectangle(cx, cy + 60, BAR_W + 80, 220, 0x000000, 0.55).setDepth(9)

    // ─── 章ラベル（中央上寄り）───────────────────────────────────────────
    const label = chapter?.label ?? ''
    if (label) {
      this.add.text(cx, cy - 20, label, {
        fontSize: '40px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(10)
    }

    // ─── プログレスバー外枠 ───────────────────────────────────────────────
    const barY = cy + 50
    const box = this.add.graphics().setDepth(10)
    box.fillStyle(0x222222, 0.9)
    box.fillRect(cx - BAR_W / 2, barY - BAR_H / 2, BAR_W, BAR_H)
    box.lineStyle(3, 0xffffff, 1)
    box.strokeRect(cx - BAR_W / 2, barY - BAR_H / 2, BAR_W, BAR_H)

    // ─── プログレスバー（塗り）────────────────────────────────────────────
    this.progressBar = this.add.graphics().setDepth(11)

    // ─── パーセント表示 ───────────────────────────────────────────────────
    this.percentText = this.add.text(cx, barY, '0%', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12)

    this.updateProgress(0, cx, barY)

    // ─── 1フレーム後にロード処理を開始（画像描画を確保）──────────────────
    this.time.delayedCall(16, () => this.startLoading(chapter?.stories ?? [], cx, barY))
  }

  private updateProgress(value: number, cx: number, barY: number) {
    this.progressBar.clear()
    this.progressBar.fillStyle(0x00ff88, 1)
    this.progressBar.fillRect(cx - BAR_W / 2 + 5, barY - BAR_H / 2 + 5, (BAR_W - 10) * value, BAR_H - 10)
    this.percentText.setText(`${Math.floor(value * 100)}%`)
  }

  private startLoading(storyIds: string[], cx: number, barY: number) {
    const bgSet = new Set<string>()
    const portraitSet = new Set<string>()
    const bgmSet = new Set<string>()
    const seSet = new Set<string>()

    storyIds.forEach(storyId => {
      const cacheKey = `story_${storyId}`
      if (this.cache.json.has(cacheKey)) {
        const cached = this.cache.json.get(cacheKey) as { script: StoryOp[] }
        cached?.script?.forEach(op => this.collectAssets(op, bgSet, portraitSet, bgmSet, seSet))
        return
      }
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', `assets/story/scripts/${storyId}.json`, false)
        xhr.send()
        if (xhr.status === 200) {
          const scriptData = JSON.parse(xhr.responseText) as { script: StoryOp[] }
          this.cache.json.add(cacheKey, scriptData)
          scriptData.script.forEach(op => this.collectAssets(op, bgSet, portraitSet, bgmSet, seSet))
        }
      } catch (e) {
        console.warn(`[ChapterLoadingScene] Could not load story script: ${storyId}`, e)
      }
    })

    bgSet.forEach(bg => {
      const key = `story_bg_${bg}`
      if (!this.textures.exists(key)) { this.load.image(key, `assets/story/bg/${bg}`); this.loadedBgKeys.push(key) }
    })
    portraitSet.forEach(portrait => {
      const key = `story_portrait_${portrait}`
      if (!this.textures.exists(key)) { this.load.image(key, `assets/story/portraits/${portrait}`); this.loadedPortraitKeys.push(key) }
    })
    bgmSet.forEach(bgm => { if (!this.cache.audio.has(bgm)) this.load.audio(bgm, audioUrls(`assets/story/bgm/${bgm}`)) })
    seSet.forEach(se => { if (!this.cache.audio.has(se)) this.load.audio(se, audioUrls(`assets/story/se/${se}`)) })

    this.load.on('progress', (value: number) => this.updateProgress(value, cx, barY))
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[ChapterLoadingScene] Failed to load: ${file.key}`)
    })

    const finalize = () => {
      this.updateProgress(1, cx, barY)
      this.loadedBgKeys.forEach(k => { if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR) })
      this.loadedPortraitKeys.forEach(k => { if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR) })
      this.time.delayedCall(400, () => {
        this.game.registry.set('pendingChapterStart', this.chapterStart)
        this.scene.start('MainScene')
      })
    }

    if (this.load.list.size > 0) {
      this.load.once('complete', finalize)
      this.load.start()
    } else {
      finalize()
    }
  }

  private collectAssets(
    op: StoryOp,
    bgSet: Set<string>,
    portraitSet: Set<string>,
    bgmSet: Set<string>,
    seSet: Set<string>
  ) {
    if (op.op === 'bg' && op.name) bgSet.add(op.name as string)
    if ((op.op === 'say' || op.op === 'portrait.show') && op.portrait) portraitSet.add(op.portrait as string)
    if (op.op === 'bgm.play' && op.name) bgmSet.add(op.name as string)
    if (op.op === 'se' && op.name) seSet.add(op.name as string)
  }
}
