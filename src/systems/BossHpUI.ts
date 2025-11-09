import Phaser from 'phaser'
import { GAME_W } from '../config'

/**
 * ボスHP表示UI
 * 画面上部中央にボスのHP・名前・フェーズを表示
 */
export class BossHpUI {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private barBg: Phaser.GameObjects.Graphics
  private barFill: Phaser.GameObjects.Graphics
  private hpText: Phaser.GameObjects.Text
  private nameText: Phaser.GameObjects.Text
  private phaseText: Phaser.GameObjects.Text

  private readonly BAR_WIDTH = 400
  private readonly BAR_HEIGHT = 24

  constructor(scene: Phaser.Scene, bossName: string) {
    this.scene = scene
    this.container = scene.add.container(GAME_W / 2, 40).setDepth(1000).setScrollFactor(0)

    // 背景バー
    this.barBg = scene.add.graphics()
    this.barBg.fillStyle(0x333333)
    this.barBg.fillRoundedRect(-this.BAR_WIDTH / 2, 0, this.BAR_WIDTH, this.BAR_HEIGHT, 8)

    // HPバー（上に重ねる）
    this.barFill = scene.add.graphics()

    // ボス名
    this.nameText = scene.add.text(0, -30, bossName, {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5)

    // HP数値
    this.hpText = scene.add.text(0, this.BAR_HEIGHT / 2, '', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#ffffff'
    }).setOrigin(0.5)

    // フェーズ表示
    this.phaseText = scene.add.text(this.BAR_WIDTH / 2 + 20, this.BAR_HEIGHT / 2, '', {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#ffff00'
    }).setOrigin(0, 0.5)

    this.container.add([this.barBg, this.barFill, this.nameText, this.hpText, this.phaseText])
    this.container.setVisible(false)
  }

  /**
   * HP更新
   * @param currentHp 現在のHP
   * @param maxHp 最大HP
   * @param phase 現在のフェーズ
   */
  update(currentHp: number, maxHp: number, phase: number) {
    // HP値を0以上に制限
    const hp = Math.max(0, currentHp)

    // HPバー更新
    const fillWidth = (hp / maxHp) * this.BAR_WIDTH
    this.barFill.clear()

    // フェーズごとに色を変える
    let barColor = 0xff0000 // 赤（デフォルト）
    if (phase === 2) {
      barColor = 0xff00ff // 紫（フェーズ2）
    }

    this.barFill.fillStyle(barColor)
    this.barFill.fillRoundedRect(-this.BAR_WIDTH / 2, 0, fillWidth, this.BAR_HEIGHT, 8)

    // テキスト更新
    this.hpText.setText(`${hp} / ${maxHp}`)
    this.phaseText.setText(`Phase ${phase}`)
  }

  /**
   * UI表示
   */
  show() {
    this.container.setVisible(true)

    // フェードイン演出
    this.container.setAlpha(0)
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 500
    })
  }

  /**
   * UI非表示
   */
  hide() {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        this.container.setVisible(false)
      }
    })
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.container.destroy()
  }
}
