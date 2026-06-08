import Phaser from 'phaser'
import { TILE } from '../config'
import { EnemySpeech } from './EnemySpeech'
import { getWorldState, onWorldStateChange } from './WorldState'
import { getGameClock, onHourChange } from './GameClock'
import { hasEvent } from './WorldState'
import type DialogUI from './Dialog'
import type { DialogData } from './Dialog'
import type {
  NPCDef, NPCSpawn, DialogLine,
  ActivitySpot, ActivityType, ActionId, NPCRole,
  ScheduleEntry, WaypointDef, UtilityWeights,
} from '../types/NPCTypes'
import { resolveText, getLocale } from '../utils/LocaleManager'
import { createNPCDirectionalAnimations, getDirectionFromVelocity } from './AnimationManager'
import { isHostile, updateWanted } from './WantedSystem'

// ─── 定数 ────────────────────────────────────────────────────────────────────

const ARRIVE_THRESHOLD = 8       // px: ウェイポイント到達判定
const ACTION_EVAL_INTERVAL = 2000 // ms: AI再評価間隔
const CULL_MARGIN = 200           // px: カリングマージン

const ROLE_WEIGHTS: Record<NPCRole, Required<UtilityWeights>> = {
  villager:  { fleeWeight: 1.5, scheduleWeight: 1.0, idleWeight: 1.0, patrolWeight: 0.5 },
  guard:     { fleeWeight: 0.2, scheduleWeight: 0.8, idleWeight: 0.5, patrolWeight: 1.5 },
  merchant:  { fleeWeight: 1.0, scheduleWeight: 1.2, idleWeight: 1.5, patrolWeight: 0.3 },
  elder:     { fleeWeight: 0.8, scheduleWeight: 1.5, idleWeight: 1.2, patrolWeight: 0.3 },
  innkeeper: { fleeWeight: 1.0, scheduleWeight: 1.3, idleWeight: 1.5, patrolWeight: 0.2 },
}

// ─── 内部型 ──────────────────────────────────────────────────────────────────

interface NPCInstance {
  sprite: Phaser.Physics.Arcade.Sprite
  def: NPCDef
  speech: EnemySpeech
  // patrol 用（既存）
  patrolStartX: number
  patrolDir: number
  // AI 状態
  currentAction: ActionId
  activeScheduleId: string | null
  waypointIndex: number
  waypointWaitTimer: number
  actionEvalTimer: number
  lastGameHour: number
  currentPath: { x: number; y: number }[]  // A* 経路（タイル座標）
  facing: string                            // 'down' | 'up' | 'left' | 'right'
  // 敵対モード
  hostile: boolean
  attackTimer: number                       // 攻撃クールダウン残りms
}

// ─── A* 経路探索 ─────────────────────────────────────────────────────────────

interface AStarNode {
  x: number; y: number
  g: number; h: number; f: number
  parent: AStarNode | null
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

function findPath(
  wallGrid: boolean[][],
  startTX: number, startTY: number,
  goalTX: number,  goalTY: number,
): { x: number; y: number }[] {
  const rows = wallGrid.length
  const cols = rows > 0 ? wallGrid[0].length : 0
  if (rows === 0 || cols === 0) return []
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v))
  startTX = clamp(startTX, cols); startTY = clamp(startTY, rows)
  goalTX  = clamp(goalTX,  cols); goalTY  = clamp(goalTY,  rows)
  if (wallGrid[goalTY]?.[goalTX]) return []  // ゴールが壁

  const open: AStarNode[] = []
  const closed = new Set<string>()
  const key = (x: number, y: number) => `${x},${y}`

  const start: AStarNode = { x: startTX, y: startTY, g: 0, h: heuristic(startTX, startTY, goalTX, goalTY), f: 0, parent: null }
  start.f = start.g + start.h
  open.push(start)

  const DIRS = [[0,-1],[0,1],[-1,0],[1,0]]
  const MAX_ITER = 400

  for (let iter = 0; iter < MAX_ITER && open.length > 0; iter++) {
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift()!
    if (cur.x === goalTX && cur.y === goalTY) {
      const path: { x: number; y: number }[] = []
      let n: AStarNode | null = cur
      while (n) { path.unshift({ x: n.x, y: n.y }); n = n.parent }
      return path.slice(1)  // スタート自身は除く
    }
    closed.add(key(cur.x, cur.y))
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx; const ny = cur.y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      if (wallGrid[ny]?.[nx]) continue
      if (closed.has(key(nx, ny))) continue
      const g = cur.g + 1
      const existing = open.find(n => n.x === nx && n.y === ny)
      if (!existing) {
        const h = heuristic(nx, ny, goalTX, goalTY)
        open.push({ x: nx, y: ny, g, h, f: g + h, parent: cur })
      } else if (g < existing.g) {
        existing.g = g; existing.f = g + existing.h; existing.parent = cur
      }
    }
  }
  return []  // 経路なし
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────

