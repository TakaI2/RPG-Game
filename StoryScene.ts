// src/scenes/StoryScene.ts
import Phaser from 'phaser'
import DialogUI from '../systems/Dialog'
import { events } from '../systems/Events'

type Cut = { name: string; portrait: string; side: 'left'|'right'; lines: string[] }
type Script = { id: string; background: string; cuts: Cut[]; returnTo: 'game' }

export default class StoryScene extends Phaser.Scene {
  private ui!: DialogUI
  private space!: Phaser.Input.Keyboard.Key
  private script!: Script
  private cutIndex = 0
  private lineIndex = 0
  private bg!: Phaser.GameObjects.Image
  private left?: Phaser.GameObjects.Image
  private right?: Phaser.GameObjects.Image

  constructor(){ super('StoryScene') }

  init(data: { key: string }) {
    this.cutIndex = 0; this.lineIndex = 0
    this.registry.set('storyKey', data.key)
  }

  preload() {
    const key = this.registry.get('storyKey') as string
    this.load.json(`story_${key}`, `src/assets/story/scripts/${key}.json`)
    // いったんJSONだけ読み、createで実データに基づき画像を条件ロード
  }

  create() {
    const key = this.registry.get('storyKey') as string
    this.script = this.cache.json.get(`story_${key}`) as Script

    // 背景ロード（必要なら事前プリロードに）
    this.load.image(`bg_${this.script.background}`, `src/assets/story/bg/${this.script.background}`)
    // 全立ち絵をユニーク化してロード
    const portraits = Array.from(new Set(this.script.cuts.map(c => c.portrait)))
    portraits.forEach(p => this.load.image(`pt_${p}`, `src/assets/story/portraits/${p}`))
    this.load.once('complete', () => this.startStory())
    this.load.start()
  }

  private startStory(){
    this.cameras.main.fadeIn(200)
    this.bg = this.add.image(0,0, `bg_${this.script.background}`).setOrigin(0,0).setScrollFactor(0)
    this.left  = this.add.image(480,  540, 'pt_'+this.script.cuts[0].portrait).setVisible(false)
    this.right = this.add.image(1440, 540, 'pt_'+this.script.cuts[0].portrait).setVisible(false)

    this.ui = new DialogUI(this)
    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.space.on('down', () => this.next())

    this.playCut()
  }

  private playCut(){
    const cut = this.script.cuts[this.cutIndex]
    // 立ち絵の表示更新
    this.left?.setVisible(cut.side === 'left').setTexture('pt_' + cut.portrait)
    this.right?.setVisible(cut.side === 'right').setTexture('pt_' + cut.portrait)
    this.lineIndex = 0
    this.ui.show(cut.name, { lines: [cut.lines[this.lineIndex]] })
  }

  private next(){
    // DialogUIがタイプ中なら全文表示
    if (this.ui.visible) {
      // DialogUI.next() は「タイプ中なら即時全表示／終わってたら次へ」の仕様
      this.ui.next()
      // 直後にUIが閉じた＝cutの行が終わった合図なので次処理
      if (!this.ui.visible) this.afterLine()
    }
  }

  private afterLine(){
    const cut = this.script.cuts[this.cutIndex]
    this.lineIndex++
    if (this.lineIndex < cut.lines.length) {
      this.ui.show(cut.name, { lines: [cut.lines[this.lineIndex]] })
      return
    }
    // 次のカットへ
    this.cutIndex++
    if (this.cutIndex < this.script.cuts.length) {
      this.playCut()
      return
    }
    // 完走：ゲームへ復帰
    this.cameras.main.fadeOut(150, 0,0,0, (_:any, progress:number) => {
      if (progress === 1) {
        events.emit('story:end', { id: this.script.id })
        this.scene.stop()
      }
    })
  }
}
