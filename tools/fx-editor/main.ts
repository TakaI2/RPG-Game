/**
 * エフェクトエディタ（開発サーバー専用）
 * ゲーム本体の FxManager / FxLoader / FxTypes をそのまま使うため、プレビューはゲームと同じ見た目になる。
 *
 * 編集中のプリセットは「生の JSON」(JsonObject) として持ち、変更のたびに normalizePreset を通して
 * プレビューへ渡す。保存時も正規化した結果を書き出すので、不正な値はファイルに残らない。
 */
import Phaser from 'phaser'
import { createFxManager, type FxFollowTarget, type FxHandle, type FxManager } from '../../src/systems/fx/FxManager'
import {
  applyFxSheetGrid, FX_BINDINGS_PATH, FX_MANIFEST_PATH, FX_PRESETS_DIR, FX_SHEETS_DIR, fxPresetPath, fxSheetPath,
} from '../../src/systems/fx/FxLoader'
import {
  FX_BLENDS, FX_EASES, FX_EVENTS, FX_EVENT_LABELS, FX_SHAPES, defaultLayer, defaultPreset, fxSheetTextureKey,
  normalizeBindings, normalizeManifest, normalizePreset,
  type FxBindings, type FxLayer, type FxLayerType, type FxManifest, type FxPreset, type FxSheetDef,
  type JsonObject, type JsonValue,
} from '../../src/systems/fx/FxTypes'

// ─────────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.BASE_URL
const assetUrl = (path: string): string => `${BASE_URL}${path}`
const EDIT_KEY = '__editing__'
const PREVIEW_W = 960
const PREVIEW_H = 600
const DEFAULT_SHEET_GRID = 4
const SHAPE_AUTO_DURATION = 400
const TIMELINE_MIN_MS = 1000
const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const REPLAY_DEBOUNCE_MS = 150
const HERO_FRAME = 64
const HERO_IDLE_DOWN = { col: 0, row: 2 }
const HERO_CHROMA = [0, 254, 0] as const
const BACKGROUNDS: Record<string, { texture: string; file: string } | null> = {
  grass: { texture: 'fxed_bg_grass', file: 'assets/images/maptip/grass2.png' },
  stone: { texture: 'fxed_bg_stone', file: 'assets/images/maptip/stone.png' },
  dark: null,
}
const TILE = 32

// ─────────────────────────────────────────────────────────────
// 小物
// ─────────────────────────────────────────────────────────────
const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

function byId<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const el = document.getElementById(id)
  if (!(el instanceof ctor)) throw new Error(`element #${id} not found`)
  return el
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<Record<'className' | 'textContent' | 'title', string>> = {}, children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.className) el.className = props.className
  if (props.textContent !== undefined) el.textContent = props.textContent
  if (props.title) el.title = props.title
  children.forEach(c => el.appendChild(c))
  return el
}

const toJson = (value: FxPreset | FxManifest | FxBindings): JsonObject => {
  const parsed: JsonValue = JSON.parse(JSON.stringify(value))
  return isObj(parsed) ? parsed : {}
}

