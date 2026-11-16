import Phaser from 'phaser'
import { COLORS } from './SurvivorConfig'

/**
 * サバイバーモードの戦闘エフェクト（ワールド座標側）。
 * 画像素材を増やさないよう、斬撃・火花のテクスチャはここでプロシージャル生成する。
 */

const TEX_SPARK = 'sv_spark'
const TEX_CRESCENT = 'sv_crescent'
const CRESCENT_SIZE = 256
const CRESCENT_RADIUS = 110
const MAX_DAMAGE_NUMBERS = 30
const DEPTH_FX = 12

export interface SurvivorEffects {
  /** プレイヤーを中心とした全方位斬撃 */
  slash(target: Phaser.GameObjects.Components.Transform, radius: number): void
  sparks(x: number, y: number, count: number): void
  blood(x: number, y: number, count: number): void
  fire(x: number, y: number, count: number): void
  damageNumber(x: number, y: number, value: number, color: string): void
  shake(duration: number, intensity: number): void
  flash(duration: number, color: number): void
  destroy(): void
}

function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX_SPARK)) {
    const g = scene.make.graphics({}, false)
    // 中心が明るいソフトな円
    for (let r = 8; r >= 1; r--) {
      g.fillStyle(0xffffff, 0.12 + (8 - r) * 0.11)
      g.fillCircle(8, 8, r)
    }
    g.generateTexture(TEX_SPARK, 16, 16)
    g.destroy()
  }

  if (!scene.textures.exists(TEX_CRESCENT)) {
    // 中央が太く両端が細い三日月形の斬撃軌跡
    const g = scene.make.graphics({}, false)
    const c = CRESCENT_SIZE / 2
    const layers = 7
    for (let k = 0; k < layers; k++) {
      const span = Phaser.Math.DegToRad(150 - k * 18)
      const width = 3 + k * 2.2
      const alpha = 0.18 + k * 0.12
      g.lineStyle(width, 0xffffff, Math.min(1, alpha))
      g.beginPath()
      g.arc(c, c, CRESCENT_RADIUS - k * 2.5, -span / 2, span / 2, false)
      g.strokePath()
    }
    g.generateTexture(TEX_CRESCENT, CRESCENT_SIZE, CRESCENT_SIZE)
    g.destroy()
  }
}

function makeEmitter(
  scene: Phaser.Scene,
  tint: number,
  speedMin: number,
  speedMax: number,
  lifespan: number,
  scaleStart: number,
): Phaser.GameObjects.Particles.ParticleEmitter {
  const emitter = scene.add.particles(0, 0, TEX_SPARK, {
    speed: { min: speedMin, max: speedMax },
    angle: { min: 0, max: 360 },
    lifespan: { min: lifespan * 0.5, max: lifespan },
    scale: { start: scaleStart, end: 0 },
    alpha: { start: 1, end: 0 },
    tint,
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  })
  emitter.setDepth(DEPTH_FX)
  return emitter
}

export function createSurvivorEffects(
  scene: Phaser.Scene,
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void,
): SurvivorEffects {
  ensureTextures(scene)

  const sparkEmitter = makeEmitter(scene, COLORS.spark, 80, 260, 380, 0.9)
  const bloodEmitter = makeEmitter(scene, COLORS.blood, 60, 220, 600, 1.4)
  const fireEmitter = makeEmitter(scene, COLORS.fire, 40, 180, 450, 1.2)
  ;[sparkEmitter, bloodEmitter, fireEmitter].forEach(addWorldObject)

  let damageNumberCount = 0

  const slash = (target: Phaser.GameObjects.Components.Transform, radius: number): void => {
    const baseScale = radius / CRESCENT_RADIUS
    const startAngle = Math.random() * Math.PI * 2
    const parts: Phaser.GameObjects.Image[] = []
    for (let i = 0; i < 2; i++) {
      const img = scene.add.image(target.x, target.y, TEX_CRESCENT)
      img.setBlendMode(Phaser.BlendModes.ADD)
      img.setTint(i === 0 ? COLORS.slashCore : COLORS.slash)
      img.setRotation(startAngle + i * Math.PI)
      img.setScale(baseScale * 0.8)
      img.setDepth(DEPTH_FX)
      addWorldObject(img)
      parts.push(img)
    }

    const ring = scene.add.graphics()
    ring.lineStyle(4, COLORS.slash, 0.9)
    ring.strokeCircle(0, 0, radius)
    ring.setPosition(target.x, target.y)
    ring.setScale(0.55)
    ring.setBlendMode(Phaser.BlendModes.ADD)
    ring.setDepth(DEPTH_FX)
    addWorldObject(ring)

    const follow = (): void => {
      parts.forEach(p => p.setPosition(target.x, target.y))
      ring.setPosition(target.x, target.y)
    }

    parts.forEach((img, i) => {
      scene.tweens.add({
        targets: img,
        rotation: img.rotation + Math.PI * 1.6,
        scale: baseScale * 1.08,
        alpha: { from: 1, to: 0 },
        duration: 230,
        ease: 'Cubic.easeOut',
        onUpdate: i === 0 ? follow : undefined,
        onComplete: () => img.destroy(),
      })
    })
    scene.tweens.add({
      targets: ring,
      scale: 1.1,
      alpha: { from: 0.9, to: 0 },
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  const damageNumber = (x: number, y: number, value: number, color: string): void => {
    if (damageNumberCount >= MAX_DAMAGE_NUMBERS) return
    damageNumberCount++
    const txt = scene.add.text(x + Phaser.Math.Between(-8, 8), y, String(value), {
      fontSize: '18px',
      fontFamily: 'Courier New, monospace',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH_FX + 1)
    addWorldObject(txt)
    scene.tweens.add({
      targets: txt,
      y: y - 34,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.3, to: 0.9 },
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => {
        txt.destroy()
        damageNumberCount--
      },
    })
  }

  return {
    slash,
    sparks: (x, y, count) => { sparkEmitter.explode(count, x, y) },
    blood: (x, y, count) => { bloodEmitter.explode(count, x, y) },
    fire: (x, y, count) => { fireEmitter.explode(count, x, y) },
    damageNumber,
    shake: (duration, intensity) => { scene.cameras.main.shake(duration, intensity) },
    flash: (duration, color) => {
      scene.cameras.main.flash(duration, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
    },
    destroy: () => {
      sparkEmitter.destroy()
      bloodEmitter.destroy()
      fireEmitter.destroy()
    },
  }
}
