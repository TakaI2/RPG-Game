/**
 * 2D エフェクトプリセットのデータ型と正規化。
 * JSON はエディタ・手書きのどちらでも壊れうるため、読み込み時に必ず normalize* を通して
 * 欠けた項目は既定値で補い、型の合わない値は捨てる。
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export const FX_PRESET_FORMAT = 'fx2d-preset'
export const FX_MANIFEST_FORMAT = 'fx2d-manifest'
export const FX_BINDINGS_FORMAT = 'fx2d-bindings'
export const FX_VERSION = 1

export type FxBlend = 'normal' | 'add' | 'screen'
export const FX_BLENDS: readonly FxBlend[] = ['normal', 'add', 'screen']

export type FxShape = 'ring' | 'ring_thin' | 'flash' | 'crescent' | 'dot'
export const FX_SHAPES: readonly FxShape[] = ['ring', 'ring_thin', 'flash', 'crescent', 'dot']

export const FX_EASES: readonly string[] = [
  'Linear', 'Quad.easeOut', 'Quad.easeIn', 'Cubic.easeOut', 'Cubic.easeIn',
  'Expo.easeOut', 'Back.easeOut', 'Sine.easeInOut',
]

export type FxLayerType = 'sprite' | 'shape' | 'particle'
export const FX_LAYER_TYPES: readonly FxLayerType[] = ['sprite', 'shape', 'particle']

/** 寿命に対する変化（開始→終了） */
export interface FxRange { start: number; end: number }
export interface FxColorRange { start: string; end: string }
/** ランダム範囲 */
export interface FxMinMax { min: number; max: number }

export interface FxLayerBase {
  name: string
  enabled: boolean
  delay: number       // ms
  duration: number    // ms（0 = 自動）
  offsetX: number
  offsetY: number
  blend: FxBlend
  depth: number       // 基準深度からの加算
}

export interface FxSpriteLayer extends FxLayerBase {
  type: 'sprite'
  sheet: string
  frameStart: number
  frameEnd: number    // -1 = 最終コマ
  fps: number
  loop: boolean
  size: FxRange       // 表示幅(px)
  alpha: FxRange
  color: FxColorRange
  angle: number       // deg
  angleRandom: boolean
  spin: number        // deg/s
  ease: string
}

export interface FxShapeLayer extends FxLayerBase {
  type: 'shape'
  shape: FxShape
  copies: number      // 等間隔に複製（斬撃の2枚刃など）
  size: FxRange       // 直径(px)
  alpha: FxRange
  color: FxColorRange
  angle: number
  angleRandom: boolean
  spin: number
  ease: string
}

export interface FxParticleLayer extends FxLayerBase {
  type: 'particle'
  sheet: string       // '' = 図形 dot
  frameStart: number
  frameEnd: number
  fps: number
  count: number       // 開始時の単発数
  rate: number        // 毎秒の持続発生数（0 = 単発のみ）
  speed: FxMinMax
  angleMin: number
  angleMax: number
  lifespan: FxMinMax
  gravityY: number
  spawnRadius: number
  size: FxRange
  alpha: FxRange
  color: FxColorRange
  rotate: boolean     // 進行方向に向ける
}

export type FxLayer = FxSpriteLayer | FxShapeLayer | FxParticleLayer

export interface FxPreset {
  format: typeof FX_PRESET_FORMAT
  version: number
  id: string
  name: string
  scale: number
  speed: number
  follow: boolean
  layers: FxLayer[]
}

export interface FxSheetDef {
  key: string
  file: string
  cols: number
  rows: number
}

export interface FxManifest {
  format: typeof FX_MANIFEST_FORMAT
  version: number
  sheets: FxSheetDef[]
  presets: string[]
}

export const FX_EVENTS = [
  'slash', 'enemyHit', 'enemyKill', 'bossHit', 'burstStart',
  'flameHit', 'bossEngage', 'bossDefeat', 'playerHit',
  'pickupUpgrade', 'pickupHeal',
] as const
export type FxEvent = typeof FX_EVENTS[number]

