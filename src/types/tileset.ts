export type TileRole = 'floor' | 'wall'
export type TileLayer = 'floor' | 'object' | 'overlay'

export interface TileDef {
  id: number
  role: TileRole
  textureKey: string
  label: string
  color: string
  animated?: boolean
  fps?: number
  layer?: TileLayer  // 描画レイヤーのヒント（省略時は role に準じる）
}

export interface EnemySpawn {
  x: number
  y: number
  enemyDefId?: string
}

export interface Portal {
  x: number
  y: number
  spriteKey?: string
  targetMap?: string
  targetX?: number
  targetY?: number
}

export interface MapData {
  cols: number
  rows: number
  tiles: number[][]
  objectLayer?: number[][]
  overlayLayer?: number[][]
  enemySpawns?: EnemySpawn[]
  portals?: Portal[]
  activitySpots?: import('./NPCTypes').ActivitySpot[]
}