function getPath(o: JsonObject, path: string): JsonValue | undefined {
  let cur: JsonValue | undefined = o
  for (const key of path.split('.')) {
    if (!isObj(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

function setPath(o: JsonObject, path: string, value: JsonValue): void {
  const keys = path.split('.')
  let cur = o
  keys.slice(0, -1).forEach(key => {
    const next = cur[key]
    if (isObj(next)) {
      cur = next
    } else {
      const created: JsonObject = {}
      cur[key] = created
      cur = created
    }
  })
  cur[keys[keys.length - 1]] = value
}

let toastTimer = 0
function toast(message: string, isError = false): void {
  const el = byId('toast', HTMLDivElement)
  el.textContent = message
  el.className = `show${isError ? ' error' : ''}`
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { el.className = '' }, 2600)
}

// ─────────────────────────────────────────────────────────────
// 開発サーバー API（vite.config.ts の saveAssetPlugin）
// ─────────────────────────────────────────────────────────────
async function apiJson(url: string, init?: RequestInit): Promise<JsonObject> {
  const res = await fetch(url, init)
  const body: JsonValue = await res.json()
  if (!isObj(body)) throw new Error(`invalid response from ${url}`)
  if (body.ok !== true) throw new Error(typeof body.error === 'string' ? body.error : `request failed: ${url}`)
  return body
}

async function listAssets(folder: string): Promise<string[]> {
  const body = await apiJson(`/api/list-assets?folder=${encodeURIComponent(folder)}`)
  const files = body.files
  return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : []
}

async function saveAsset(path: string, data: JsonObject): Promise<void> {
  await apiJson('/api/save-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content: `${JSON.stringify(data, null, 2)}\n` }),
  })
}

async function fetchJson(path: string): Promise<JsonValue | null> {
  try {
    const res = await fetch(`${assetUrl(path)}?t=${Date.now()}`)
    if (!res.ok) return null
    const body: JsonValue = await res.json()
    return body
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 状態
// ─────────────────────────────────────────────────────────────
let manifest: FxManifest = normalizeManifest(null)
let bindings: FxBindings = normalizeBindings(null)
let raw: JsonObject = toJson(defaultPreset('new_effect'))
let savedId: string | null = null
let selected = 0
let dirty = false
let selectedSheet: string | null = null
let unregisteredSheets: string[] = []

let scene: Phaser.Scene | null = null
let fx: FxManager | null = null
let dummy: Phaser.GameObjects.Image | null = null
let background: Phaser.GameObjects.TileSprite | null = null
const mouseTarget: FxFollowTarget = { x: 0, y: 0, active: true }
let previewHandle: FxHandle | null = null
let playStartedAt = 0
let nextRepeatAt = 0
let replayTimer = 0

const currentPreset = (): FxPreset => {
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : 'new_effect'
  return normalizePreset(raw, id)
}

const rawLayers = (): JsonValue[] => {
  if (!Array.isArray(raw.layers)) raw.layers = []
  const layers = raw.layers
  return Array.isArray(layers) ? layers : []
}

const selectedLayer = (): JsonObject | null => {
  const l = rawLayers()[selected]
  return isObj(l) ? l : null
}

const layerTypeOf = (l: JsonObject): FxLayerType => (l.type === 'sprite' || l.type === 'shape' ? l.type : 'particle')

// ─────────────────────────────────────────────────────────────
// プレビュー（Phaser）
// ─────────────────────────────────────────────────────────────
function pushPreset(): void {
  if (!fx) return
  fx.setPreset({ ...currentPreset(), id: EDIT_KEY })
}

function playPreview(x?: number, y?: number, keepPrevious = false): void {
  if (!fx) return
  if (!keepPrevious) previewHandle?.stop()
  const followMouse = byId('opt-follow-mouse', HTMLInputElement).checked
  const px = x ?? (followMouse ? mouseTarget.x : 0)
  const py = y ?? (followMouse ? mouseTarget.y : 0)
  const follow: FxFollowTarget = followMouse ? mouseTarget : { x: px, y: py, active: true }
  previewHandle = fx.play(EDIT_KEY, px, py, { follow })
  playStartedAt = performance.now()
  nextRepeatAt = playStartedAt + Number(byId('opt-interval', HTMLInputElement).value)
}

function scheduleReplay(): void {
  if (!byId('opt-replay', HTMLInputElement).checked) return
  window.clearTimeout(replayTimer)
  replayTimer = window.setTimeout(() => playPreview(), REPLAY_DEBOUNCE_MS)
}

function chromaHero(s: Phaser.Scene): void {
  if (!s.textures.exists('fxed_hero_raw')) return
  const src = s.textures.get('fxed_hero_raw').getSourceImage()
  if (!(src instanceof HTMLImageElement)) return
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === HERO_CHROMA[0] && img.data[i + 1] === HERO_CHROMA[1] && img.data[i + 2] === HERO_CHROMA[2]) {
      img.data[i + 3] = 0
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = s.textures.addCanvas('fxed_hero', canvas)
  tex?.add('idle', 0, HERO_IDLE_DOWN.col * HERO_FRAME, HERO_IDLE_DOWN.row * HERO_FRAME, HERO_FRAME, HERO_FRAME)
}

function applyBackground(): void {
  if (!scene) return
  background?.destroy()
  background = null
  const def = BACKGROUNDS[byId('opt-bg', HTMLSelectElement).value]
  if (def && scene.textures.exists(def.texture)) {
    const size = 4000
    background = scene.add.tileSprite(0, 0, size, size, def.texture).setDepth(-100)
    const frameW = scene.textures.get(def.texture).getSourceImage().width
    background.setTileScale(TILE / Math.max(1, frameW))
  }
}

function applyZoom(): void {
  if (!scene) return
  scene.cameras.main.setZoom(Number(byId('opt-zoom', HTMLSelectElement).value))
  scene.cameras.main.centerOn(0, 0)
}

function startPreview(presets: FxPreset[]): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'preview',
    width: PREVIEW_W,
    height: PREVIEW_H,
    backgroundColor: '#0b0b12',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    loader: { imageLoadType: 'HTMLImageElement', baseURL: BASE_URL },
    scene: {
      key: 'preview',
      preload(this: Phaser.Scene) {
        manifest.sheets.forEach(s => this.load.image(fxSheetTextureKey(s.key), fxSheetPath(s.file)))
        this.load.image('fxed_hero_raw', 'assets/images/hero.png')
        Object.values(BACKGROUNDS).forEach(bg => { if (bg) this.load.image(bg.texture, bg.file) })
      },
      create(this: Phaser.Scene) {
        scene = this
        manifest.sheets.forEach(s => applyFxSheetGrid(this, s))
        chromaHero(this)
        fx = createFxManager(this, {})
        presets.forEach(p => fx?.setPreset(p))
        fx.setBindings(bindings)
        pushPreset()
        if (this.textures.exists('fxed_hero')) {
          dummy = this.add.image(0, 0, 'fxed_hero', 'idle').setDepth(10)
          dummy.setVisible(byId('opt-dummy', HTMLInputElement).checked)
        }
        applyBackground()
        applyZoom()
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          const w = this.cameras.main.getWorldPoint(p.x, p.y)
          playPreview(w.x, w.y, true)
        })
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
          const w = this.cameras.main.getWorldPoint(p.x, p.y)
          mouseTarget.x = w.x
          mouseTarget.y = w.y
        })
        playPreview()
      },
      update(this: Phaser.Scene) {
        const now = performance.now()
        if (byId('opt-repeat', HTMLInputElement).checked && now >= nextRepeatAt) playPreview()
        byId('active-count', HTMLSpanElement).textContent = String(fx?.activeCount() ?? 0)
        updatePlayhead(now)
      },
    },
  })
}

