// 手配度システム（マップ単位でリセット）

const MAX_LEVEL = 100
const DEFAULT_THRESHOLD = 30
const DECAY_RATE = 5          // 隠れているとき 毎秒 -5
const HIDDEN_REQUIRED_MS = 3000  // 3秒視野外で減衰開始

interface WantedData {
  level: number
  hiddenMs: number   // プレイヤーが全サキュバスの視野外にいた累計ms
}

let _data: WantedData = { level: 0, hiddenMs: 0 }
let _threshold = DEFAULT_THRESHOLD
const _listeners: ((level: number) => void)[] = []

function _notify(): void {
  _listeners.forEach(cb => cb(_data.level))
}

export function getWantedLevel(): number {
  return _data.level
}

export function isHostile(): boolean {
  return _data.level >= _threshold
}

export function getThreshold(): number {
  return _threshold
}

export function addWanted(amount: number): void {
  const prev = _data.level
  _data = { ..._data, level: Math.min(MAX_LEVEL, _data.level + amount), hiddenMs: 0 }
  if (_data.level !== prev) _notify()
}

/**
 * MainScene.update() から毎フレーム呼ぶ
 * @param delta フレーム時間(ms)
 * @param playerDetected いずれかのサキュバスがプレイヤーを検知しているか
 */
export function updateWanted(delta: number, playerDetected: boolean): void {
  if (playerDetected) {
    _data = { ..._data, hiddenMs: 0 }
    return
  }
  if (_data.level <= 0) return

  _data = { ..._data, hiddenMs: _data.hiddenMs + delta }
  if (_data.hiddenMs >= HIDDEN_REQUIRED_MS) {
    const decay = (DECAY_RATE / 1000) * delta
    const prev = _data.level
    _data = { ..._data, level: Math.max(0, _data.level - decay) }
    if (Math.floor(_data.level) !== Math.floor(prev)) _notify()
  }
}

export function onWantedChange(cb: (level: number) => void): () => void {
  _listeners.push(cb)
  return () => {
    const idx = _listeners.indexOf(cb)
    if (idx >= 0) _listeners.splice(idx, 1)
  }
}

export function resetWanted(): void {
  _data = { level: 0, hiddenMs: 0 }
  _notify()
}

export function setWantedThreshold(threshold: number): void {
  _threshold = threshold
}
