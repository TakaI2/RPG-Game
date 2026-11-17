interface WorldStateData {
  dangerLevel: 0 | 1 | 2 | 3
  activeEvents: string[]
}

let _state: WorldStateData = { dangerLevel: 0, activeEvents: [] }
const _listeners: (() => void)[] = []

function _notify(): void {
  _listeners.forEach(cb => cb())
}

export function getWorldState(): Readonly<WorldStateData> {
  return _state
}

export function setDangerLevel(level: 0 | 1 | 2 | 3): void {
  if (_state.dangerLevel === level) return
  _state = { ..._state, dangerLevel: level }
  _notify()
}

export function addEvent(name: string): void {
  if (_state.activeEvents.includes(name)) return
  _state = { ..._state, activeEvents: [..._state.activeEvents, name] }
  _notify()
}

export function removeEvent(name: string): void {
  if (!_state.activeEvents.includes(name)) return
  _state = { ..._state, activeEvents: _state.activeEvents.filter(e => e !== name) }
  _notify()
}

export function hasEvent(name: string): boolean {
  return _state.activeEvents.includes(name)
}

export function onWorldStateChange(cb: () => void): () => void {
  _listeners.push(cb)
  return () => {
    const idx = _listeners.indexOf(cb)
    if (idx >= 0) _listeners.splice(idx, 1)
  }
}

export function resetWorldState(): void {
  const changed = _state.dangerLevel !== 0 || _state.activeEvents.length > 0
  _state = { dangerLevel: 0, activeEvents: [] }
  if (changed) _notify()
}