// ─────────────────────────────────────────────────────────────
// 変更通知
// ─────────────────────────────────────────────────────────────
function markDirty(): void {
  dirty = true
  byId('dirty', HTMLSpanElement).textContent = '● 未保存'
}

function onChanged(opts: { list?: boolean; form?: boolean } = {}): void {
  markDirty()
  pushPreset()
  renderTimeline()
  if (opts.list) renderLayerList()
  if (opts.form) renderForm()
  scheduleReplay()
}

// ─────────────────────────────────────────────────────────────
// ツールバー
// ─────────────────────────────────────────────────────────────
function renderToolbar(): void {
  const p = currentPreset()
  byId('preset-id', HTMLInputElement).value = typeof raw.id === 'string' ? raw.id : ''
  byId('preset-name', HTMLInputElement).value = p.name
  byId('preset-scale', HTMLInputElement).value = String(p.scale)
  byId('preset-speed', HTMLInputElement).value = String(p.speed)
  byId('preset-follow', HTMLInputElement).checked = p.follow
  byId('dirty', HTMLSpanElement).textContent = dirty ? '● 未保存' : ''
  document.title = `エフェクトエディタ - ${savedId ?? '新規'}`
}

function bindToolbar(): void {
  byId('preset-id', HTMLInputElement).addEventListener('input', e => {
    if (e.target instanceof HTMLInputElement) { raw.id = e.target.value.trim(); markDirty() }
  })
  byId('preset-name', HTMLInputElement).addEventListener('input', e => {
    if (e.target instanceof HTMLInputElement) { raw.name = e.target.value; markDirty() }
  })
  const numInput = (id: string, key: string): void => {
    byId(id, HTMLInputElement).addEventListener('change', e => {
      if (!(e.target instanceof HTMLInputElement)) return
      const v = Number(e.target.value)
      if (Number.isFinite(v)) { raw[key] = v; onChanged() }
    })
  }
  numInput('preset-scale', 'scale')
  numInput('preset-speed', 'speed')
  byId('preset-follow', HTMLInputElement).addEventListener('change', e => {
    if (e.target instanceof HTMLInputElement) { raw.follow = e.target.checked; onChanged() }
  })

  byId('btn-new', HTMLButtonElement).onclick = () => {
    if (dirty && !confirm('未保存の変更を破棄して新規作成しますか？')) return
    loadIntoEditor(defaultPreset('new_effect'), null)
  }
  byId('btn-open', HTMLButtonElement).onclick = () => { void openPresetDialog() }
  byId('btn-save', HTMLButtonElement).onclick = () => { void savePreset(false) }
  byId('btn-save-as', HTMLButtonElement).onclick = () => { void savePreset(true) }
}

function loadIntoEditor(preset: FxPreset, id: string | null): void {
  raw = toJson(preset)
  savedId = id
  selected = 0
  dirty = false
  renderAll()
  pushPreset()
  playPreview()
}

async function openPresetDialog(): Promise<void> {
  if (dirty && !confirm('未保存の変更を破棄して開きますか？')) return
  let ids = [...manifest.presets]
  try {
    const files = await listAssets(FX_PRESETS_DIR)
    files.filter(f => f.endsWith('.fx.json')).forEach(f => ids.push(f.replace(/\.fx\.json$/, '')))
  } catch (e) {
    toast(`一覧を取得できません（開発サーバー起動中か確認）: ${String(e)}`, true)
  }
  ids = [...new Set(ids)].sort()
  showModal('プリセットを開く', ids, async id => {
    const data = await fetchJson(fxPresetPath(id))
    if (data === null) {
      toast(`${id} を読み込めませんでした`, true)
      return
    }
    loadIntoEditor(normalizePreset(data, id), id)
    toast(`${id} を開きました`)
  })
}

async function savePreset(asNew: boolean): Promise<void> {
  let id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (asNew || id === '') {
    const input = prompt('保存するID（英数字・_・- のみ）', id || 'new_effect')
    if (input === null) return
    id = input.trim()
  }
  if (!ID_PATTERN.test(id)) {
    toast('ID は英数字・_・- のみ使えます', true)
    return
  }
  if (id !== savedId && manifest.presets.includes(id) && !confirm(`${id} は既にあります。上書きしますか？`)) return
  raw.id = id
  const preset = normalizePreset(raw, id)
  try {
    await saveAsset(fxPresetPath(id), toJson(preset))
    if (!manifest.presets.includes(id)) {
      manifest.presets = [...manifest.presets, id].sort()
      await saveAsset(FX_MANIFEST_PATH, toJson(manifest))
    }
  } catch (e) {
    toast(`保存に失敗しました: ${String(e)}`, true)
    return
  }
  fx?.setPreset(preset)
  raw = toJson(preset)
  savedId = id
  dirty = false
  renderAll()
  toast(`保存しました: ${fxPresetPath(id)}`)
}

