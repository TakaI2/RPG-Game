import Phaser from 'phaser'
import { COLORS, PICKUP, UPGRADES, type UpgradeId } from './SurvivorConfig'

/**
 * サバイバーモードのドロップアイテム（コイン・回復・強化）。
 * 物理ボディは使わず、毎フレームの距離判定で吸い寄せ・取得を行う（コライダー数を増やさない）。
 */

export type PickupKind =
  | { type: 'coin'; value: number }
  | { type: 'heal' }
  | { type: 'upgrade'; id: UpgradeId }

export interface SurvivorPickups {
  /** 出現位置へ少し跳ねながら落とす */
  drop(kind: PickupKind, x: number, y: number): void
  /** 中心から円状にコインをばらまく */
  scatterCoins(x: number, y: number, count: number, value: number, radius: number): void
  /** magnetRadius: この距離以内のアイテムを吸い寄せる */
  update(delta: number, player: Phaser.GameObjects.Components.Transform, magnetRadius: number): void
  /** 全アイテムをプレイヤーへ吸い寄せる（ボス撃破時） */
  vacuumAll(): void
  /** 場に残ったコインを回収したことにして片付け、合計額を返す（クリア時） */
  settleCoins(): number
  freeze(): void
  /** 全アイテムを片付ける（リトライ時） */
  clear(): void
  activeCount(): number
  destroy(): void
}

interface PickupState {
  kind: PickupKind
  age: number
  fromX: number
  fromY: number
  baseX: number
  baseY: number
  magnet: boolean
  speed: number
  phase: number
}

const TEX_COIN = 'sv_coin'
const TEX_HEAL_FALLBACK = 'sv_heal'
const HEAL_IMAGE = 'hert'
const HEAL_IMAGE_SCALE = 0.42
const GEM_SIZE = 30
const COIN_SIZE = 18
const POP_ARC = 14
const BLINK_PERIOD = 120

export const gemTextureKey = (id: UpgradeId): string => `sv_gem_${id}`

/** 強化の種類ごとに中央の記号を描く */
function drawGlyph(g: Phaser.GameObjects.Graphics, id: UpgradeId, c: number): void {
  g.lineStyle(2, 0xffffff, 1)
  g.fillStyle(0xffffff, 1)
  switch (id) {
    case 'slashRange':
      g.strokeCircle(c, c, 6)
      break
    case 'slashPower':
      g.fillRect(c - 1.5, c - 7, 3, 12)
      g.fillRect(c - 5, c + 3, 10, 2)
      break
    case 'boomerang':
      g.beginPath()
      g.arc(c, c + 3, 7, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340))
      g.strokePath()
      break
    case 'flamePower':
      g.fillTriangle(c, c - 8, c - 6, c + 6, c + 6, c + 6)
      break
    case 'flameRange':
      g.fillTriangle(c + 8, c, c, c - 6, c, c + 6)
      g.fillRect(c - 7, c - 2, 8, 4)
      break
  }
}

export function ensurePickupTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX_COIN)) {
    const g = scene.make.graphics({}, false)
    const r = COIN_SIZE / 2
    g.fillStyle(COLORS.coinEdge, 1)
    g.fillCircle(r, r, r)
    g.fillStyle(COLORS.coin, 1)
    g.fillCircle(r, r, r - 2)
    g.fillStyle(0xfff6c0, 1)
    g.fillCircle(r - 2.5, r - 2.5, 2.5)
    g.generateTexture(TEX_COIN, COIN_SIZE, COIN_SIZE)
    g.destroy()
  }
  UPGRADES.forEach(u => {
    const key = gemTextureKey(u.id)
    if (scene.textures.exists(key)) return
    const g = scene.make.graphics({}, false)
    const c = GEM_SIZE / 2
    g.fillStyle(0x000000, 0.6)
    g.fillPoints([{ x: c, y: 0 }, { x: GEM_SIZE, y: c }, { x: c, y: GEM_SIZE }, { x: 0, y: c }], true)
    g.fillStyle(u.color, 1)
    g.fillPoints([{ x: c, y: 2 }, { x: GEM_SIZE - 2, y: c }, { x: c, y: GEM_SIZE - 2 }, { x: 2, y: c }], true)
    drawGlyph(g, u.id, c)
    g.generateTexture(key, GEM_SIZE, GEM_SIZE)
    g.destroy()
  })
  if (!scene.textures.exists(HEAL_IMAGE) && !scene.textures.exists(TEX_HEAL_FALLBACK)) {
    const g = scene.make.graphics({}, false)
    g.fillStyle(COLORS.heal, 1)
    g.fillCircle(8, 9, 7)
    g.fillCircle(18, 9, 7)
    g.fillTriangle(1.5, 12, 24.5, 12, 13, 25)
    g.generateTexture(TEX_HEAL_FALLBACK, 26, 26)
    g.destroy()
  }
}

