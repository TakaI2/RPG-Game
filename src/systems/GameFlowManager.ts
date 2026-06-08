import Phaser from 'phaser'
import type { GameFlowConfig, MapFlowConfig, StoryThenConfig, GameFlowEventTrigger, PortalDestination, ChapterDef } from '../types/GameFlowTypes'

export class GameFlowManager {
  private config: GameFlowConfig
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    const data = scene.cache.json.get('gameflow') as GameFlowConfig | undefined
    if (!data) {
      throw new Error('[GameFlowManager] gameflow.json not found in cache')
    }
    this.config = data
  }

  /**
   * ゲーム開始時の設定を返す。
   * ChapterLoadingScene が registry に pendingChapterStart を設定している場合はそれを優先する。
   */
  getStartConfig(): StoryThenConfig {
    const pending = this.scene.game.registry.get('pendingChapterStart') as StoryThenConfig | undefined
    if (pending) {
      this.scene.game.registry.remove('pendingChapterStart')
      return pending
    }
    return this.config.chapters[0].start
  }

  getChapters(): ChapterDef[] {
    return this.config.chapters ?? []
  }

  getChapter(id: string): ChapterDef | undefined {
    return this.config.chapters?.find(c => c.id === id)
  }

  getMapConfig(mapId: string): MapFlowConfig | undefined {
    return this.config.maps[mapId]
  }

  getEventTriggers(mapId: string): GameFlowEventTrigger[] {
    return this.config.maps[mapId]?.eventTriggers ?? []
  }

  getPortals(mapId: string): PortalDestination[] {
    return this.config.maps[mapId]?.portals ?? []
  }

  getLoadingImages(): string[] {
    return this.config.assets?.loadingImages ?? []
  }

  getClockSpeed(): number {
    return this.config.assets?.clockSpeed ?? 180000
  }
}