// ─────────────────────────────────────────────────────────────
// モーダル
// ─────────────────────────────────────────────────────────────
function showModal(title: string, items: string[], onPick: (item: string) => void): void {
  const modal = byId('modal', HTMLDivElement)
  byId('modal-title', HTMLElement).textContent = title
  const list = byId('modal-list', HTMLUListElement)
  list.replaceChildren(...(items.length > 0
    ? items.map(item => {
        const li = h('li', { textContent: item })
        li.onclick = () => { modal.classList.remove('show'); onPick(item) }
        return li
      })
    : [h('li', { textContent: '（なし）' })]))
  modal.classList.add('show')
  byId('modal-close', HTMLButtonElement).onclick = () => modal.classList.remove('show')
}

// ─────────────────────────────────────────────────────────────
// レイヤー一覧
// ─────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<FxLayerType, string> = { sprite: 'シート', shape: '図形', particle: '粒子' }

function renderLayerList(): void {
  const list = byId('layer-list', HTMLUListElement)
  const layers = rawLayers()
  if (selected >= layers.length) selected = Math.max(0, layers.length - 1)
  list.replaceChildren(...layers.map((l, i) => {
    const obj = isObj(l) ? l : {}
    const type = layerTypeOf(obj)
    const enabled = obj.enabled !== false
    const check = h('input')
    check.type = 'checkbox'
    check.checked = enabled
    check.title = '表示'
    check.onclick = e => e.stopPropagation()
    check.onchange = () => { obj.enabled = check.checked; onChanged({ list: true }) }
    const li = h('li', { className: `${i === selected ? 'selected' : ''}${enabled ? '' : ' disabled'}` }, [
      check,
      h('span', { className: `ltype t-${type}`, textContent: TYPE_LABEL[type] }),
      h('span', { className: 'lname', textContent: typeof obj.name === 'string' ? obj.name : '' }),
    ])
    li.onclick = () => { selected = i; renderLayerList(); renderForm(); renderTimeline() }
    return li
  }))
}

function bindLayerButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('#layer-buttons button').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.add
      if (type !== 'sprite' && type !== 'shape' && type !== 'particle') return
      const layer = defaultLayer(type)
      if (layer.type === 'sprite') layer.sheet = manifest.sheets[0]?.key ?? ''
      const json: JsonValue = JSON.parse(JSON.stringify(layer))
      rawLayers().push(json)
      selected = rawLayers().length - 1
      onChanged({ list: true, form: true })
    }
  })
  const move = (dir: -1 | 1): void => {
    const layers = rawLayers()
    const to = selected + dir
    if (to < 0 || to >= layers.length) return
    const [item] = layers.splice(selected, 1)
    layers.splice(to, 0, item)
    selected = to
    onChanged({ list: true })
  }
  byId('btn-up', HTMLButtonElement).onclick = () => move(-1)
  byId('btn-down', HTMLButtonElement).onclick = () => move(1)
  byId('btn-dup', HTMLButtonElement).onclick = () => {
    const l = selectedLayer()
    if (!l) return
    const copy: JsonValue = JSON.parse(JSON.stringify(l))
    if (isObj(copy)) copy.name = `${typeof copy.name === 'string' ? copy.name : ''} (複製)`
    rawLayers().splice(selected + 1, 0, copy)
    selected++
    onChanged({ list: true, form: true })
  }
  byId('btn-del', HTMLButtonElement).onclick = () => {
    if (!selectedLayer()) return
    rawLayers().splice(selected, 1)
    selected = Math.max(0, selected - 1)
    onChanged({ list: true, form: true })
  }
}

// ─────────────────────────────────────────────────────────────
// パラメータフォーム（項目定義から自動生成）
// ─────────────────────────────────────────────────────────────
type Option = { value: string; label: string }
interface FieldDef {
  path: string
  label: string
  kind: 'text' | 'number' | 'slider' | 'color' | 'check' | 'select'
  min?: number
  max?: number
  step?: number
  options?: () => Option[]
  /** 変更でレイヤー一覧の表示も変わる項目 */
  affectsList?: boolean
}
type FormItem = FieldDef | { header: string }

const opts = (list: readonly string[]): (() => Option[]) => () => list.map(v => ({ value: v, label: v }))
const sheetOptions = (allowNone: boolean) => (): Option[] => [
  ...(allowNone ? [{ value: '', label: '（図形の点）' }] : []),
  ...manifest.sheets.map(s => ({ value: s.key, label: `${s.key}（${s.cols}×${s.rows}）` })),
]