function isHourInRange(hour: number, start: number, end: number): boolean {
  if (start <= end) return hour >= start && hour < end
  return hour >= start || hour < end  // 深夜またぎ（例: 22〜6）
}

function mergeWeights(base: Required<UtilityWeights>, override?: UtilityWeights): Required<UtilityWeights> {
  if (!override) return base
  return {
    fleeWeight:     override.fleeWeight     ?? base.fleeWeight,
    scheduleWeight: override.scheduleWeight ?? base.scheduleWeight,
    idleWeight:     override.idleWeight     ?? base.idleWeight,
    patrolWeight:   override.patrolWeight   ?? base.patrolWeight,
  }
}

function selectSchedule(def: NPCDef, currentHour: number): ScheduleEntry | null {
  const candidates = (def.schedule ?? []).filter(s => {
    if (s.trigger === 'time')  return isHourInRange(currentHour, s.timeStart ?? 0, s.timeEnd ?? 24)
    if (s.trigger === 'event') return hasEvent(s.event ?? '')
    return true  // 'always'
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return candidates[0]
}

function scoreAction(
  action: ActionId,
  inst: NPCInstance,
  dangerLevel: number,
  activeSchedule: ScheduleEntry | null,
): number {
  const role = inst.def.role ?? 'villager'
  const w = mergeWeights(ROLE_WEIGHTS[role], inst.def.utilityWeights)
  switch (action) {
    case 'flee':
      return dangerLevel > 0 ? dangerLevel * 30 * w.fleeWeight : -1
    case 'follow_schedule':
      return activeSchedule ? (100 - dangerLevel * 15) * w.scheduleWeight : -1
    case 'patrol':
      return inst.def.movement === 'patrol' ? 60 * w.patrolWeight : -1
    case 'idle':
      return 40 * w.idleWeight
  }
}

function selectAction(inst: NPCInstance, activeSchedule: ScheduleEntry | null): ActionId {
  const { dangerLevel } = getWorldState()
  const actions: ActionId[] = ['flee', 'follow_schedule', 'patrol', 'idle']
  let bestAction: ActionId = 'idle'
  let bestScore = -Infinity
  for (const action of actions) {
    const s = scoreAction(action, inst, dangerLevel, activeSchedule)
    if (s > bestScore) { bestScore = s; bestAction = action }
  }
  return bestAction
}

function resolveSpeechLines(inst: NPCInstance, activity: ActivityType | undefined): string[] | undefined {
  const lang = getLocale()
  const i18nEntry = lang !== 'ja' ? inst.def.i18n?.[lang] : undefined
  if (activity) {
    const localized = i18nEntry?.activitySpeeches?.[activity]
      ?? i18nEntry?.speechLines
      ?? inst.def.activitySpeeches?.[activity]
      ?? inst.def.speechLines
    return localized
  }
  return i18nEntry?.speechLines ?? inst.def.speechLines
}

function estimateTravelMs(fromX: number, fromY: number, toTileX: number, toTileY: number, speed: number): number {
  const dx = toTileX * TILE + TILE / 2 - fromX
  const dy = toTileY * TILE + TILE / 2 - fromY
  const dist = Math.sqrt(dx * dx + dy * dy)
  return speed > 0 ? (dist / speed) * 1000 : 0
}

function isCulled(sprite: Phaser.Physics.Arcade.Sprite, cam: Phaser.Cameras.Scene2D.Camera): boolean {
  return (
    sprite.x < cam.scrollX - CULL_MARGIN ||
    sprite.x > cam.scrollX + cam.width  + CULL_MARGIN ||
    sprite.y < cam.scrollY - CULL_MARGIN ||
    sprite.y > cam.scrollY + cam.height + CULL_MARGIN
  )
}

function timeSkipSchedule(inst: NPCInstance, currentHour: number, clockSpeedMs: number): void {
  const hoursPassed = (currentHour - inst.lastGameHour + 24) % 24
  if (hoursPassed === 0) return

  const schedule = selectSchedule(inst.def, currentHour)
  if (!schedule || schedule.waypoints.length === 0) {
    inst.activeScheduleId = null
    return
  }

  inst.activeScheduleId = schedule.id
  const speed = inst.def.patrolSpeed ?? 60
  let remainingMs = hoursPassed * clockSpeedMs

  while (remainingMs > 0) {
    const wp = schedule.waypoints[inst.waypointIndex]
    const travelMs = estimateTravelMs(inst.sprite.x, inst.sprite.y, wp.x, wp.y, speed)
    const totalMs = travelMs + (wp.waitMs ?? 0)
    if (remainingMs < totalMs) break
    remainingMs -= totalMs
    inst.waypointIndex = (inst.waypointIndex + 1) % schedule.waypoints.length
  }

  const target = schedule.waypoints[inst.waypointIndex]
  // 就寝中はhome位置へ
  if (target.activity === 'sleep' && inst.def.homeX != null && inst.def.homeY != null) {
    inst.sprite.setPosition(inst.def.homeX * TILE + TILE / 2, inst.def.homeY * TILE + TILE / 2)
  } else {
    inst.sprite.setPosition(target.x * TILE + TILE / 2, target.y * TILE + TILE / 2)
  }
}

// ─── ハンドル型 ──────────────────────────────────────────────────────────────

export type NPCManagerHandle = {
  loadFromSpawns: (spawns: NPCSpawn[], defs: NPCDef[]) => void
  loadActivitySpots: (spots: ActivitySpot[]) => void
  loadWallGrid: (grid: boolean[][]) => void
  update: (delta: number, playerX: number, playerY: number) => void
  tryInteract: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, maxDistance?: number) => boolean
  setupCollisions: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) => Phaser.Physics.Arcade.Collider[]
  getGameObjects: () => Phaser.GameObjects.GameObject[]
  destroy: () => void
}

