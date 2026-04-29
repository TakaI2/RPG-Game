export type DialogLine = string | { name: string; text: string }

export type NPCRole = 'villager' | 'guard' | 'merchant' | 'elder' | 'innkeeper'

export type ActivityType =
  | 'idle'
  | 'walk'
  | 'work'
  | 'eat'
  | 'sleep'
  | 'rest'
  | 'watch'
  | 'chat'
  | 'pray'
  | 'flee'

export type ActionId = 'follow_schedule' | 'patrol' | 'idle' | 'flee'

export interface ActivitySpot {
  id: string
  type: ActivityType
  x: number
  y: number
  label?: string
  roleFilter?: NPCRole[]
}

export interface WaypointDef {
  x: number
  y: number
  spotId?: string        // ActivitySpot.id への参照（UI補助用）
  waitMs?: number
  activity?: ActivityType
  speech?: string        // 到着時の一言（一度だけ）
  speechLines?: string[] // 待機中ループセリフ（activitySpeeches より優先）
}

export interface ScheduleEntry {
  id: string
  trigger: 'always' | 'time' | 'event'
  timeStart?: number     // 0-23（含む）、trigger='time' のとき有効
  timeEnd?: number       // 0-23（exclusive）、深夜またぎ対応
  event?: string         // trigger='event' のとき参照するイベント名
  priority?: number      // 高いほど優先（デフォルト 0）
  waypoints: WaypointDef[]
}

export interface UtilityWeights {
  fleeWeight?: number
  scheduleWeight?: number
  idleWeight?: number
  patrolWeight?: number
}

export interface NPCDef {
  id: string
  name: string
  spriteKey: string
  animated: boolean
  frameCount?: number
  frameRate?: number
  movement: 'fixed' | 'patrol' | 'scheduled'
  patrolSpeed?: number
  patrolRange?: number
  speechLines?: string[]
  speechIntervalMs?: number
  dialogLines?: DialogLine[]
  i18n?: Record<string, { speechLines?: string[]; dialogLines?: DialogLine[] }>
  role?: NPCRole
  homeX?: number
  homeY?: number
  schedule?: ScheduleEntry[]
  utilityWeights?: UtilityWeights
  activitySpeeches?: Partial<Record<ActivityType, string[]>>
}

export interface NPCSpawn {
  x: number
  y: number
  npcDefId: string
}
