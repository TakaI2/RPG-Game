import Phaser from 'phaser'
import { GAME_W } from '../config'

export type DialogData = { portraitTint?: number; lines: string[] }

export default class DialogUI {
  private scene: Phaser.Scene
  private container!: Phaser.GameObjects.Container
  private nameText!: Phaser.GameObjects.Text
  private msgText!: Phaser.GameObjects.Text
  private portrait!: Phaser.GameObjects.Image

  private lines: string[] = []
  private idx = 0
  private typing = false
  private fullLine = ''

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.create()
  }

  private create() {
    const panel = this.scene.add.graphics()
    panel.fillStyle(0x000000, 0.65)
    panel.fillRoundedRect(0, 0, GAME_W - 80, 220, 12)

    const panelTex = panel.generateTexture('dialog_panel', GAME_W - 80, 220)
    panel.destroy()

    this.container = this.scene.add.container(40, 1080 - 40 - 220).setScrollFactor(0)
    const bg = this.scene.add.image(0, 0, 'dialog_panel').setOrigin(0, 0)
    this.portrait = this.scene.add.image(20, 10, 'portrait').setOrigin(0, 0)
    this.nameText = this.scene.add.text(240, 18, '???', { fontFamily: 'monospace', fontSize: '28px', color: '#aee2ff' })
    this.msgText = this.scene.add.text(240, 64, '', { fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', wordWrap: { width: GAME_W - 360 } })

    this.container.add([bg, this.portrait, this.nameText, this.msgText])
    this.container.setDepth(1000).setVisible(false)
  }

  get visible() { return this.container.visible }

  show(name: string, data: DialogData) {
    console.log('[DialogUI] show called with:', { name, lines: data.lines })
    this.lines = data.lines.slice()
    this.idx = 0
    this.nameText.setText(name)
    this.portrait.setTint(data.portraitTint ?? 0xffffff)
    this.container.setVisible(true)
    this.typeLine(this.lines[this.idx])
  }

  next() {
    console.log('[DialogUI] next() called, idx:', this.idx, 'lines.length:', this.lines.length, 'typing:', this.typing)
    if (this.typing) {
      console.log('[DialogUI] Still typing, showing full line immediately')
      this.typing = false
      this.msgText.setText(this.fullLine)
      return
    }
    this.idx++
    if (this.idx >= this.lines.length) {
      console.log('[DialogUI] All lines shown, hiding dialog')
      this.container.setVisible(false)
      return
    }
    console.log('[DialogUI] Showing line', this.idx, ':', this.lines[this.idx])
    this.typeLine(this.lines[this.idx])
  }

  private typeLine(text: string) {
    this.typing = true
    this.fullLine = text
    this.msgText.setText('')

    const chars = [...text]
    let i = 0
    const timer = this.scene.time.addEvent({
      delay: 20,
      repeat: chars.length - 1,
      callback: () => {
        this.msgText.setText(this.msgText.text + chars[i])
        i++
        if (i >= chars.length) { this.typing = false; timer.remove() }
      }
    })
  }
}
