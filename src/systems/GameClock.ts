interface GameClockData {
  hour: number
  minute: number
}

let _clock: GameClockData = { hour: 7, minute: 0 }
let _accumulatedMs = 0
let _realMsPerGameHour = 180000  // デフォルト: 実3分 = ゲーム1時間
const _hourListeners: ((hour: number) => void)[] = []

export function getGameClock(): Readonly<GameClockData> {
  return _clock
}

export function advanceClock(deltaMs: number): void {
  _accumulatedMs += deltaMs
  const msPerMinute = _realMsPerGameHour / 60

  while (_accumulatedMs >= msPerMinute) {
    _accumulatedMs -= msPerMinute
    _clock = { ..._clock, minute: _clock.minute + 1 }

    if (_clock.minute >= 60) {
      const prevHour = _clock.hour
      _clock = { hour: (_clock.hour + 1) % 24, minute: 0 }
      if (_clock.hour !== prevHour) {
        _hourListeners.forEach(cb => cb(_clock.hour))
      }
    }
  }
}

export function onHourChange(cb: (hour: number) => void): () => void {
  _hourListeners.push(cb)
  return () => {
    const idx = _hourListeners.indexOf(cb)
    if (idx >= 0) _hourListeners.splice(idx, 1)
  }
}

export function setClockSpeed(realMsPerGameHour: number): void {
  _realMsPerGameHour = realMsPerGameHour
}

export function resetClock(hour = 7): void {
  _clock = { hour, minute: 0 }
  _accumulatedMs = 0
}
