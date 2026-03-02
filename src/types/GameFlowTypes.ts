export type GameFlowBgmAsset = {
  key: string
  url: string
}

export type GameFlowAssets = {
  bgm: GameFlowBgmAsset[]
}

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
  type: 'story'
  storyId?: string
  once: boolean
  marker?: boolean
  markerColor?: string
  then?: ThenAction
}

export type PortalDestination = {
  targetMap: string
  targetX: number
  targetY: number
}

export type BossMapConfig = {
  configKey: string
  x: number
  y: number
}

export type MapFlowConfig = {
  bgm?: string
  onEnter: string | null
  boss?: BossMapConfig | null
  onPlayerDefeat: StoryThenConfig
  onBossDefeat?: StoryThenConfig
  eventTriggers: GameFlowEventTrigger[]
  portals?: PortalDestination[]
}

export type GameFlowConfig = {
  assets?: GameFlowAssets
  start: StoryThenConfig
  maps: Record<string, MapFlowConfig>
}
