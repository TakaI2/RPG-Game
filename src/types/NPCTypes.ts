export interface NPCDef {
  id: string
  name: string
  spriteKey: string
  animated: boolean
  frameCount?: number       // default 4
  frameRate?: number        // default 6
  movement: 'fixed' | 'patrol'
  patrolSpeed?: number      // px/s, default 60
  patrolRange?: number      // tiles, default 3
  speechLines?: string[]
  speechIntervalMs?: number // default 5000
  dialogLines?: string[]
  i18n?: Record<string, { speechLines?: string[]; dialogLines?: string[] }>
}

export interface NPCSpawn {
  x: number
  y: number
  npcDefId: string
}
