export type GameFlowBgmAsset = {
  key: string
  url: string
}

export type GameFlowAssets = {
  bgm: GameFlowBgmAsset[]
  loadingImages?: string[]   // assets/images/loading_images/ 内のファイル名リスト
  clockSpeed?: number        // 実ms / ゲーム1時間（デフォルト: 180000）
}

export type ThenAction =
  | { action: 'stay' }
  | { action: 'exit' }
  | { action: 'goto_map'; mapId: string; x: number; y: number }
  | { action: 'goto_chapter'; chapterId: string }

export type StoryThenConfig = {
  story: string | null
  then: ThenAction
}

export type ChapterDef = {
  id: string
  label?: string
  start: StoryThenConfig
  stories?: string[]   // このチャプターで事前ロードするストーリーIDリスト
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
  onEnter: StoryThenConfig | null
  boss?: BossMapConfig | null
  onPlayerDefeat: StoryThenConfig
  onBossDefeat?: StoryThenConfig
  eventTriggers: GameFlowEventTrigger[]
  portals?: PortalDestination[]
}

export type GameFlowConfig = {
  assets?: GameFlowAssets
  chapters: ChapterDef[]
  maps: Record<string, MapFlowConfig>
}
