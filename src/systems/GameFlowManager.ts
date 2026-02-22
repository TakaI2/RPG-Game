import Phaser from 'phaser'
import type { GameFlowConfig, MapFlowConfig, StoryThenConfig, GameFlowEventTrigger } from '../types/GameFlowTypes'

export class GameFlowManager {
  private config: GameFlowConfig

  constructor(scene: Phaser.Scene) {
    const data = scene.cache.json.get('gameflow') as GameFlowConfig | undefined
    if (!data) {
      throw new Error('[GameFlowManager] gameflow.json not found in cache')
    }
    this.config = data
  }

  getStartConfig(): StoryThenConfig {
    return this.config.start
  }

  getMapConfig(mapId: string): MapFlowConfig | undefined {
    return this.config.maps[mapId]
  }

  getEventTriggers(mapId: string): GameFlowEventTrigger[] {
    return this.config.maps[mapId]?.eventTriggers ?? []
  }
}
