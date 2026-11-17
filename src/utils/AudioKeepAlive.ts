let keepAliveStarted = false

/** AudioContext を iOS が自動suspend しないよう無音ループを流す（初回のみ） */
export function startKeepAlive(ctx: AudioContext): void {
  if (keepAliveStarted) return
  keepAliveStarted = true
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(ctx.destination)
    src.start(0)
  } catch (_) { /* ignore */ }
}