const COMMON_TOP: FormItem[] = [
  { path: 'name', label: '名前', kind: 'text', affectsList: true },
]
const TIMING: FormItem[] = [
  { header: 'タイミング（ms）' },
  { path: 'delay', label: '開始の遅れ', kind: 'slider', min: 0, max: 3000, step: 10 },
  { path: 'duration', label: '長さ（0=自動）', kind: 'slider', min: 0, max: 5000, step: 10 },
]
const PLACEMENT: FormItem[] = [
  { header: '配置・合成' },
  { path: 'offsetX', label: 'ずらし X', kind: 'slider', min: -400, max: 400, step: 1 },
  { path: 'offsetY', label: 'ずらし Y', kind: 'slider', min: -400, max: 400, step: 1 },
  { path: 'depth', label: '重なり順', kind: 'number', min: -10, max: 10, step: 1 },
  { path: 'blend', label: '合成', kind: 'select', options: () => FX_BLENDS.map(b => ({ value: b, label: { normal: '通常', add: '加算', screen: 'スクリーン' }[b] })) },
]
const CHANGE = (sizeMax: number): FormItem[] => [
  { header: '変化（開始 → 終了）' },
  { path: 'size.start', label: 'サイズ 開始', kind: 'slider', min: 0, max: sizeMax, step: 1 },
  { path: 'size.end', label: 'サイズ 終了', kind: 'slider', min: 0, max: sizeMax, step: 1 },
  { path: 'alpha.start', label: '不透明度 開始', kind: 'slider', min: 0, max: 1, step: 0.01 },
  { path: 'alpha.end', label: '不透明度 終了', kind: 'slider', min: 0, max: 1, step: 0.01 },
  { path: 'color.start', label: '色 開始', kind: 'color' },
  { path: 'color.end', label: '色 終了', kind: 'color' },
]
const ROTATION: FormItem[] = [
  { path: 'ease', label: '変化の緩急', kind: 'select', options: opts(FX_EASES) },
  { header: '回転' },
  { path: 'angle', label: '角度', kind: 'slider', min: -180, max: 180, step: 1 },
  { path: 'angleRandom', label: 'ランダムな向き', kind: 'check' },
  { path: 'spin', label: '回転速度（度/秒）', kind: 'slider', min: -2000, max: 2000, step: 10 },
]
const FRAMES: FormItem[] = [
  { path: 'frameStart', label: '開始コマ', kind: 'number', min: 0, max: 255, step: 1 },
  { path: 'frameEnd', label: '終了コマ（-1=最後）', kind: 'number', min: -1, max: 255, step: 1 },
  { path: 'fps', label: 'fps', kind: 'slider', min: 1, max: 60, step: 1 },
]

const FORMS: Record<FxLayerType, FormItem[]> = {
  sprite: [
    ...COMMON_TOP,
    { header: 'シート' },
    { path: 'sheet', label: 'シート', kind: 'select', options: sheetOptions(false) },
    ...FRAMES,
    { path: 'loop', label: 'ループ', kind: 'check' },
    ...TIMING, ...CHANGE(800), ...ROTATION, ...PLACEMENT,
  ],
  shape: [
    ...COMMON_TOP,
    { header: '図形' },
    { path: 'shape', label: '図形', kind: 'select', options: () => FX_SHAPES.map(s => ({ value: s, label: { ring: 'リング', ring_thin: '細いリング', flash: '閃光', crescent: '三日月（斬撃）', dot: '点' }[s] })) },
    { path: 'copies', label: '複製数（等間隔）', kind: 'slider', min: 1, max: 12, step: 1 },
    ...TIMING, ...CHANGE(1200), ...ROTATION, ...PLACEMENT,
  ],
  particle: [
    ...COMMON_TOP,
    { header: '粒の画像' },
    { path: 'sheet', label: 'シート', kind: 'select', options: sheetOptions(true) },
    ...FRAMES,
    { header: '発生' },
    { path: 'count', label: '単発の数', kind: 'slider', min: 0, max: 200, step: 1 },
    { path: 'rate', label: '持続（毎秒）', kind: 'slider', min: 0, max: 200, step: 1 },
    { path: 'spawnRadius', label: '発生範囲の半径', kind: 'slider', min: 0, max: 300, step: 1 },
    { header: '動き' },
    { path: 'speed.min', label: '速さ 最小', kind: 'slider', min: 0, max: 1500, step: 5 },
    { path: 'speed.max', label: '速さ 最大', kind: 'slider', min: 0, max: 1500, step: 5 },
    { path: 'angleMin', label: '方向 最小（度）', kind: 'slider', min: -360, max: 360, step: 1 },
    { path: 'angleMax', label: '方向 最大（度）', kind: 'slider', min: -360, max: 360, step: 1 },
    { path: 'lifespan.min', label: '寿命 最小（ms）', kind: 'slider', min: 16, max: 4000, step: 10 },
    { path: 'lifespan.max', label: '寿命 最大（ms）', kind: 'slider', min: 16, max: 4000, step: 10 },
    { path: 'gravityY', label: '重力', kind: 'slider', min: -1500, max: 1500, step: 10 },
    { path: 'rotate', label: 'ランダム回転', kind: 'check' },
    ...TIMING, ...CHANGE(300), ...PLACEMENT,
  ],
}

