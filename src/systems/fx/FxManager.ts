import Phaser from 'phaser'
import {
  FX_BINDINGS_CACHE_KEY, FX_BINDINGS_FORMAT, FX_MANIFEST_CACHE_KEY, FX_VERSION,
  FX_EVENT_PRIORITY, fxPresetCacheKey, fxSheetTextureKey, hexToInt, normalizeBindings, normalizeManifest, normalizePreset,
  type FxBindings, type FxBlend, type FxColorRange, type FxEvent, type FxLayer, type FxParticleLayer,
  type FxPreset, type FxRange, type FxShapeLayer, type FxSpriteLayer,
} from './FxTypes'
import { ensureFxTextures, FX_SHAPE_TEXTURES } from './FxTextures'

/**
 * 2D エフェクト再生エンジン。ゲームとエフェクトエディタで共有する。
 *
 *   const fx = createFxManager(scene, { addWorldObject })
 *   fx.play('kill_burst', x, y)
 *   fx.playBinding('enemyKill', x, y)   // 割り当てが無ければ false
 *
 * シーンの update イベントで自動的に進むため、シーン側の update を変更する必要はない。
 */

export interface FxFollowTarget {
  x: number
  y: number
  active?: boolean
}

export interface FxPlayOptions {
  follow?: FxFollowTarget
  rotation?: number   // rad
  scale?: number
  tint?: string       // '#rrggbb'。指定時はレイヤー色を上書き
  depth?: number
  /** 上限超過時、低いものから消される（既定 0）。新規より高いものしか無ければ新規を再生しない */
  priority?: number
}

export interface FxHandle {
  readonly presetId: string
  stop(): void
  isDone(): boolean
}

export interface FxManagerOptions {
  addWorldObject?: (go: Phaser.GameObjects.GameObject) => void
  maxInstances?: number
  baseDepth?: number
  /** true: シーンの JSON キャッシュからマニフェスト・プリセット・割り当てを読み込む */
  loadFromCache?: boolean
}

export interface FxManager {
  play(id: string, x: number, y: number, opts?: FxPlayOptions): FxHandle | null
  playBinding(event: FxEvent, x: number, y: number, opts?: FxPlayOptions): boolean
  setPreset(preset: FxPreset): void
  removePreset(id: string): void
  getPreset(id: string): FxPreset | undefined
  getPresetIds(): string[]
  setBindings(bindings: FxBindings): void
  getBindings(): FxBindings
  /** シートのコマ割り変更後などに、共有パーティクルとアニメ定義を作り直す */
  clearCaches(): void
  stopAll(): void
  activeCount(): number
  destroy(): void
}

const DEFAULT_MAX_INSTANCES = 48
const DEFAULT_BASE_DEPTH = 12
const SHAPE_AUTO_DURATION = 400
const IMAGE_POOL_LIMIT = 200

interface LayerRuntime {
  layer: FxLayer
  index: number
  started: boolean
  finished: boolean
  /** delay 起点の長さ(ms)。Infinity = 停止されるまで */
  duration: number
  images: Phaser.GameObjects.Image[]
  baseAngles: number[]   // rad（コピーごと）
  frames: number[]
  emitter: Phaser.GameObjects.Particles.ParticleEmitter | null
  ownsEmitter: boolean
  /** 所有 emitter を破棄する時刻（ローカル時間） */
  emitterDestroyAt: number
}

interface Instance {
  preset: FxPreset
  x: number
  y: number
  follow: FxFollowTarget | null
  rotation: number
  scale: number
  tint: string | null
  depth: number
  priority: number
  t: number
  layers: LayerRuntime[]
  done: boolean
}

