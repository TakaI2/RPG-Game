import Phaser from 'phaser'
import {
  FX_BINDINGS_CACHE_KEY, FX_MANIFEST_CACHE_KEY, fxPresetCacheKey, fxSheetTextureKey, normalizeManifest,
  type FxManifest, type FxSheetDef, type JsonValue,
} from './FxTypes'

/**
 * エフェクト素材の読み込み。
 * - マニフェストは preload 中に同期XHRで取得（既存の tilesets / npc-defs と同じ方式）
 * - シートは通常の画像として読み込み、読み込み後に applyFxSheetGrid でコマに切り分ける
 *   （コマ割りをエディタで変えても画像を読み直さずに済む）
 */

export const FX_BASE_PATH = 'assets/fx'
export const FX_MANIFEST_PATH = `${FX_BASE_PATH}/fx-manifest.json`
export const FX_BINDINGS_PATH = `${FX_BASE_PATH}/fx-bindings.json`
export const FX_PRESETS_DIR = `${FX_BASE_PATH}/presets`
export const FX_SHEETS_DIR = `${FX_BASE_PATH}/sheets`

export const fxPresetPath = (id: string): string => `${FX_PRESETS_DIR}/${id}.fx.json`
export const fxSheetPath = (file: string): string => `${FX_SHEETS_DIR}/${file}`

function fetchJsonSync(url: string): JsonValue | null {
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.send()
    if (xhr.status !== 200) return null
    const parsed: JsonValue = JSON.parse(xhr.responseText)
    return parsed
  } catch (e) {
    console.warn(`[Fx] could not load ${url}`, e)
    return null
  }
}

/** preload() 内で呼ぶ。マニフェストに載っているシート・プリセット・割り当てを読み込みキューに積む */
export function queueFxAssets(scene: Phaser.Scene): FxManifest {
  const raw = fetchJsonSync(FX_MANIFEST_PATH)
  const manifest = normalizeManifest(raw)
  scene.cache.json.add(FX_MANIFEST_CACHE_KEY, manifest)
  manifest.sheets.forEach(sheet => {
    const key = fxSheetTextureKey(sheet.key)
    if (!scene.textures.exists(key)) scene.load.image(key, fxSheetPath(sheet.file))
  })
  manifest.presets.forEach(id => scene.load.json(fxPresetCacheKey(id), fxPresetPath(id)))
  scene.load.json(FX_BINDINGS_CACHE_KEY, FX_BINDINGS_PATH)
  return manifest
}

/** シート画像を列×行のコマ（フレーム名 0,1,2…）に切り分ける。何度呼んでもよい */
export function applyFxSheetGrid(scene: Phaser.Scene, sheet: FxSheetDef): boolean {
  const key = fxSheetTextureKey(sheet.key)
  if (!scene.textures.exists(key)) return false
  const texture = scene.textures.get(key)
  texture.getFrameNames(false).forEach(name => texture.remove(name))
  const source = texture.source[0]
  const fw = Math.floor(source.width / sheet.cols)
  const fh = Math.floor(source.height / sheet.rows)
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      texture.add(r * sheet.cols + c, 0, c * fw, r * fh, fw, fh)
    }
  }
  return true
}

/** create() 以降で呼ぶ。マニフェストの全シートをコマに切り分ける */
export function applyFxSheetGrids(scene: Phaser.Scene): void {
  const manifest = normalizeManifest(scene.cache.json.get(FX_MANIFEST_CACHE_KEY) ?? null)
  manifest.sheets.forEach(sheet => {
    if (!applyFxSheetGrid(scene, sheet)) console.warn(`[Fx] sheet not loaded: ${sheet.key}`)
  })
}
