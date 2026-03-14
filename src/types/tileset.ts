export type TileRole = 'floor' | 'wall'

export interface TileDef {
  id: number
  role: TileRole
  textureKey: string
  label: string
  color: string
  animated?: boolean
  fps?: number
}

export interface EnemySpawn {
  x: number
  y: number
  enemyDefId?: string
}

export interface Portal {
  x: number
  y: number
  targetMap?: string
  targetX?: number
  targetY?: number
}

export interface MapData {
  cols: number
  rows: number
  tiles: number[][]
  enemySpawns?: EnemySpawn[]
  portals?: Portal[]
}