// ─── ファクトリ ──────────────────────────────────────────────────────────────

export function createNPCManager(scene: Phaser.Scene, ui: DialogUI): NPCManagerHandle {
  const instances: NPCInstance[] = []
  let activitySpots: ActivitySpot[] = []
  let _clockSpeedMs = 180000
  let _wallGrid: boolean[][] = []   // true = 壁（通行不可）

  // WorldState・GameClock の変化で全インスタンス即時再評価
  const unsubWorld = onWorldStateChange(() => {
    instances.forEach(inst => { inst.actionEvalTimer = 0 })
  })
  const unsubClock = onHourChange(() => {
    instances.forEach(inst => { inst.actionEvalTimer = 0 })
  })

  // ─── ActivitySpot 解決 ───────────────────────────────────────────────────

  function resolveSpotPosition(wp: WaypointDef, role: NPCRole): { x: number; y: number } | null {
    if (!wp.spotId) return null
    const spot = activitySpots.find(s => s.id === wp.spotId)
    if (!spot) {
      console.warn(`[NPCManager] ActivitySpot not found: ${wp.spotId}`)
      return null
    }
    if (spot.roleFilter && spot.roleFilter.length > 0 && !spot.roleFilter.includes(role)) {
      console.warn(`[NPCManager] Role '${role}' cannot use spot '${wp.spotId}'`)
      return null
    }
    return { x: spot.x, y: spot.y }
  }

  function getWaypointWorldPos(wp: WaypointDef, role: NPCRole): { x: number; y: number } {
    const spotPos = resolveSpotPosition(wp, role)
    if (spotPos) return spotPos
    return { x: wp.x, y: wp.y }
  }

  // ─── ライフサイクル ──────────────────────────────────────────────────────

  function destroyAll(): void {
    instances.forEach(inst => {
      inst.speech.destroy()
      if (inst.sprite.active) inst.sprite.destroy()
    })
    instances.length = 0
  }

  function loadActivitySpots(spots: ActivitySpot[]): void {
    activitySpots = spots
  }

  function loadWallGrid(grid: boolean[][]): void {
    _wallGrid = grid
  }

  function loadFromSpawns(spawns: NPCSpawn[], defs: NPCDef[]): void {
    destroyAll()
    const defMap = new Map(defs.map(d => [d.id, d]))
    const currentHour = getGameClock().hour

    spawns.forEach(spawn => {
      const def = defMap.get(spawn.npcDefId)
      if (!def) {
        console.warn(`[NPCManager] NPC def not found: ${spawn.npcDefId}`)
        return
      }

      const x = spawn.x * TILE + TILE / 2
      const y = spawn.y * TILE + TILE / 2

      const sprite = scene.physics.add.sprite(x, y, def.spriteKey)
      sprite.setImmovable(true)
      sprite.setDepth(2)
      ;(sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false

      if (def.directionAnims) {
        // 4方向アニメ（1024×256形式）
        const prefix = `npc_anim_${def.id}`
        createNPCDirectionalAnimations(scene, prefix, def.spriteKey)
        sprite.play(`${prefix}-idle-down`)
      } else if (def.animated) {
        // 旧来の単方向アニメ
        const animKey = `npc_anim_${def.id}`
        if (!scene.anims.exists(animKey)) {
          const frames = scene.anims.generateFrameNumbers(def.spriteKey, {
            start: 0,
            end: (def.frameCount ?? 4) - 1,
          }).filter(f => f !== undefined)
          if (frames.length > 0) {
            scene.anims.create({
              key: animKey,
              frames,
              frameRate: def.frameRate ?? 6,
              repeat: -1,
            })
          }
        }
        if (scene.anims.exists(animKey)) {
          sprite.play(animKey)
        }
      }

      const speech = new EnemySpeech(scene)
      const { speechLines } = resolveText({ speechLines: def.speechLines }, def.i18n)
      if (speechLines && speechLines.length > 0) {
        speech.startLoop(
          sprite as unknown as Phaser.GameObjects.Sprite,
          speechLines,
          2000,
          def.speechIntervalMs ?? 5000
        )
      }

      const initialSchedule = def.movement === 'scheduled'
        ? selectSchedule(def, currentHour)
        : null

      const inst: NPCInstance = {
        sprite,
        def,
        speech,
        patrolStartX: x,
        patrolDir: 1,
        currentAction: def.movement === 'patrol' ? 'patrol' : 'idle',
        activeScheduleId: initialSchedule?.id ?? null,
        waypointIndex: 0,
        waypointWaitTimer: 0,
        actionEvalTimer: 0,
        lastGameHour: currentHour,
        currentPath: [],
        facing: 'down',
        hostile: false,
        attackTimer: 0,
      }
      instances.push(inst)
    })
  }

  // ─── update ──────────────────────────────────────────────────────────────

  function update(delta: number, playerX: number, playerY: number): void {
    const cam = scene.cameras.main
    const currentHour = getGameClock().hour

    // プレイヤーがいずれかの敵対NPC検知圏内にいるか（WantedSystem減衰判定用）
    let playerDetected = false

    instances.forEach(inst => {
      if (!inst.sprite.active) return

      // カリング判定
      const culled = isCulled(inst.sprite, cam)
      if (culled) {
        inst.sprite.setVelocity(0, 0)
        if (inst.lastGameHour !== currentHour) {
          timeSkipSchedule(inst, currentHour, _clockSpeedMs)
          inst.lastGameHour = currentHour
        }
        return
      }

      // カリング復帰時のタイムスキップ
      if (inst.lastGameHour !== currentHour && inst.def.movement === 'scheduled') {
        timeSkipSchedule(inst, currentHour, _clockSpeedMs)
      }
      inst.lastGameHour = currentHour

      // 攻撃クールダウン更新
      if (inst.attackTimer > 0) inst.attackTimer -= delta

      // ─── 敵対モード判定 ──────────────────────────────────────────
      if (inst.def.canBeHostile) {
        const detRange = inst.def.detectionRange ?? 200
        const distToPlayer = Phaser.Math.Distance.Between(
          inst.sprite.x, inst.sprite.y, playerX, playerY
        )
        const inRange = distToPlayer <= detRange

        // 手配度が閾値以上ならプレイヤー検知で敵対化
        if (isHostile() && inRange) {
          inst.hostile = true
          playerDetected = true
        } else if (!isHostile()) {
          // 手配度が下がったら NPC モードに復帰
          inst.hostile = false
          inst.currentPath = []
        }

        if (inst.hostile) {
          executeHostileAction(inst, delta, playerX, playerY)
          inst.speech.update(inst.sprite as unknown as Phaser.GameObjects.Sprite)
          return
        }
      }
      // ─────────────────────────────────────────────────────────────

      // 通常 AI 再評価
      inst.actionEvalTimer -= delta
      if (inst.actionEvalTimer <= 0) {
        inst.actionEvalTimer = ACTION_EVAL_INTERVAL
        const schedule = inst.def.movement === 'scheduled'
          ? selectSchedule(inst.def, currentHour)
          : null
        inst.activeScheduleId = schedule?.id ?? null
        inst.currentAction = selectAction(inst, schedule)
      }

      // 通常アクション実行
      executeAction(inst, delta, playerX, playerY, currentHour)
      inst.speech.update(inst.sprite as unknown as Phaser.GameObjects.Sprite)
    })

    // WantedSystem に検知状態を通知（減衰制御）
    updateWanted(delta, playerDetected)
  }

  function executeAction(
    inst: NPCInstance,
    delta: number,
    playerX: number,
    playerY: number,
    currentHour: number,
  ): void {
    switch (inst.currentAction) {
      case 'flee':
        executeFleeAction(inst, playerX, playerY)
        break
      case 'follow_schedule':
        executeScheduleAction(inst, delta, currentHour)
        break
      case 'patrol':
        executePatrolAction(inst)
        break
      case 'idle':
      default:
        applyMove(inst, 0, 0)
        break
    }
  }

  // 速度をセットし、方向アニメを更新する共通ヘルパー
  function applyMove(inst: NPCInstance, vx: number, vy: number): void {
    inst.sprite.setVelocity(vx, vy)
    if (!inst.def.directionAnims) {
      inst.sprite.setFlipX(vx < 0)
      return
    }
    const prefix = `npc_anim_${inst.def.id}`
    const moving = Math.abs(vx) > 1 || Math.abs(vy) > 1
    if (moving) {
      const dir = getDirectionFromVelocity(vx, vy)
      if (dir !== inst.facing || !inst.sprite.anims.currentAnim?.key.endsWith(`-walk-${dir}`)) {
        inst.facing = dir
        inst.sprite.play(`${prefix}-walk-${dir}`, true)
      }
    } else {
      const idleKey = `${prefix}-idle-${inst.facing}`
      if (inst.sprite.anims.currentAnim?.key !== idleKey) {
        inst.sprite.play(idleKey, true)
      }
    }
  }

  function executeHostileAction(inst: NPCInstance, delta: number, playerX: number, playerY: number): void {
    const atkRange = inst.def.attackRange ?? 60
    const detRange = inst.def.detectionRange ?? 200
    const speed = (inst.def.patrolSpeed ?? 60) * 1.4
    const dx = playerX - inst.sprite.x
    const dy = playerY - inst.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist <= atkRange) {
      // 攻撃圏内 → 停止して攻撃
      applyMove(inst, 0, 0)
      if (inst.attackTimer <= 0) {
        inst.attackTimer = inst.def.attackCooldown ?? 1500
        // ダメージイベント発火（MainScene が受け取る）
        scene.events.emit('npc:attack', {
          damage: inst.def.attackDamage ?? 15,
          npcId: inst.def.id,
        })
      }
    } else if (dist <= detRange) {
      // 検知圏内 → 追跡
      applyMove(inst, (dx / dist) * speed, (dy / dist) * speed)
    } else {
      // 圏外 → 停止（手配度が高ければここには来ない想定だが念のため）
      applyMove(inst, 0, 0)
    }

    void delta  // unused but kept for signature consistency
  }

  function executeFleeAction(inst: NPCInstance, playerX: number, playerY: number): void {
    const dx = inst.sprite.x - playerX
    const dy = inst.sprite.y - playerY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) { applyMove(inst, 0, 0); return }
    const speed = (inst.def.patrolSpeed ?? 60) * 1.5
    applyMove(inst, (dx / len) * speed, (dy / len) * speed)
  }

  function executeScheduleAction(inst: NPCInstance, delta: number, _currentHour: number): void {
    const schedule = inst.def.schedule?.find(s => s.id === inst.activeScheduleId)
    if (!schedule || schedule.waypoints.length === 0) {
      applyMove(inst, 0, 0)
      return
    }

    const role = inst.def.role ?? 'villager'
    const wp = schedule.waypoints[inst.waypointIndex]
    const tilePos = getWaypointWorldPos(wp, role)
    const targetTX = tilePos.x
    const targetTY = tilePos.y
    const targetX = targetTX * TILE + TILE / 2
    const targetY = targetTY * TILE + TILE / 2

    const dx = targetX - inst.sprite.x
    const dy = targetY - inst.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > ARRIVE_THRESHOLD) {
      const speed = inst.def.patrolSpeed ?? 60

      // A* 経路がなければ計算
      if (inst.currentPath.length === 0 && _wallGrid.length > 0) {
        const startTX = Math.floor(inst.sprite.x / TILE)
        const startTY = Math.floor(inst.sprite.y / TILE)
        inst.currentPath = findPath(_wallGrid, startTX, startTY, targetTX, targetTY)
      }

      if (inst.currentPath.length > 0) {
        // 次の経路ノードへ移動
        const next = inst.currentPath[0]
        const nx = next.x * TILE + TILE / 2
        const ny = next.y * TILE + TILE / 2
        const ndx = nx - inst.sprite.x
        const ndy = ny - inst.sprite.y
        const ndist = Math.sqrt(ndx * ndx + ndy * ndy)
        if (ndist < ARRIVE_THRESHOLD) {
          inst.currentPath.shift()  // ノード到達 → 次へ
        } else {
          applyMove(inst, (ndx / ndist) * speed, (ndy / ndist) * speed)
        }
      } else {
        // グリッドなし or 経路なし → 直進フォールバック
        applyMove(inst, (dx / dist) * speed, (dy / dist) * speed)
      }
    } else {
      // ウェイポイント到達
      inst.currentPath = []
      applyMove(inst, 0, 0)

      if (inst.waypointWaitTimer === 0 && wp.speech) {
        inst.speech.show(inst.sprite as unknown as Phaser.GameObjects.Sprite, wp.speech, 2000)
      }

      const waitMs = wp.waitMs ?? 0
      if (waitMs > 0) {
        if (inst.waypointWaitTimer === 0) {
          inst.waypointWaitTimer = waitMs
          switchActivitySpeech(inst, wp)
        } else {
          inst.waypointWaitTimer -= delta
          if (inst.waypointWaitTimer <= 0) {
            inst.waypointWaitTimer = 0
            advanceWaypoint(inst, schedule)
          }
        }
      } else {
        advanceWaypoint(inst, schedule)
      }
    }
  }

  function advanceWaypoint(inst: NPCInstance, schedule: ScheduleEntry): void {
    inst.waypointIndex = (inst.waypointIndex + 1) % schedule.waypoints.length
    inst.waypointWaitTimer = 0
    // 周回完了で即再評価
    if (inst.waypointIndex === 0) inst.actionEvalTimer = 0
    // 次のウェイポイントのセリフに切り替え
    switchActivitySpeech(inst, schedule.waypoints[inst.waypointIndex])
  }

  function switchActivitySpeech(inst: NPCInstance, wp: WaypointDef): void {
    // 優先順位: wp.speechLines > activitySpeeches[activity] > def.speechLines
    const lines = wp.speechLines
      ?? resolveSpeechLines(inst, wp.activity)
    if (lines && lines.length > 0) {
      inst.speech.stopLoop()
      inst.speech.startLoop(
        inst.sprite as unknown as Phaser.GameObjects.Sprite,
        lines,
        2000,
        inst.def.speechIntervalMs ?? 5000
      )
    }
  }

  function executePatrolAction(inst: NPCInstance): void {
    const speed = inst.def.patrolSpeed ?? 60
    const rangePx = (inst.def.patrolRange ?? 3) * TILE
    const dist = inst.sprite.x - inst.patrolStartX

    if (dist >= rangePx) inst.patrolDir = -1
    else if (dist <= -rangePx) inst.patrolDir = 1

    applyMove(inst, speed * inst.patrolDir, 0)
  }

  // ─── 操作 ────────────────────────────────────────────────────────────────

  function tryInteract(
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    maxDistance = 80,
  ): boolean {
    for (const inst of instances) {
      const dist = Phaser.Math.Distance.Between(
        player.x, player.y, inst.sprite.x, inst.sprite.y
      )
      if (dist < maxDistance) {
        const { dialogLines } = resolveText({ dialogLines: inst.def.dialogLines }, inst.def.i18n)
        if (dialogLines && dialogLines.length > 0) {
          const data: DialogData = { lines: dialogLines as DialogLine[] }
          ui.show(inst.def.name, data)
          return true
        }
      }
    }
    return false
  }

  function setupCollisions(
    player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  ): Phaser.Physics.Arcade.Collider[] {
    return instances.map(inst => scene.physics.add.collider(player, inst.sprite))
  }

  function getGameObjects(): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = []
    instances.forEach(inst => {
      objects.push(inst.sprite)
      objects.push(inst.speech.getContainer())
    })
    return objects
  }

  function destroy(): void {
    unsubWorld()
    unsubClock()
    destroyAll()
  }

  return { loadFromSpawns, loadActivitySpots, loadWallGrid, update, tryInteract, setupCollisions, getGameObjects, destroy }
}
