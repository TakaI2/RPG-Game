import Phaser from 'phaser'
import { GAME_W, GAME_H } from '../../config'
import { COLORS, GAUGE } from './SurvivorConfig'

/**
 * サバイバーモードの UI（UIカメラ側に描画）。
 * すべて1つの Container に入れ、MainScene.setupCameras でメインカメラから除外してもらう。
 */

export type SurvivorResultKind = 'clear' | 'defeat'

export interface SurvivorHud {
  readonly container: Phaser.GameObjects.Container
  setVisible(visible: boolean): void
  update(clockMs: number, kills: number, gauge: number, gaugeMax: number, burstRatio: number): void
  setButtonVisible(visible: boolean): void
  banner(text: string, color: number, holdMs: number): void
  showResult(kind: SurvivorResultKind, clockMs: number, kills: number): void
  reset(): void
}

const GAUGE_X = 20
const GAUGE_Y = 74
const GAUGE_LABEL_W = 110
const GAUGE_W = 400
const GAUGE_H = 22
const BUTTON_X = GAME_W - 220
const BUTTON_Y = GAME_H - 190
const BUTTON_R = 92
const HUD_DEPTH = 9000

const textStyle = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize: `${size}px`,
  fontFamily: 'Courier New, monospace',
  fontStyle: 'bold',
  color,
  stroke: '#000000',
  strokeThickness: Math.max(3, Math.round(size / 6)),
})

const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function createSurvivorHud(scene: Phaser.Scene, onBurstPressed: () => void): SurvivorHud {
  const container = scene.add.container(0, 0).setDepth(HUD_DEPTH).setScrollFactor(0)

  // ── 撃破ゲージ ──
  const gaugeLabel = scene.add.text(GAUGE_X, GAUGE_Y - 4, 'FLAME', textStyle(24, '#ffb070'))
  const gaugeBg = scene.add.rectangle(GAUGE_X + GAUGE_LABEL_W, GAUGE_Y, GAUGE_W, GAUGE_H, COLORS.gaugeBg, 0.85)
    .setOrigin(0, 0)
    .setStrokeStyle(3, 0x000000, 1)
  const gaugeFill = scene.add.rectangle(GAUGE_X + GAUGE_LABEL_W, GAUGE_Y, GAUGE_W, GAUGE_H, COLORS.gaugeFill, 1)
    .setOrigin(0, 0)
  gaugeFill.scaleX = 0

  const killsText = scene.add.text(GAUGE_X, GAUGE_Y + 34, '', textStyle(24, '#ffffff'))
  // 上中央はボスHPバーが使うため右上に置く（開発時の LOG DL ボタンの下）
  const timerText = scene.add.text(GAME_W - 40, 80, '00:00', textStyle(40, '#ffffff')).setOrigin(1, 0)

  // ── 火炎バーストボタン ──
  const button = scene.add.container(BUTTON_X, BUTTON_Y)
  const glow = scene.add.circle(0, 0, BUTTON_R + 18, COLORS.gaugeFull, 0.25)
  const disc = scene.add.circle(0, 0, BUTTON_R, 0xc2410c, 0.95).setStrokeStyle(6, COLORS.gaugeFull, 1)
  const btnTitle = scene.add.text(0, -14, 'FLAME\nBURST', { ...textStyle(30, '#fff7d6'), align: 'center' }).setOrigin(0.5)
  const btnKey = scene.add.text(0, 50, `[${GAUGE.key}]`, textStyle(20, '#ffe08a')).setOrigin(0.5)
  button.add([glow, disc, btnTitle, btnKey])
  disc.setInteractive({ useHandCursor: true })
  disc.on('pointerdown', () => {
    onBurstPressed()
  })
  button.setVisible(false)
  const buttonPulse = scene.tweens.add({
    targets: button,
    scale: { from: 1, to: 1.08 },
    duration: 420,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    paused: true,
  })
  const glowPulse = scene.tweens.add({
    targets: glow,
    alpha: { from: 0.15, to: 0.55 },
    duration: 420,
    yoyo: true,
    repeat: -1,
    paused: true,
  })

  // リザルトなど後から生成するもの
  const transient: Phaser.GameObjects.GameObject[] = []

  container.add([gaugeLabel, gaugeBg, gaugeFill, killsText, timerText, button])
  container.setVisible(false)

  const setButtonVisible = (visible: boolean): void => {
    button.setVisible(visible)
    button.setScale(1)
    if (visible) {
      buttonPulse.resume()
      glowPulse.resume()
    } else {
      buttonPulse.pause()
      glowPulse.pause()
    }
  }

  const banner = (text: string, color: number, holdMs: number): void => {
    const t = scene.add.text(GAME_W / 2, GAME_H * 0.3, text, textStyle(72, toCss(color))).setOrigin(0.5)
    t.setScale(2.2).setAlpha(0)
    container.add(t)
    transient.push(t)
    scene.tweens.chain({
      targets: t,
      tweens: [
        { scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' },
        { alpha: 0, y: t.y - 30, delay: holdMs, duration: 300 },
      ],
      onComplete: () => t.destroy(),
    })
  }

  const showResult = (kind: SurvivorResultKind, clockMs: number, kills: number): void => {
    setButtonVisible(false)
    const shade = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0).setOrigin(0, 0)
    const title = scene.add.text(
      GAME_W / 2, GAME_H / 2 - 70,
      kind === 'clear' ? 'STAGE CLEAR' : 'GAME OVER',
      textStyle(96, kind === 'clear' ? '#ffd23f' : '#ff3040'),
    ).setOrigin(0.5).setAlpha(0)
    const stats = scene.add.text(
      GAME_W / 2, GAME_H / 2 + 50,
      `TIME ${formatTime(clockMs)}    撃破 ${kills}`,
      textStyle(40, '#ffffff'),
    ).setOrigin(0.5).setAlpha(0)
    container.add([shade, title, stats])
    transient.push(shade, title, stats)
    scene.tweens.add({ targets: shade, fillAlpha: 0.55, duration: 500 })
    scene.tweens.add({ targets: [title, stats], alpha: 1, duration: 500, delay: 150 })
  }

  return {
    container,
    setVisible: (visible) => { container.setVisible(visible) },
    update: (clockMs, kills, gauge, gaugeMax, burstRatio) => {
      timerText.setText(formatTime(clockMs))
      killsText.setText(`撃破 ${kills}`)
      // バースト中は残り時間をゲージで表示
      const ratio = burstRatio > 0 ? burstRatio : Phaser.Math.Clamp(gauge / gaugeMax, 0, 1)
      gaugeFill.scaleX = ratio
      gaugeFill.fillColor = burstRatio > 0 || ratio >= 1 ? COLORS.gaugeFull : COLORS.gaugeFill
    },
    setButtonVisible,
    banner,
    showResult,
    reset: () => {
      transient.forEach(go => go.destroy())
      transient.length = 0
      setButtonVisible(false)
      gaugeFill.scaleX = 0
    },
  }
}