function fieldRow(layer: JsonObject, def: FieldDef): HTMLElement {
  const value = getPath(layer, def.path)
  const label = h('label', { textContent: def.label })
  const commit = (v: JsonValue): void => {
    setPath(layer, def.path, v)
    onChanged({ list: def.affectsList === true })
  }

  if (def.kind === 'check') {
    const input = h('input')
    input.type = 'checkbox'
    input.checked = value === true
    input.onchange = () => commit(input.checked)
    return h('div', { className: 'field wide' }, [label, input])
  }
  if (def.kind === 'select') {
    const select = h('select')
    const options = def.options?.() ?? []
    const current = typeof value === 'string' ? value : ''
    if (!options.some(o => o.value === current)) options.unshift({ value: current, label: `${current}（不明）` })
    options.forEach(o => {
      const op = h('option', { textContent: o.label })
      op.value = o.value
      op.selected = o.value === current
      select.appendChild(op)
    })
    select.onchange = () => commit(select.value)
    return h('div', { className: 'field wide' }, [label, select])
  }
  if (def.kind === 'color') {
    const input = h('input')
    input.type = 'color'
    input.value = typeof value === 'string' ? value : '#ffffff'
    input.oninput = () => commit(input.value)
    return h('div', { className: 'field wide' }, [label, input])
  }
  if (def.kind === 'text') {
    const input = h('input')
    input.type = 'text'
    input.value = typeof value === 'string' ? value : ''
    input.oninput = () => commit(input.value)
    return h('div', { className: 'field wide' }, [label, input])
  }

  // number / slider
  const n = typeof value === 'number' ? value : 0
  const num = h('input')
  num.type = 'number'
  if (def.min !== undefined) num.min = String(def.min)
  if (def.max !== undefined) num.max = String(def.max)
  num.step = String(def.step ?? 1)
  num.value = String(n)
  if (def.kind === 'number') {
    num.onchange = () => { const v = Number(num.value); if (Number.isFinite(v)) commit(v) }
    return h('div', { className: 'field wide' }, [label, num])
  }
  const slider = h('input')
  slider.type = 'range'
  slider.min = String(def.min ?? 0)
  slider.max = String(def.max ?? 100)
  slider.step = String(def.step ?? 1)
  slider.value = String(n)
  slider.oninput = () => { num.value = slider.value; commit(Number(slider.value)) }
  num.onchange = () => {
    const v = Number(num.value)
    if (!Number.isFinite(v)) return
    slider.value = String(v)
    commit(v)
  }
  return h('div', { className: 'field' }, [label, slider, num])
}

function renderForm(): void {
  const container = byId('tab-layer', HTMLDivElement)
  const layer = selectedLayer()
  if (!layer) {
    container.replaceChildren(h('p', { className: 'muted', textContent: 'レイヤーがありません。左の「＋」から追加してください。' }))
    return
  }
  const items = FORMS[layerTypeOf(layer)]
  container.replaceChildren(...items.map(item =>
    'header' in item ? h('div', { className: 'section', textContent: item.header }) : fieldRow(layer, item)))
}

// ─────────────────────────────────────────────────────────────
// タイムライン
// ─────────────────────────────────────────────────────────────
function sheetFrameCount(sheetKey: string, from: number, to: number): number {
  const sheet = manifest.sheets.find(s => s.key === sheetKey)
  if (!sheet) return 0
  const total = sheet.cols * sheet.rows
  const last = to < 0 ? total - 1 : Math.min(to, total - 1)
  return Math.max(0, last - Math.max(0, from) + 1)
}

function layerSpan(l: FxLayer): { start: number; length: number; infinite: boolean } {
  let length = l.duration
  let infinite = false
  if (length <= 0) {
    if (l.type === 'sprite') {
      if (l.loop) infinite = true
      else length = (sheetFrameCount(l.sheet, l.frameStart, l.frameEnd) / l.fps) * 1000
    } else if (l.type === 'shape') {
      length = SHAPE_AUTO_DURATION
    } else if (l.rate > 0) {
      infinite = true
    }
  }
  if (l.type === 'particle') length += l.lifespan.max
  return { start: l.delay, length, infinite }
}

let timelineMs = TIMELINE_MIN_MS

function renderTimeline(): void {
  const body = byId('timeline-body', HTMLDivElement)
  const playhead = byId('playhead', HTMLDivElement)
  const preset = currentPreset()
  // 無効レイヤーも表示するため、正規化後のレイヤーを生レイヤーと同じ順で使う
  const spans = preset.layers.map(layerSpan)
  const finiteEnd = spans.reduce((m, s) => Math.max(m, s.start + (s.infinite ? 0 : s.length)), 0)
  timelineMs = Math.max(TIMELINE_MIN_MS, finiteEnd * 1.15)
  byId('timeline-scale', HTMLSpanElement).textContent = `全体 ${Math.round(timelineMs)} ms（速度 ×${preset.speed}）`

  const rows = preset.layers.map((layer, i) => {
    const span = spans[i]
    const row = h('div', { className: 'tl-row' })
    const bar = h('div', {
      className: `tl-bar ${layer.type}${span.infinite ? ' infinite' : ''}${i === selected ? ' selected' : ''}${layer.enabled ? '' : ' off'}`,
      textContent: layer.name,
      title: `${layer.name}: ${Math.round(span.start)}ms〜${span.infinite ? '∞' : `${Math.round(span.start + span.length)}ms`}`,
    })
    const pct = (ms: number): string => `${(ms / timelineMs) * 100}%`
    bar.style.left = pct(span.start)
    bar.style.width = span.infinite ? `calc(100% - ${pct(span.start)})` : pct(Math.max(span.length, timelineMs * 0.01))
    bar.onpointerdown = e => startBarDrag(e, bar, row, i)
    row.appendChild(bar)
    return row
  })
  body.replaceChildren(...rows, playhead)
}