const BLEND: Record<FxBlend, Phaser.BlendModes> = {
  normal: Phaser.BlendModes.NORMAL,
  add: Phaser.BlendModes.ADD,
  screen: Phaser.BlendModes.SCREEN,
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const lerpRange = (r: FxRange, t: number): number => lerp(r.start, r.end, t)
const lerpColor = (c: FxColorRange, t: number): number => {
  const a = hexToInt(c.start)
  const b = hexToInt(c.end)
  const ch = (shift: number): number => Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function createFxManager(scene: Phaser.Scene, options: FxManagerOptions = {}): FxManager {
  const addWorld = options.addWorldObject ?? ((): void => {})
  const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES
  const baseDepth = options.baseDepth ?? DEFAULT_BASE_DEPTH

  ensureFxTextures(scene)

  const presets = new Map<string, FxPreset>()
  let bindings: FxBindings = { format: FX_BINDINGS_FORMAT, version: FX_VERSION, bindings: {} }
  const instances: Instance[] = []
  const imagePool: Phaser.GameObjects.Image[] = []
  /** (プリセット#レイヤー) ごとの共有 emitter（単発・非追従の粒子用） */
  const sharedEmitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>()
  const createdAnims = new Set<string>()
  const warned = new Set<string>()

  const warnOnce = (msg: string): void => {
    if (warned.has(msg)) return
    warned.add(msg)
    console.warn(`[Fx] ${msg}`)
  }

  if (options.loadFromCache) {
    const manifest = normalizeManifest(scene.cache.json.get(FX_MANIFEST_CACHE_KEY) ?? null)
    manifest.presets.forEach(id => {
      const raw = scene.cache.json.get(fxPresetCacheKey(id))
      if (raw) presets.set(id, normalizePreset(raw, id))
      else warnOnce(`preset not loaded: ${id}`)
    })
    bindings = normalizeBindings(scene.cache.json.get(FX_BINDINGS_CACHE_KEY) ?? null)
  }

  // ── テクスチャ・コマ ──
  const sheetFrames = (sheet: string, from: number, to: number): number[] => {
    const key = fxSheetTextureKey(sheet)
    if (!scene.textures.exists(key)) return []
    const total = scene.textures.get(key).frameTotal - 1   // __BASE を除く
    if (total <= 0) return []
    const last = to < 0 ? total - 1 : Math.min(to, total - 1)
    const first = Math.min(Math.max(0, from), last)
    return Array.from({ length: last - first + 1 }, (_, i) => first + i)
  }

  const ensureParticleAnim = (sheet: string, frames: number[], fps: number): string => {
    const key = `fxa_${sheet}_${frames[0]}_${frames[frames.length - 1]}_${fps}`
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: frames.map(f => ({ key: fxSheetTextureKey(sheet), frame: f })),
        frameRate: fps,
        repeat: 0,
      })
      createdAnims.add(key)
    }
    return key
  }

  // ── 画像プール ──
  const acquireImage = (texture: string, frame: number | undefined): Phaser.GameObjects.Image => {
    const img = imagePool.pop() ?? (() => {
      const created = scene.add.image(0, 0, texture, frame)
      addWorld(created)
      return created
    })()
    img.setTexture(texture, frame)
    img.setActive(true).setVisible(true).setAlpha(1).setAngle(0).setScale(1).clearTint()
    return img
  }

  const releaseImage = (img: Phaser.GameObjects.Image): void => {
    if (imagePool.length >= IMAGE_POOL_LIMIT) {
      img.destroy()
      return
    }
    img.setActive(false).setVisible(false)
    imagePool.push(img)
  }

  // ── パーティクル ──
  const buildEmitterConfig = (
    layer: FxParticleLayer, scale: number, tint: string | null,
  ): { texture: string; config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig } | null => {
    let texture = FX_SHAPE_TEXTURES.dot.key
    let baseW = FX_SHAPE_TEXTURES.dot.radius * 2
    let anim: string | undefined
    if (layer.sheet !== '') {
      const frames = sheetFrames(layer.sheet, layer.frameStart, layer.frameEnd)
      if (frames.length === 0) {
        warnOnce(`sheet not loaded: ${layer.sheet}`)
        return null
      }
      texture = fxSheetTextureKey(layer.sheet)
      baseW = scene.textures.get(texture).get(frames[0]).width
      if (frames.length > 1) anim = ensureParticleAnim(layer.sheet, frames, layer.fps)
    }
    const colors = tint ? [hexToInt(tint), hexToInt(tint)] : [hexToInt(layer.color.start), hexToInt(layer.color.end)]
    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      speed: { min: layer.speed.min * scale, max: layer.speed.max * scale },
      angle: { min: layer.angleMin, max: layer.angleMax },
      lifespan: { min: layer.lifespan.min, max: layer.lifespan.max },
      gravityY: layer.gravityY * scale,
      scale: { start: (layer.size.start * scale) / baseW, end: (layer.size.end * scale) / baseW },
      alpha: { start: layer.alpha.start, end: layer.alpha.end },
      color: colors,
      rotate: layer.rotate ? { min: 0, max: 360 } : 0,
      blendMode: BLEND[layer.blend],
      emitting: false,
      ...(anim ? { anim } : {}),
      ...(layer.rate > 0 ? { frequency: 1000 / layer.rate, quantity: 1 } : {}),
      ...(layer.spawnRadius > 0
        ? { emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, layer.spawnRadius * scale), quantity: 1 } }
        : {}),
    }
    return { texture, config }
  }

  const createEmitter = (
    layer: FxParticleLayer, scale: number, tint: string | null, depth: number,
  ): Phaser.GameObjects.Particles.ParticleEmitter | null => {
    const built = buildEmitterConfig(layer, scale, tint)
    if (!built) return null
    const emitter = scene.add.particles(0, 0, built.texture, built.config)
    emitter.setDepth(depth)
    addWorld(emitter)
    return emitter
  }

  const sharedKey = (presetId: string, index: number): string => `${presetId}#${index}`

  const getSharedEmitter = (preset: FxPreset, layer: FxParticleLayer, index: number) => {
    const key = sharedKey(preset.id, index)
    const existing = sharedEmitters.get(key)
    if (existing) return existing
    const created = createEmitter(layer, preset.scale, null, baseDepth + layer.depth)
    if (created) sharedEmitters.set(key, created)
    return created
  }

  const destroySharedFor = (presetId: string): void => {
    sharedEmitters.forEach((em, key) => {
      if (key.startsWith(`${presetId}#`)) {
        em.destroy()
        sharedEmitters.delete(key)
      }
    })
  }

  // ── インスタンス ──
  const anchorOf = (inst: Instance): { x: number; y: number } => {
    if (inst.follow && inst.follow.active !== false) {
      inst.x = inst.follow.x
      inst.y = inst.follow.y
    }
    return { x: inst.x, y: inst.y }
  }

  const layerPosition = (inst: Instance, layer: FxLayer): { x: number; y: number } => {
    const a = anchorOf(inst)
    const cos = Math.cos(inst.rotation)
    const sin = Math.sin(inst.rotation)
    const ox = layer.offsetX * inst.scale
    const oy = layer.offsetY * inst.scale
    return { x: a.x + ox * cos - oy * sin, y: a.y + ox * sin + oy * cos }
  }

  const resolveDuration = (layer: FxLayer, frames: number[]): number => {
    if (layer.duration > 0) return layer.duration
    if (layer.type === 'sprite') {
      if (layer.loop) return Infinity
      return frames.length > 0 ? (frames.length / layer.fps) * 1000 : 0
    }
    if (layer.type === 'shape') return SHAPE_AUTO_DURATION
    return layer.rate > 0 ? Infinity : 0
  }

  const startImages = (inst: Instance, lr: LayerRuntime, layer: FxSpriteLayer | FxShapeLayer): void => {
    const copies = layer.type === 'shape' ? layer.copies : 1
    const base = Phaser.Math.DegToRad(layer.angle) + inst.rotation
      + (layer.angleRandom ? Math.random() * Math.PI * 2 : 0)
    for (let i = 0; i < copies; i++) {
      const img = layer.type === 'sprite'
        ? acquireImage(fxSheetTextureKey(layer.sheet), lr.frames[0])
        : acquireImage(FX_SHAPE_TEXTURES[layer.shape].key, undefined)
      img.setBlendMode(BLEND[layer.blend])
      img.setDepth(inst.depth + layer.depth)
      lr.images.push(img)
      lr.baseAngles.push(base + (i * Math.PI * 2) / copies)
    }
  }

  const startLayer = (inst: Instance, lr: LayerRuntime): void => {
    lr.started = true
    const layer = lr.layer
    if (layer.type === 'sprite') {
      lr.frames = sheetFrames(layer.sheet, layer.frameStart, layer.frameEnd)
      if (lr.frames.length === 0) {
        warnOnce(`sheet not loaded: ${layer.sheet}`)
        lr.finished = true
        return
      }
      lr.duration = resolveDuration(layer, lr.frames)
      startImages(inst, lr, layer)
      return
    }
    if (layer.type === 'shape') {
      lr.duration = resolveDuration(layer, [])
      startImages(inst, lr, layer)
      return
    }
    // particle
    lr.duration = resolveDuration(layer, [])
    const pos = layerPosition(inst, layer)
    const canShare = layer.rate === 0 && !inst.follow && inst.scale === inst.preset.scale && !inst.tint
    if (canShare) {
      const em = getSharedEmitter(inst.preset, layer, lr.index)
      if (em && layer.count > 0) em.explode(layer.count, pos.x, pos.y)
      lr.finished = true
      return
    }
    const em = createEmitter(layer, inst.scale, inst.tint, inst.depth + layer.depth)
    if (!em) {
      lr.finished = true
      return
    }
    lr.emitter = em
    lr.ownsEmitter = true
    if (layer.count > 0) em.explode(layer.count, pos.x, pos.y)
    if (layer.rate > 0) {
      em.setPosition(pos.x, pos.y)
      em.start()
    }
  }

  const updateImages = (inst: Instance, lr: LayerRuntime, local: number): void => {
    const layer = lr.layer
    if (layer.type === 'particle') return
    const p = Number.isFinite(lr.duration) && lr.duration > 0 ? Math.min(1, local / lr.duration) : 0
    const e = Phaser.Tweens.Builders.GetEaseFunction(layer.ease)(p)
    const sizePx = lerpRange(layer.size, e) * inst.scale
    const alpha = lerpRange(layer.alpha, e)
    const tint = inst.tint ? hexToInt(inst.tint) : lerpColor(layer.color, e)
    const spin = Phaser.Math.DegToRad(layer.spin) * (local / 1000)
    const pos = layerPosition(inst, layer)

    let frameIndex = 0
    if (layer.type === 'sprite' && lr.frames.length > 0) {
      const idx = Math.floor((local / 1000) * layer.fps)
      frameIndex = layer.loop ? idx % lr.frames.length : Math.min(idx, lr.frames.length - 1)
    }

    lr.images.forEach((img, i) => {
      if (layer.type === 'sprite') {
        img.setFrame(lr.frames[frameIndex])
        img.setScale(sizePx / Math.max(1, img.frame.width))
      } else {
        img.setScale(sizePx / 2 / FX_SHAPE_TEXTURES[layer.shape].radius)
      }
      img.setPosition(pos.x, pos.y)
      img.setRotation(lr.baseAngles[i] + spin)
      img.setAlpha(alpha)
      img.setTint(tint)
    })
  }

  const finishLayer = (inst: Instance, lr: LayerRuntime): void => {
    lr.finished = true
    lr.images.forEach(releaseImage)
    lr.images = []
    if (lr.emitter && lr.ownsEmitter) {
      lr.emitter.stop()
      const layer = lr.layer
      const life = layer.type === 'particle' ? layer.lifespan.max : 0
      lr.emitterDestroyAt = inst.t + life
    }
  }

  const disposeInstance = (inst: Instance): void => {
    inst.done = true
    inst.layers.forEach(lr => {
      lr.images.forEach(releaseImage)
      lr.images = []
      if (lr.emitter && lr.ownsEmitter) lr.emitter.destroy()
      lr.emitter = null
    })
  }

  const stepInstance = (inst: Instance, delta: number): void => {
    inst.t += delta * inst.preset.speed
    let alive = false
    inst.layers.forEach(lr => {
      const layer = lr.layer
      if (!lr.started && inst.t >= layer.delay) startLayer(inst, lr)
      if (!lr.started) {
        alive = true
        return
      }
      const local = inst.t - layer.delay
      if (!lr.finished) {
        updateImages(inst, lr, local)
        if (lr.emitter && lr.ownsEmitter && layer.type === 'particle' && layer.rate > 0) {
          const pos = layerPosition(inst, layer)
          lr.emitter.setPosition(pos.x, pos.y)
        }
        if (local >= lr.duration) finishLayer(inst, lr)
      }
      if (!lr.finished) alive = true
      if (lr.emitter && lr.ownsEmitter) {
        if (lr.finished && inst.t >= lr.emitterDestroyAt) {
          lr.emitter.destroy()
          lr.emitter = null
        } else {
          alive = true
        }
      }
    })
    if (!alive) disposeInstance(inst)
  }

  const update = (_time: number, delta: number): void => {
    for (let i = instances.length - 1; i >= 0; i--) {
      const inst = instances[i]
      if (!inst.done) stepInstance(inst, delta)
      if (inst.done) instances.splice(i, 1)
    }
  }

  scene.events.on(Phaser.Scenes.Events.UPDATE, update)

  const stopAll = (): void => {
    instances.forEach(disposeInstance)
    instances.length = 0
  }

  const clearCaches = (): void => {
    sharedEmitters.forEach(em => em.destroy())
    sharedEmitters.clear()
    createdAnims.forEach(key => scene.anims.remove(key))
    createdAnims.clear()
  }

  const play = (id: string, x: number, y: number, opts: FxPlayOptions = {}): FxHandle | null => {
    const preset = presets.get(id)
    if (!preset) {
      warnOnce(`unknown preset: ${id}`)
      return null
    }
    const layers = preset.layers.filter(l => l.enabled)
    if (layers.length === 0) return null

    const priority = opts.priority ?? 0
    while (instances.length >= maxInstances) {
      // 優先度が新規以下のもののうち、最も低く・最も古いものを消す
      let victim = -1
      instances.forEach((inst, i) => {
        if (inst.priority > priority) return
        if (victim < 0 || inst.priority < instances[victim].priority) victim = i
      })
      if (victim < 0) return null
      disposeInstance(instances[victim])
      instances.splice(victim, 1)
    }

    const inst: Instance = {
      preset,
      x,
      y,
      // 追従はプリセットが follow=true のときだけ有効（false なら発生地点に残る）
      follow: preset.follow ? (opts.follow ?? null) : null,
      rotation: opts.rotation ?? 0,
      scale: preset.scale * (opts.scale ?? 1),
      tint: opts.tint ?? null,
      depth: opts.depth ?? baseDepth,
      priority,
      t: 0,
      layers: layers.map(layer => ({
        layer,
        index: preset.layers.indexOf(layer),
        started: false,
        finished: false,
        duration: 0,
        images: [],
        baseAngles: [],
        frames: [],
        emitter: null,
        ownsEmitter: false,
        emitterDestroyAt: 0,
      })),
      done: false,
    }
    instances.push(inst)
    stepInstance(inst, 0)
    if (inst.done) {
      const idx = instances.indexOf(inst)
      if (idx >= 0) instances.splice(idx, 1)
    }
    return {
      presetId: id,
      stop: () => {
        if (inst.done) return
        disposeInstance(inst)
        const idx = instances.indexOf(inst)
        if (idx >= 0) instances.splice(idx, 1)
      },
      isDone: () => inst.done,
    }
  }

  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update)
    stopAll()
    clearCaches()
    imagePool.forEach(img => img.destroy())
    imagePool.length = 0
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy)

  return {
    play,
    playBinding: (event, x, y, opts) => {
      const id = bindings.bindings[event]
      if (!id) return false
      return play(id, x, y, { priority: FX_EVENT_PRIORITY[event], ...opts }) !== null
    },
    setPreset: (preset) => {
      destroySharedFor(preset.id)
      presets.set(preset.id, preset)
    },
    removePreset: (id) => {
      destroySharedFor(id)
      presets.delete(id)
    },
    getPreset: (id) => presets.get(id),
    getPresetIds: () => [...presets.keys()].sort(),
    setBindings: (b) => { bindings = b },
    getBindings: () => bindings,
    clearCaches,
    stopAll,
    activeCount: () => instances.length,
    destroy,
  }
}
