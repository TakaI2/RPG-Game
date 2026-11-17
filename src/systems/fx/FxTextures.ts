import Phaser from 'phaser'
import type { FxShape } from './FxTypes'

/**
 * 画像素材を使わない図形テクスチャ。すべて白で描き、表示時に tint で着色する。
 * radius はテクスチャ内で「図形の半径」にあたる px（表示サイズ→拡大率の換算に使う）。
 */

export interface FxShapeTexture {
  key: string
  radius: number
}

const SIZE = 256
const C = SIZE / 2

export const FX_SHAPE_TEXTURES: Record<FxShape, FxShapeTexture> = {
  ring:      { key: 'fxshape_ring', radius: 112 },
  ring_thin: { key: 'fxshape_ring_thin', radius: 120 },
  flash:     { key: 'fxshape_flash', radius: 128 },
  crescent:  { key: 'fxshape_crescent', radius: 110 },
  dot:       { key: 'fxshape_dot', radius: 16 },
}

type Draw = (g: Phaser.GameObjects.Graphics) => void

const drawRing = (radius: number, width: number): Draw => g => {
  // 外側ほど薄い数本の線で柔らかい縁にする
  const layers = 4
  for (let i = layers; i >= 1; i--) {
    g.lineStyle(width * (i / layers) * 1.8, 0xffffff, 0.25 + (1 - i / layers) * 0.6)
    g.strokeCircle(C, C, radius)
  }
}

const drawFlash: Draw = g => {
  const steps = 24
  for (let i = steps; i >= 1; i--) {
    const t = i / steps
    g.fillStyle(0xffffff, 0.06 + (1 - t) * 0.1)
    g.fillCircle(C, C, FX_SHAPE_TEXTURES.flash.radius * t)
  }
}

const drawCrescent: Draw = g => {
  // 中央が太く両端が細い三日月形の斬撃軌跡
  const layers = 7
  const r = FX_SHAPE_TEXTURES.crescent.radius
  for (let k = 0; k < layers; k++) {
    const span = Phaser.Math.DegToRad(150 - k * 18)
    g.lineStyle(3 + k * 2.2, 0xffffff, Math.min(1, 0.18 + k * 0.12))
    g.beginPath()
    g.arc(C, C, r - k * 2.5, -span / 2, span / 2, false)
    g.strokePath()
  }
}

const drawDot = (size: number): Draw => g => {
  const c = size / 2
  for (let r = c; r >= 1; r--) {
    g.fillStyle(0xffffff, 0.08 + (1 - r / c) * 0.5)
    g.fillCircle(c, c, r)
  }
}

const DRAWERS: Record<FxShape, { draw: Draw; size: number }> = {
  ring:      { draw: drawRing(FX_SHAPE_TEXTURES.ring.radius, 8), size: SIZE },
  ring_thin: { draw: drawRing(FX_SHAPE_TEXTURES.ring_thin.radius, 2.5), size: SIZE },
  flash:     { draw: drawFlash, size: SIZE },
  crescent:  { draw: drawCrescent, size: SIZE },
  dot:       { draw: drawDot(FX_SHAPE_TEXTURES.dot.radius * 2), size: FX_SHAPE_TEXTURES.dot.radius * 2 },
}

/** 図形テクスチャを（未生成なら）生成する。何度呼んでもよい */
export function ensureFxTextures(scene: Phaser.Scene): void {
  (Object.keys(DRAWERS) as FxShape[]).forEach(shape => {
    const { key } = FX_SHAPE_TEXTURES[shape]
    if (scene.textures.exists(key)) return
    const { draw, size } = DRAWERS[shape]
    const g = scene.make.graphics({}, false)
    draw(g)
    g.generateTexture(key, size, size)
    g.destroy()
  })
}
