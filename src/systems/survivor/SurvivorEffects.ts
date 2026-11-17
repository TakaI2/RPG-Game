import Phaser from 'phaser'
import { COLORS } from './SurvivorConfig'
import { ensureFxTextures, FX_SHAPE_TEXTURES } from '../fx/FxTextures'
import type { FxManager } from '../fx/FxManager'
import type { FxEvent } from '../fx/FxTypes'

/**
 * サバイバーモードの戦闘エフェクト（ワールド座標側）。
 * 場面ごとのメソッド（onSlash など）は、fx-bindings.json に割り当てたプリセットがあればそれを再生し、
 * 無ければ下のプロシージャル演出（従来の見た目）にフォールバックする。
 */

const TEX_SPARK = 'sv_spark'
const TEX_CRESCENT = FX_SHAPE_TEXTURES.crescent.key
const TEX_RING = FX_SHAPE_TEXTURES.ring_thin.key
const RING_RADIUS = FX_SHAPE_TEXTURES.ring_thin.radius
const PICKUP_RING_RADIUS = 60
const PICKUP_RING_MS = 380
const CRESCENT_RADIUS = FX_SHAPE_TEXTURES.crescent.radius
const MAX_DAMAGE_NUMBERS = 30
const DEPTH_FX = 12

type FollowTarget = Phaser.GameObjects.Components.Transform & { active: boolean }

export interface SurvivorEffects {
  // ── 場面ごと（割り当て優先） ──
  onSlash(target: FollowTarget, radius: number): void
  onEnemyHit(x: number, y: number): void
  onEnemyKill(x: number, y: number): void
  onBossHit(x: number, y: number): void
  onBurstStart(target: FollowTarget): void
  onFlameHit(x: number, y: number): void
  onBossEngage(x: number, y: number): void
  onBossDefeat(x: number, y: number): void
  onPlayerHit(x: number, y: number): void
  onPickupUpgrade(target: FollowTarget, color: number): void
  onPickupHeal(target: FollowTarget): void
  // ── 汎用 ──
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

  // 三日月は FxTextures と共有
  ensureFxTextures(scene)
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
  fx: FxManager | null,
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

  /** 取得演出（割り当てが無いとき）: プレイヤーに追従して広がるリング */
  const pickupRing = (target: FollowTarget, color: number): void => {
    const img = scene.add.image(target.x, target.y, TEX_RING)
      .setTint(color).setDepth(DEPTH_FX).setScale(0.2)
    addWorldObject(img)
    scene.tweens.add({
      targets: img,
      scale: PICKUP_RING_RADIUS / RING_RADIUS,
      alpha: { from: 1, to: 0 },
      duration: PICKUP_RING_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => { if (target.active) img.setPosition(target.x, target.y) },
      onComplete: () => img.destroy(),
    })
  }

  const sparks = (x: number, y: number, count: number): void => { sparkEmitter.explode(count, x, y) }
  const blood = (x: number, y: number, count: number): void => { bloodEmitter.explode(count, x, y) }
  const fire = (x: number, y: number, count: number): void => { fireEmitter.explode(count, x, y) }
  const bound = (event: FxEvent, x: number, y: number, follow?: FollowTarget): boolean =>
    fx !== null && fx.playBinding(event, x, y, follow ? { follow } : {})

  return {
    onSlash: (target, radius) => { if (!bound('slash', target.x, target.y, target)) slash(target, radius) },
    onEnemyHit: (x, y) => { if (!bound('enemyHit', x, y)) sparks(x, y, 7) },
    onEnemyKill: (x, y) => {
      if (bound('enemyKill', x, y)) return
      blood(x, y, 14)
      sparks(x, y, 6)
    },
    onBossHit: (x, y) => { if (!bound('bossHit', x, y)) sparks(x, y, 12) },
    onBurstStart: (target) => { if (!bound('burstStart', target.x, target.y, target)) fire(target.x, target.y, 40) },
    onFlameHit: (x, y) => { if (!bound('flameHit', x, y)) fire(x, y, 4) },
    onBossEngage: (x, y) => { bound('bossEngage', x, y) },
    onBossDefeat: (x, y) => { if (!bound('bossDefeat', x, y)) fire(x, y, 60) },
    onPlayerHit: (x, y) => { if (!bound('playerHit', x, y)) blood(x, y, 6) },
    onPickupUpgrade: (target, color) => {
      if (bound('pickupUpgrade', target.x, target.y, target)) return
      pickupRing(target, color)
      sparks(target.x, target.y, 10)
    },
    onPickupHeal: (target) => { if (!bound('pickupHeal', target.x, target.y, target)) pickupRing(target, COLORS.heal) },
    slash,
    sparks,
    blood,
    fire,
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
