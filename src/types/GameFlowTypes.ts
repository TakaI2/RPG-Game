export type ThenAction =
  | { action: 'stay' }
  | { action: 'exit' }
  | { action: 'goto_map'; mapId: string; x: number; y: number }

export type StoryThenConfig = {
  story: string | null
  then: ThenAction
}

export type GameFlowEventTrigger = {
  x: number
  y: number
  type: 'story' | 'teleport'
  storyId?: string
  once: boolean
  marker?: boolean
  markerColor?: string
  then?: ThenAction
  targetMap?: string
  targetX?: number
  targetY?: number
}

export type MapFlowConfig = {
  onEnter: string | null
  hasBoss: boolean
  onPlayerDefeat: StoryThenConfig
  onBossDefeat?: StoryThenConfig
  eventTriggers: GameFlowEventTrigger[]
}

export type GameFlowConfig = {
  start: StoryThenConfig
  maps: Record<string, MapFlowConfig>
}