function startBarDrag(e: PointerEvent, bar: HTMLElement, row: HTMLElement, index: number): void {
  const layer = rawLayers()[index]
  if (!isObj(layer)) return
  selected = index
  renderLayerList()
  renderForm()
  const startX = e.clientX
  const startDelay = typeof layer.delay === 'number' ? layer.delay : 0
  const msPerPx = timelineMs / Math.max(1, row.clientWidth)
  bar.setPointerCapture(e.pointerId)
  bar.style.cursor = 'grabbing'
  const onMove = (ev: PointerEvent): void => {
    const delay = Math.max(0, Math.round((startDelay + (ev.clientX - startX) * msPerPx) / 10) * 10)
    layer.delay = delay
    bar.style.left = `${(delay / timelineMs) * 100}%`
  }
  const onUp = (): void => {
    bar.removeEventListener('pointermove', onMove)
    bar.removeEventListener('pointerup', onUp)
    if (layer.delay !== startDelay) onChanged({ form: true })
    else renderTimeline()
  }
  bar.addEventListener('pointermove', onMove)
  bar.addEventListener('pointerup', onUp)
}

function updatePlayhead(now: number): void {
  const elapsed = (now - playStartedAt) * currentPreset().speed
  const playhead = document.getElementById('playhead')
  const body = document.getElementById('timeline-body')
  if (!playhead || !body) return
  const ratio = Math.min(1, elapsed / timelineMs)
  playhead.style.left = `calc(10px + (100% - 20px) * ${ratio})`
  playhead.style.display = previewHandle && !previewHandle.isDone() ? 'block' : 'none'
}

// ─────────────────────────────────────────────────────────────
// シート
// ─────────────────────────────────────────────────────────────
async function refreshSheetFiles(): Promise<void> {
  try {
    const files = await listAssets(FX_SHEETS_DIR)
    const known = new Set(manifest.sheets.map(s => s.file))
    unregisteredSheets = files.filter(f => f.toLowerCase().endsWith('.png') && !known.has(f))
  } catch {
    unregisteredSheets = []
  }
  renderSheets()
}

function renderSheets(): void {
  const list = byId('sheet-list', HTMLUListElement)
  const items: HTMLElement[] = manifest.sheets.map(s => {
    const li = h('li', { className: s.key === selectedSheet ? 'selected' : '' }, [
      h('span', { textContent: s.key }),
      h('span', { className: 'muted', textContent: `${s.cols}×${s.rows}` }),
    ])
    li.onclick = () => { selectedSheet = s.key; renderSheets() }
    return li
  })
  unregisteredSheets.forEach(file => {
    const btn = h('button', { textContent: '登録' })
    btn.onclick = () => registerSheet(file)
    items.push(h('li', {}, [h('span', { textContent: `${file}（未登録）` }), btn]))
  })
  list.replaceChildren(...items)
  renderSheetDetail()
}

function sheetKeyFromFile(file: string): string {
  return file.replace(/\.png$/i, '').replace(/[^A-Za-z0-9_-]/g, '_')
}

function registerSheet(file: string): void {
  const def: FxSheetDef = { key: sheetKeyFromFile(file), file, cols: DEFAULT_SHEET_GRID, rows: DEFAULT_SHEET_GRID }
  if (manifest.sheets.some(s => s.key === def.key)) {
    toast(`キー ${def.key} は既に使われています`, true)
    return
  }
  manifest.sheets = [...manifest.sheets, def]
  unregisteredSheets = unregisteredSheets.filter(f => f !== file)
  selectedSheet = def.key
  if (scene) {
    const s = scene
    s.load.image(fxSheetTextureKey(def.key), fxSheetPath(def.file))
    s.load.once(Phaser.Loader.Events.COMPLETE, () => {
      applyFxSheetGrid(s, def)
      renderForm()
    })
    s.load.start()
  }
  renderSheets()
  toast(`${file} を登録しました（「シート設定を保存」で確定）`)
}

function renderSheetDetail(): void {
  const form = byId('sheet-form', HTMLDivElement)
  const canvas = byId('sheet-canvas', HTMLCanvasElement)
  const ctx = canvas.getContext('2d')
  const sheet = manifest.sheets.find(s => s.key === selectedSheet)
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!sheet) {
    form.replaceChildren(h('p', { className: 'muted', textContent: 'シートを選択してください。' }))
    return
  }
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
    const w = img.width * scale
    const hgt = img.height * scale
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, w, hgt)
    ctx.strokeStyle = 'rgba(245,169,127,0.9)'
    ctx.fillStyle = 'rgba(245,169,127,0.95)'
    ctx.font = '11px monospace'
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        const x = (c * w) / sheet.cols
        const y = (r * hgt) / sheet.rows
        ctx.strokeRect(x + 0.5, y + 0.5, w / sheet.cols - 1, hgt / sheet.rows - 1)
        ctx.fillText(String(r * sheet.cols + c), x + 3, y + 12)
      }
    }
  }
  img.src = assetUrl(fxSheetPath(sheet.file))

  const gridInput = (labelText: string, key: 'cols' | 'rows'): HTMLElement => {
    const input = h('input')
    input.type = 'number'
    input.min = '1'
    input.max = '64'
    input.value = String(sheet[key])
    input.onchange = () => {
      const v = Math.floor(Number(input.value))
      if (!Number.isFinite(v) || v < 1) return
      sheet[key] = v
      if (scene) applyFxSheetGrid(scene, sheet)
      fx?.clearCaches()
      renderSheets()
      renderTimeline()
      scheduleReplay()
    }
    return h('div', { className: 'field wide' }, [h('label', { textContent: labelText }), input])
  }
  form.replaceChildren(
    h('div', { className: 'field wide' }, [h('label', { textContent: 'キー' }), h('span', { textContent: sheet.key })]),
    h('div', { className: 'field wide' }, [h('label', { textContent: 'ファイル' }), h('span', { textContent: sheet.file })]),
    gridInput('列', 'cols'),
    gridInput('行', 'rows'),
    h('p', { className: 'muted', textContent: `コマ数 ${sheet.cols * sheet.rows}（番号は左上から右へ）` }),
  )
}