export function createSurvivorPickups(
  scene: Phaser.Scene,
  addWorldObject: (go: Phaser.GameObjects.GameObject) => void,
  onCollect: (kind: PickupKind, x: number, y: number) => void,
): SurvivorPickups {
  ensurePickupTextures(scene)
  const healTexture = scene.textures.exists(HEAL_IMAGE) ? HEAL_IMAGE : TEX_HEAL_FALLBACK
  const healScale = healTexture === HEAL_IMAGE ? HEAL_IMAGE_SCALE : 1

  const pool: Phaser.GameObjects.Image[] = []
  const states = new Map<Phaser.GameObjects.Image, PickupState>()
  let frozen = false

  const obtain = (): Phaser.GameObjects.Image => {
    const free = pool.find(img => !img.active)
    if (free) return free
    const img = scene.add.image(0, 0, TEX_COIN)
    addWorldObject(img)
    pool.push(img)
    return img
  }

  const release = (img: Phaser.GameObjects.Image): void => {
    states.delete(img)
    img.setActive(false).setVisible(false)
  }

  const coinCount = (): number => {
    let n = 0
    states.forEach(st => { if (st.kind.type === 'coin') n++ })
    return n
  }

  /** 上限超過時: 最も古いコインに額を合算する */
  const mergeIntoOldestCoin = (value: number): boolean => {
    let img: Phaser.GameObjects.Image | null = null
    let st: PickupState | null = null
    for (const [candidate, cst] of states) {
      if (cst.kind.type === 'coin' && !cst.magnet && (!st || cst.age > st.age)) {
        img = candidate
        st = cst
      }
    }
    if (!img || !st || st.kind.type !== 'coin') return false
    st.kind = { type: 'coin', value: st.kind.value + value }
    st.age = 0   // 合算したコインは寿命をリセット
    img.setScale(Math.min(PICKUP.coinScaleMax, img.scaleX + PICKUP.coinScaleStep))
    return true
  }

  const spawn = (kind: PickupKind, fromX: number, fromY: number, toX: number, toY: number): void => {
    if (kind.type === 'coin' && coinCount() >= PICKUP.maxCoins && mergeIntoOldestCoin(kind.value)) return
    const img = obtain()
    let texture = TEX_COIN
    let scale = 1
    if (kind.type === 'heal') {
      texture = healTexture
      scale = healScale
    } else if (kind.type === 'upgrade') {
      texture = gemTextureKey(kind.id)
    }
    img.setTexture(texture).setScale(scale).setAlpha(1).setDepth(PICKUP.depth)
    img.setPosition(fromX, fromY).setActive(true).setVisible(true)
    states.set(img, {
      kind,
      age: 0,
      fromX,
      fromY,
      baseX: toX,
      baseY: toY,
      magnet: false,
      speed: 0,
      phase: Math.random() * Math.PI * 2,
    })
  }

  const collect = (img: Phaser.GameObjects.Image, st: PickupState): void => {
    const x = img.x
    const y = img.y
    release(img)
    onCollect(st.kind, x, y)
  }

  const updateOne = (
    img: Phaser.GameObjects.Image,
    st: PickupState,
    delta: number,
    px: number,
    py: number,
    magnetRadius: number,
  ): void => {
    st.age += delta

    // 出現時のポップ（弧を描いて落ちる）
    if (!st.magnet && st.age < PICKUP.popDuration) {
      const t = st.age / PICKUP.popDuration
      const e = Phaser.Math.Easing.Cubic.Out(t)
      img.setPosition(
        Phaser.Math.Linear(st.fromX, st.baseX, e),
        Phaser.Math.Linear(st.fromY, st.baseY, e) - Math.sin(Math.PI * t) * POP_ARC,
      )
      return
    }

    const dx = px - st.baseX
    const dy = py - st.baseY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (!st.magnet && dist <= magnetRadius) st.magnet = true

    if (st.magnet) {
      if (dist <= PICKUP.pickupRadius) {
        collect(img, st)
        return
      }
      const dt = delta / 1000
      st.speed = Math.min(PICKUP.magnetMaxSpeed, st.speed + PICKUP.magnetAccel * dt)
      const step = Math.min(dist, st.speed * dt)
      st.baseX += (dx / dist) * step
      st.baseY += (dy / dist) * step
      img.setPosition(st.baseX, st.baseY).setAlpha(1)
      return
    }

    if (st.kind.type === 'coin') {
      if (st.age >= PICKUP.coinLifetime) {
        release(img)
        return
      }
      const blinking = st.age >= PICKUP.coinLifetime - PICKUP.coinBlinkMs
      img.setAlpha(blinking && Math.floor(st.age / BLINK_PERIOD) % 2 === 0 ? 0.25 : 1)
      img.setPosition(st.baseX, st.baseY)
      return
    }

    // 回復・強化はふわふわ上下させて目立たせる（消えない）
    const bob = Math.sin(st.phase + (st.age / PICKUP.bobPeriod) * Math.PI * 2) * PICKUP.bobAmplitude
    img.setPosition(st.baseX, st.baseY + bob)
  }

  return {
    drop: (kind, x, y) => {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * PICKUP.popDistance
      spawn(kind, x, y, x + Math.cos(a) * d, y + Math.sin(a) * d)
    },
    scatterCoins: (x, y, count, value, radius) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.3
        const d = radius * (0.35 + Math.random() * 0.65)
        spawn({ type: 'coin', value }, x, y, x + Math.cos(a) * d, y + Math.sin(a) * d)
      }
    },
    update: (delta, player, magnetRadius) => {
      if (frozen) return
      // collect 中に states を変更するため、走査はコピーに対して行う
      Array.from(states.entries()).forEach(([img, st]) => updateOne(img, st, delta, player.x, player.y, magnetRadius))
    },
    vacuumAll: () => {
      states.forEach(st => {
        st.magnet = true
        st.speed = Math.max(st.speed, PICKUP.vacuumStartSpeed)
      })
    },
    settleCoins: () => {
      let total = 0
      Array.from(states.entries()).forEach(([img, st]) => {
        if (st.kind.type !== 'coin') return
        total += st.kind.value
        release(img)
      })
      return total
    },
    freeze: () => { frozen = true },
    clear: () => {
      Array.from(states.keys()).forEach(release)
      frozen = false
    },
    activeCount: () => states.size,
    destroy: () => {
      states.clear()
      pool.forEach(img => img.destroy())
      pool.length = 0
    },
  }
}
