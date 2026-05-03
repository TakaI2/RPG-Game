import Phaser from 'phaser'
import { loadSoundConfig, saveSoundConfig } from '../utils/SoundConfig'
import { SUPPORTED_LOCALES, getLocale, setLocale } from '../utils/LocaleManager'
import { startKeepAlive } from '../utils/AudioKeepAlive'

export default class TitleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image
  private playButton!: Phaser.GameObjects.Image
  private configButton!: Phaser.GameObjects.Image
  private modalContainer: Phaser.GameObjects.Container | null = null
  private charmAudio: HTMLAudioElement | null = null

  constructor() {
    super({ key: 'TitleScene' })
  }

  create(): void {
    console.log('[TitleScene] create() called')

    this.scene.setActive(true)
    this.scene.setVisible(true)

    this.cameras.main.stopFollow()
    this.cameras.main.setScroll(0, 0)
    this.cameras.main.removeBounds()
    this.cameras.main.resetFX()
    this.cameras.main.setBackgroundColor('#000000')
    this.cameras.main.setAlpha(1)
    this.cameras.main.setVisible(true)

    this.background = this.add.image(960, 540, 'title')
    this.background.setDisplaySize(1920, 1080)
    this.background.setDepth(0)

    // charm を事前フェッチ（ボタン押下時に即再生するため）
    this.charmAudio = new Audio('assets/sounds/se/charm.m4a')
    this.charmAudio.load()

    this.createPlayButton()
    this.createConfigButton()

    console.log('[TitleScene] create() completed')
  }

  private createPlayButton(): void {
    const buttonX = 960
    const buttonY = 800

    this.playButton = this.add.image(buttonX, buttonY, 'btn_play')
    this.playButton.setScale(2)
    this.playButton.setInteractive({ useHandCursor: true })

    this.playButton.on('pointerover', () => { this.playButton.setScale(2.2) })
    this.playButton.on('pointerout',  () => { this.playButton.setScale(2) })
    this.playButton.on('pointerdown', () => { this.playButton.setScale(1.9) })
    this.playButton.on('pointerup',   () => {
      this.playButton.setScale(2.2)

      // ① 事前ロード済み charm を即再生（iOS ユーザーアクティベーション取得 + 効果音）
      if (this.charmAudio) {
        this.charmAudio.currentTime = 0
        this.charmAudio.play().catch(() => {})
      }

      // ② Web Audio API コンテキストを resume し、ループ無音バッファで active に保つ
      //    iOS は再生が途切れると context を自動 suspend するためループが必須
      if ('context' in this.sound) {
        const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context
        if (ctx) {
          ctx.resume().then(() => {
            startKeepAlive(ctx)
          }).catch(() => {})
        }
      }

      // ChapterLoadingScene で第一章アセットをプリロードしてから MainScene へ
      const config = this.cache.json.get('gameflow')
      const firstChapterId = config?.chapters?.[0]?.id ?? 'chapter1'
      this.scene.start('ChapterLoadingScene', { chapterId: firstChapterId })
    })
  }

  private createConfigButton(): void {
    const buttonX = 960
    const buttonY = 930

    this.configButton = this.add.image(buttonX, buttonY, 'btn_config')
    this.configButton.setScale(2)
    this.configButton.setInteractive({ useHandCursor: true })

    this.configButton.on('pointerover', () => { this.configButton.setScale(2.2) })
    this.configButton.on('pointerout',  () => { this.configButton.setScale(2) })
    this.configButton.on('pointerdown', () => { this.configButton.setScale(1.9) })
    this.configButton.on('pointerup',   () => {
      this.configButton.setScale(2)
      this.openVolumeModal()
    })
  }

  private openVolumeModal(): void {
    if (this.modalContainer) return

    const cfg = loadSoundConfig()
    const W = 600
    const H = 520
    const cx = 960
    const cy = 540

    const container = this.add.container(0, 0).setDepth(5000)
    this.modalContainer = container

    // オーバーレイ
    const overlay = this.add.graphics()
    overlay.fillStyle(0x000000, 0.7)
    overlay.fillRect(0, 0, 1920, 1080)
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1920, 1080), Phaser.Geom.Rectangle.Contains)

    // パネル背景
    const panel = this.add.graphics()
    panel.fillStyle(0x1a1a2e, 1)
    panel.fillRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)
    panel.lineStyle(2, 0x6644aa, 1)
    panel.strokeRoundedRect(cx - W / 2, cy - H / 2, W, H, 16)

    // タイトル
    const title = this.add.text(cx, cy - H / 2 + 36, 'SOUND CONFIG', {
      fontSize: '28px', fontFamily: 'monospace', color: '#ccaaff'
    }).setOrigin(0.5)

    container.add([overlay, panel, title])

    // スライダー 3本
    const sliderDefs: Array<{ label: string; key: keyof ReturnType<typeof loadSoundConfig>; y: number }> = [
      { label: 'BGM',        key: 'bgmVolume',     y: cy - 80 },
      { label: 'SE',         key: 'seVolume',       y: cy },
      { label: 'Story SE',   key: 'storySeVolume',  y: cy + 80 },
    ]

    sliderDefs.forEach(({ label, key, y }) => {
      this.buildSlider(container, cfg, label, key, cx, y)
    })

    // 言語選択
    const langLabel = this.add.text(cx - 240, cy + 155, 'LANGUAGE', {
      fontSize: '20px', fontFamily: 'monospace', color: '#ffffff'
    }).setOrigin(0, 0.5)
    container.add(langLabel)

    const currentLocale = getLocale()
    const btnSpacing = 100
    const btnStartX = cx - (SUPPORTED_LOCALES.length - 1) * btnSpacing / 2

    SUPPORTED_LOCALES.forEach((locale, i) => {
      const isActive = locale.code === currentLocale
      const bx = btnStartX + i * btnSpacing
      const by = cy + 200

      const bg = this.add.graphics()
      bg.fillStyle(isActive ? 0x6644aa : 0x333355, 1)
      bg.fillRoundedRect(bx - 42, by - 16, 84, 32, 6)

      const btn = this.add.text(bx, by, locale.label, {
        fontSize: '16px', fontFamily: 'monospace',
        color: isActive ? '#ffffff' : '#aaaacc'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      btn.on('pointerover', () => btn.setColor('#ffffff'))
      btn.on('pointerout',  () => btn.setColor(locale.code === getLocale() ? '#ffffff' : '#aaaacc'))
      btn.on('pointerup', () => {
        setLocale(locale.code)
        this.closeVolumeModal()
        this.openVolumeModal()
      })

      container.add([bg, btn])
    })

    // 閉じるボタン
    const closeBtn = this.add.text(cx + W / 2 - 24, cy - H / 2 + 16, '✕', {
      fontSize: '24px', fontFamily: 'monospace', color: '#ffffff'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    closeBtn.on('pointerover', () => closeBtn.setColor('#ff8888'))
    closeBtn.on('pointerout',  () => closeBtn.setColor('#ffffff'))
    closeBtn.on('pointerup',   () => this.closeVolumeModal())

    container.add(closeBtn)
  }

  private buildSlider(
    container: Phaser.GameObjects.Container,
    cfg: ReturnType<typeof loadSoundConfig>,
    label: string,
    key: keyof ReturnType<typeof loadSoundConfig>,
    cx: number,
    y: number
  ): void {
    const trackLeft  = cx - 160
    const trackRight = cx + 80
    const trackLen   = trackRight - trackLeft
    const initialVal = cfg[key] as number

    // ラベル
    const labelText = this.add.text(cx - 240, y, label, {
      fontSize: '20px', fontFamily: 'monospace', color: '#ffffff'
    }).setOrigin(0, 0.5)

    // トラック
    const track = this.add.graphics()
    track.fillStyle(0x444466, 1)
    track.fillRoundedRect(trackLeft, y - 4, trackLen, 8, 4)

    // サム（ドラッグ可能な円）
    const thumbX = trackLeft + initialVal * trackLen
    const thumb = this.add.circle(thumbX, y, 14, 0xaa88ff, 1)
    thumb.setInteractive({ useHandCursor: true, draggable: true })
    this.input.setDraggable(thumb)

    // 値テキスト
    const valText = this.add.text(cx + 100, y, Math.round(initialVal * 100) + '%', {
      fontSize: '18px', fontFamily: 'monospace', color: '#cccccc'
    }).setOrigin(0, 0.5)

    // 試聴ボタン
    const demoBtn = this.add.text(cx + 170, y, '▶試聴', {
      fontSize: '16px', fontFamily: 'monospace', color: '#88ffcc'
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })

    demoBtn.on('pointerover', () => demoBtn.setColor('#ffffff'))
    demoBtn.on('pointerout',  () => demoBtn.setColor('#88ffcc'))
    demoBtn.on('pointerup',   () => {
      const currentCfg = loadSoundConfig()
      const vol = currentCfg[key] as number
      // ロード済みのSEがあれば試聴
      const demoKey = this.cache.audio.exists('se_player_hit') ? 'se_player_hit'
        : this.cache.audio.exists('spiral') ? 'spiral' : null
      if (demoKey) {
        this.sound.play(demoKey, { volume: vol, loop: false })
      }
    })

    // ドラッグ処理
    thumb.on('drag', (_ptr: Phaser.Input.Pointer, dragX: number) => {
      const clampedX = Phaser.Math.Clamp(dragX, trackLeft, trackRight)
      thumb.x = clampedX
      const newVal = parseFloat(((clampedX - trackLeft) / trackLen).toFixed(2))
      valText.setText(Math.round(newVal * 100) + '%')

      const updated = loadSoundConfig()
      updated[key] = newVal
      saveSoundConfig(updated)
    })

    container.add([labelText, track, thumb, valText, demoBtn])
  }

  private closeVolumeModal(): void {
    if (!this.modalContainer) return
    this.modalContainer.destroy()
    this.modalContainer = null
  }
}