function bindSheetTab(): void {
  byId('btn-save-manifest', HTMLButtonElement).onclick = async () => {
    try {
      await saveAsset(FX_MANIFEST_PATH, toJson(manifest))
      toast('シート設定を保存しました')
    } catch (e) {
      toast(`保存に失敗しました: ${String(e)}`, true)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 割り当て
// ─────────────────────────────────────────────────────────────
function renderBindings(): void {
  const ids = [...new Set([...manifest.presets, ...(fx?.getPresetIds() ?? [])])].filter(id => id !== EDIT_KEY).sort()
  const rows = FX_EVENTS.map(ev => {
    const select = h('select')
    const none = h('option', { textContent: '（従来の演出）' })
    none.value = ''
    select.appendChild(none)
    ids.forEach(id => {
      const op = h('option', { textContent: id })
      op.value = id
      select.appendChild(op)
    })
    select.value = bindings.bindings[ev] ?? ''
    select.onchange = () => {
      const next = { ...bindings.bindings }
      if (select.value === '') delete next[ev]
      else next[ev] = select.value
      bindings = { ...bindings, bindings: next }
      fx?.setBindings(bindings)
    }
    const test = h('button', { textContent: '▶', title: 'この場面のエフェクトを再生' })
    test.onclick = () => {
      const id = bindings.bindings[ev]
      if (!id) {
        toast('従来の演出（ゲーム内でのみ再生）')
        return
      }
      previewHandle?.stop()
      previewHandle = fx?.play(id, 0, 0, { follow: { x: 0, y: 0, active: true } }) ?? null
      playStartedAt = performance.now()
    }
    return h('div', { className: 'bind-row' }, [h('label', { textContent: FX_EVENT_LABELS[ev] }), select, test])
  })
  byId('bind-list', HTMLDivElement).replaceChildren(...rows)
}

function bindBindingsTab(): void {
  byId('btn-save-bindings', HTMLButtonElement).onclick = async () => {
    try {
      await saveAsset(FX_BINDINGS_PATH, toJson(bindings))
      toast('割り当てを保存しました（ゲームの再読み込みで反映）')
    } catch (e) {
      toast(`保存に失敗しました: ${String(e)}`, true)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 全体
// ─────────────────────────────────────────────────────────────
function renderAll(): void {
  renderToolbar()
  renderLayerList()
  renderForm()
  renderTimeline()
  renderBindings()
}

function bindPreviewBar(): void {
  byId('btn-play', HTMLButtonElement).onclick = () => playPreview()
  byId('opt-dummy', HTMLInputElement).onchange = e => {
    if (e.target instanceof HTMLInputElement) dummy?.setVisible(e.target.checked)
  }
  byId('opt-bg', HTMLSelectElement).onchange = () => applyBackground()
  byId('opt-zoom', HTMLSelectElement).onchange = () => applyZoom()
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      const tab = btn.dataset.tab
      if (tab) document.getElementById(tab)?.classList.add('active')
      if (tab === 'tab-sheets') void refreshSheetFiles()
      if (tab === 'tab-bindings') renderBindings()
    }
  })
  window.addEventListener('keydown', e => {
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
    if (e.code === 'Space') {
      e.preventDefault()
      playPreview()
    }
  })
  window.addEventListener('beforeunload', e => {
    if (dirty) e.preventDefault()
  })
}

async function main(): Promise<void> {
  manifest = normalizeManifest(await fetchJson(FX_MANIFEST_PATH))
  bindings = normalizeBindings(await fetchJson(FX_BINDINGS_PATH))
  const presets: FxPreset[] = []
  for (const id of manifest.presets) {
    const data = await fetchJson(fxPresetPath(id))
    if (data !== null) presets.push(normalizePreset(data, id))
  }
  selectedSheet = manifest.sheets[0]?.key ?? null

  // URL の ?id=xxx で開く。無ければ最初のプリセット
  const requested = new URLSearchParams(location.search).get('id')
  const initial = presets.find(p => p.id === requested) ?? presets[0]
  if (initial) {
    raw = toJson(initial)
    savedId = initial.id
  }

  bindToolbar()
  bindLayerButtons()
  bindPreviewBar()
  bindSheetTab()
  bindBindingsTab()
  renderAll()
  startPreview(presets)
}

void main()