export const FX_EVENT_LABELS: Record<FxEvent, string> = {
  slash: '斬撃',
  enemyHit: '敵への命中',
  enemyKill: '敵の撃破',
  bossHit: 'ボスへの命中',
  burstStart: '火炎バースト発動',
  flameHit: '火炎弾の着弾',
  bossEngage: 'ボス起動',
  bossDefeat: 'ボス撃破',
  playerHit: 'プレイヤー被弾',
  pickupUpgrade: '強化アイテム取得',
  pickupHeal: '回復アイテム取得',
}

/**
 * 同時再生数が上限に達したとき、優先度の低いものから消す。
 * 命中・撃破のように大量に出る場面で、発動演出（バースト・ボス）が押し出されないようにする。
 */
export const FX_EVENT_PRIORITY: Record<FxEvent, number> = {
  slash: 1,
  enemyHit: 0,
  enemyKill: 0,
  bossHit: 0,
  burstStart: 2,
  flameHit: 0,
  bossEngage: 2,
  bossDefeat: 2,
  playerHit: 1,
  pickupUpgrade: 1,
  pickupHeal: 1,
}

export interface FxBindings {
  format: typeof FX_BINDINGS_FORMAT
  version: number
  bindings: Partial<Record<FxEvent, string>>
}

/** テクスチャキー */
export const fxSheetTextureKey = (sheet: string): string => `fxsheet_${sheet}`
export const fxPresetCacheKey = (id: string): string => `fxpreset_${id}`
export const FX_MANIFEST_CACHE_KEY = 'fx_manifest'
export const FX_BINDINGS_CACHE_KEY = 'fx_bindings'

// ─────────────────────────────────────────────────────────────
// 正規化ヘルパー
// ─────────────────────────────────────────────────────────────

