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
import { resolveText } from '../utils/LocaleManager'

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
  // 新規: AI 状態
  currentAction: ActionId
  activeScheduleId: string | null
  waypointIndex: number
  waypointWaitTimer: number
  actionEvalTimer: number
  lastGameHour: number
  currentPath: { x: number; y: number }[]  // Phase2 A* 用（常に空）
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
  if (!activity) return inst.def.speechLines
  return inst.def.activitySpeeches?.[activity] ?? inst.def.speechLines
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
  update: (delta: number, playerX: number, playerY: number) => void
  tryInteract: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, maxDistance?: number) => boolean
  setupCollisions: (player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) => Phaser.Physics.Arcade.Collider[]
  destroy: () => void
}

// ─── ファクトリ ──────────────────────────────────────────────────────────────

export function createNPCManager(scene: Phaser.Scene, ui: DialogUI): NPCManagerHandle {
  const instances: NPCInstance[] = []
  let activitySpots: ActivitySpot[] = []
  let _clockSpeedMs = 180000  // GameClock の realMsPerGameHour と同期（デフォルト）

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

      if (def.animated) {
        const animKey = `npc_anim_${def.id}`
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(def.spriteKey, {
              start: 0,
              end: (def.frameCount ?? 4) - 1,
            }),
            frameRate: def.frameRate ?? 6,
            repeat: -1,
          })
        }
        sprite.play(animKey)
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
      }
      instances.push(inst)
    })
  }

  // ─── update ──────────────────────────────────────────────────────────────

  function update(delta: number, playerX: number, playerY: number): void {
    const cam = scene.cameras.main
    const currentHour = getGameClock().hour

    instances.forEach(inst => {
      if (!inst.sprite.active) return

      // カリング判定
      const culled = isCulled(inst.sprite, cam)
      if (culled) {
        inst.sprite.setVelocity(0, 0)
        // lastGameHour を記録して次回復帰時にタイムスキップ
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

      // AI 再評価
      inst.actionEvalTimer -= delta
      if (inst.actionEvalTimer <= 0) {
        inst.actionEvalTimer = ACTION_EVAL_INTERVAL
        const schedule = inst.def.movement === 'scheduled'
          ? selectSchedule(inst.def, currentHour)
          : null
        inst.activeScheduleId = schedule?.id ?? null
        inst.currentAction = selectAction(inst, schedule)
      }

      // アクション実行
      executeAction(inst, delta, playerX, playerY, currentHour)

      // 吹き出し更新
      inst.speech.update(inst.sprite as unknown as Phaser.GameObjects.Sprite)
    })
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
        inst.sprite.setVelocity(0, 0)
        break
    }
  }

  function executeFleeAction(inst: NPCInstance, playerX: number, playerY: number): void {
    const dx = inst.sprite.x - playerX
    const dy = inst.sprite.y - playerY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) { inst.sprite.setVelocity(0, 0); return }
    const speed = (inst.def.patrolSpeed ?? 60) * 1.5
    inst.sprite.setVelocity((dx / len) * speed, (dy / len) * speed)
    inst.sprite.setFlipX(dx < 0)
  }

  function executeScheduleAction(inst: NPCInstance, delta: number, currentHour: number): void {
    const schedule = inst.def.schedule?.find(s => s.id === inst.activeScheduleId)
    if (!schedule || schedule.waypoints.length === 0) {
      inst.sprite.setVelocity(0, 0)
      return
    }

    const role = inst.def.role ?? 'villager'
    const wp = schedule.waypoints[inst.waypointIndex]
    const tilePos = getWaypointWorldPos(wp, role)
    const targetX = tilePos.x * TILE + TILE / 2
    const targetY = tilePos.y * TILE + TILE / 2

    const dx = targetX - inst.sprite.x
    const dy = targetY - inst.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > ARRIVE_THRESHOLD) {
      // 目標へ移動
      const speed = inst.def.patrolSpeed ?? 60
      inst.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed)
      inst.sprite.setFlipX(dx < 0)
    } else {
      // 到達
      inst.sprite.setVelocity(0, 0)

      // 到着セリフ（一度だけ、waitTimerが初期値のとき）
      if (inst.waypointWaitTimer === 0 && wp.speech) {
        inst.speech.show(
          inst.sprite as unknown as Phaser.GameObjects.Sprite,
          wp.speech,
          2000
        )
      }

      const waitMs = wp.waitMs ?? 0
      if (waitMs > 0) {
        if (inst.waypointWaitTimer === 0) {
          // 待機開始: 活動別セリフに切り替える
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

    inst.sprite.setVelocityX(speed * inst.patrolDir)
    inst.sprite.setFlipX(inst.patrolDir < 0)
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

  function destroy(): void {
    unsubWorld()
    unsubClock()
    destroyAll()
  }

  return { loadFromSpawns, loadActivitySpots, update, tryInteract, setupCollisions, destroy }
}