const isObject = (v: JsonValue | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (o: JsonObject, key: string, def: number, min = -Infinity, max = Infinity): number => {
  const v = o[key]
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def
}
const str = (o: JsonObject, key: string, def: string): string => {
  const v = o[key]
  return typeof v === 'string' ? v : def
}
const bool = (o: JsonObject, key: string, def: boolean): boolean => {
  const v = o[key]
  return typeof v === 'boolean' ? v : def
}
const oneOf = <T extends string>(o: JsonObject, key: string, list: readonly T[], def: T): T => {
  const v = o[key]
  const hit = list.find(x => x === v)
  return hit ?? def
}
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const color = (o: JsonObject, key: string, def: string): string => {
  const v = o[key]
  return typeof v === 'string' && HEX_COLOR.test(v) ? v.toLowerCase() : def
}
const range = (o: JsonObject, key: string, def: FxRange, min = -Infinity, max = Infinity): FxRange => {
  const v = o[key]
  if (!isObject(v)) return { ...def }
  return { start: num(v, 'start', def.start, min, max), end: num(v, 'end', def.end, min, max) }
}
const colorRange = (o: JsonObject, key: string, def: FxColorRange): FxColorRange => {
  const v = o[key]
  if (!isObject(v)) return { ...def }
  return { start: color(v, 'start', def.start), end: color(v, 'end', def.end) }
}
const minMax = (o: JsonObject, key: string, def: FxMinMax, min = -Infinity, max = Infinity): FxMinMax => {
  const v = o[key]
  if (!isObject(v)) return { ...def }
  const a = num(v, 'min', def.min, min, max)
  const b = num(v, 'max', def.max, min, max)
  return { min: Math.min(a, b), max: Math.max(a, b) }
}

// ─────────────────────────────────────────────────────────────
// 既定値
// ─────────────────────────────────────────────────────────────

const baseDefaults = (name: string): FxLayerBase => ({
  // 加算合成は明るい床（草地）で色が飛ぶため、既定は通常合成
  name, enabled: true, delay: 0, duration: 0, offsetX: 0, offsetY: 0, blend: 'normal', depth: 0,
})

export function defaultSpriteLayer(sheet = ''): FxSpriteLayer {
  return {
    ...baseDefaults('sprite'), type: 'sprite',
    sheet, frameStart: 0, frameEnd: -1, fps: 24, loop: false,
    size: { start: 96, end: 96 }, alpha: { start: 1, end: 1 },
    color: { start: '#ffffff', end: '#ffffff' },
    angle: 0, angleRandom: false, spin: 0, ease: 'Linear',
  }
}

export function defaultShapeLayer(shape: FxShape = 'ring'): FxShapeLayer {
  return {
    ...baseDefaults(shape), type: 'shape',
    shape, copies: 1,
    size: { start: 40, end: 160 }, alpha: { start: 1, end: 0 },
    color: { start: '#ffffff', end: '#ffffff' },
    angle: 0, angleRandom: false, spin: 0, ease: 'Quad.easeOut',
  }
}

export function defaultParticleLayer(): FxParticleLayer {
  return {
    ...baseDefaults('particle'), type: 'particle',
    sheet: '', frameStart: 0, frameEnd: -1, fps: 16,
    count: 12, rate: 0,
    speed: { min: 80, max: 240 }, angleMin: 0, angleMax: 360,
    lifespan: { min: 250, max: 500 }, gravityY: 0, spawnRadius: 0,
    size: { start: 14, end: 0 }, alpha: { start: 1, end: 0 },
    color: { start: '#fff2a8', end: '#ff7a1a' }, rotate: false,
  }
}

export function defaultLayer(type: FxLayerType): FxLayer {
  if (type === 'sprite') return defaultSpriteLayer()
  if (type === 'shape') return defaultShapeLayer()
  return defaultParticleLayer()
}

export function defaultPreset(id: string): FxPreset {
  return {
    format: FX_PRESET_FORMAT, version: FX_VERSION, id, name: id,
    scale: 1, speed: 1, follow: false, layers: [defaultShapeLayer('ring')],
  }
}

// ─────────────────────────────────────────────────────────────
// 正規化
// ─────────────────────────────────────────────────────────────

function normalizeBase(o: JsonObject, def: FxLayerBase): FxLayerBase {
  return {
    name: str(o, 'name', def.name),
    enabled: bool(o, 'enabled', def.enabled),
    delay: num(o, 'delay', def.delay, 0, 60_000),
    duration: num(o, 'duration', def.duration, 0, 60_000),
    offsetX: num(o, 'offsetX', def.offsetX),
    offsetY: num(o, 'offsetY', def.offsetY),
    blend: oneOf(o, 'blend', FX_BLENDS, def.blend),
    depth: num(o, 'depth', def.depth, -50, 50),
  }
}

export function normalizeLayer(v: JsonValue): FxLayer | null {
  if (!isObject(v)) return null
  const type = oneOf<FxLayerType | ''>(v, 'type', FX_LAYER_TYPES, '')
  if (type === 'sprite') {
    const d = defaultSpriteLayer()
    return {
      ...normalizeBase(v, d), type,
      sheet: str(v, 'sheet', d.sheet),
      frameStart: Math.floor(num(v, 'frameStart', d.frameStart, 0)),
      frameEnd: Math.floor(num(v, 'frameEnd', d.frameEnd, -1)),
      fps: num(v, 'fps', d.fps, 1, 120),
      loop: bool(v, 'loop', d.loop),
      size: range(v, 'size', d.size, 0, 4000),
      alpha: range(v, 'alpha', d.alpha, 0, 1),
      color: colorRange(v, 'color', d.color),
      angle: num(v, 'angle', d.angle),
      angleRandom: bool(v, 'angleRandom', d.angleRandom),
      spin: num(v, 'spin', d.spin),
      ease: oneOf(v, 'ease', FX_EASES, d.ease),
    }
  }
  if (type === 'shape') {
    const d = defaultShapeLayer()
    return {
      ...normalizeBase(v, d), type,
      shape: oneOf(v, 'shape', FX_SHAPES, d.shape),
      copies: Math.floor(num(v, 'copies', d.copies, 1, 12)),
      size: range(v, 'size', d.size, 0, 4000),
      alpha: range(v, 'alpha', d.alpha, 0, 1),
      color: colorRange(v, 'color', d.color),
      angle: num(v, 'angle', d.angle),
      angleRandom: bool(v, 'angleRandom', d.angleRandom),
      spin: num(v, 'spin', d.spin),
      ease: oneOf(v, 'ease', FX_EASES, d.ease),
    }
  }
  if (type === 'particle') {
    const d = defaultParticleLayer()
    return {
      ...normalizeBase(v, d), type,
      sheet: str(v, 'sheet', d.sheet),
      frameStart: Math.floor(num(v, 'frameStart', d.frameStart, 0)),
      frameEnd: Math.floor(num(v, 'frameEnd', d.frameEnd, -1)),
      fps: num(v, 'fps', d.fps, 1, 120),
      count: Math.floor(num(v, 'count', d.count, 0, 300)),
      rate: num(v, 'rate', d.rate, 0, 500),
      speed: minMax(v, 'speed', d.speed, 0, 5000),
      angleMin: num(v, 'angleMin', d.angleMin),
      angleMax: num(v, 'angleMax', d.angleMax),
      lifespan: minMax(v, 'lifespan', d.lifespan, 16, 20_000),
      gravityY: num(v, 'gravityY', d.gravityY),
      spawnRadius: num(v, 'spawnRadius', d.spawnRadius, 0, 2000),
      size: range(v, 'size', d.size, 0, 2000),
      alpha: range(v, 'alpha', d.alpha, 0, 1),
      color: colorRange(v, 'color', d.color),
      rotate: bool(v, 'rotate', d.rotate),
    }
  }
  return null
}

export function normalizePreset(v: JsonValue, fallbackId: string): FxPreset {
  const d = defaultPreset(fallbackId)
  if (!isObject(v)) return { ...d, layers: [] }
  const rawLayers = v.layers
  const layers = Array.isArray(rawLayers)
    ? rawLayers.map(normalizeLayer).filter((l): l is FxLayer => l !== null)
    : []
  return {
    format: FX_PRESET_FORMAT,
    version: FX_VERSION,
    id: str(v, 'id', fallbackId) || fallbackId,
    name: str(v, 'name', d.name),
    scale: num(v, 'scale', d.scale, 0.01, 20),
    speed: num(v, 'speed', d.speed, 0.05, 10),
    follow: bool(v, 'follow', d.follow),
    layers,
  }
}

export function normalizeManifest(v: JsonValue): FxManifest {
  const empty: FxManifest = { format: FX_MANIFEST_FORMAT, version: FX_VERSION, sheets: [], presets: [] }
  if (!isObject(v)) return empty
  const sheets = Array.isArray(v.sheets)
    ? v.sheets.filter(isObject).map(s => ({
        key: str(s, 'key', ''),
        file: str(s, 'file', ''),
        cols: Math.floor(num(s, 'cols', 1, 1, 64)),
        rows: Math.floor(num(s, 'rows', 1, 1, 64)),
      })).filter(s => s.key !== '' && s.file !== '')
    : []
  const presets = Array.isArray(v.presets)
    ? v.presets.filter((p): p is string => typeof p === 'string' && p !== '')
    : []
  return { ...empty, sheets, presets: [...new Set(presets)] }
}

export function normalizeBindings(v: JsonValue): FxBindings {
  const result: FxBindings = { format: FX_BINDINGS_FORMAT, version: FX_VERSION, bindings: {} }
  if (!isObject(v) || !isObject(v.bindings)) return result
  const raw = v.bindings
  FX_EVENTS.forEach(ev => {
    const id = raw[ev]
    if (typeof id === 'string' && id !== '') result.bindings[ev] = id
  })
  return result
}

/** 色文字列 '#rrggbb' → 0xrrggbb */
export const hexToInt = (hex: string): number => parseInt(hex.slice(1), 16)
