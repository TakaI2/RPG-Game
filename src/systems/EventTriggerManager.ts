import Phaser from 'phaser'
import { GameStateManager } from './GameStateManager'
import type { ThenAction } from '../types/GameFlowTypes'

/**
 * イベントトリガーの型定義
 */
export type EventTrigger = {
  x: number // タイル座標X
  y: number // タイル座標Y
  type: 'story' | 'teleport' // トリガーの種類

  // story用（ストーリーイベントを発火）
  storyId?: string // ストーリーファイルのID

  // teleport用（マップ間移動）
  targetMap?: string // 移動先マップID
  targetX?: number // 移動先タイルX座標
  targetY?: number // 移動先タイルY座標

  once: boolean // 一度だけ発火するか
  marker?: boolean // 視覚的マーカー表示
  markerColor?: string // マーカーの色（デフォルト: story=黄、teleport=緑）
  then?: ThenAction // story型トリガーの後続アクション
}

/**
 * トリガー結果の型定義
 */
export type TriggerResult = {
  type: 'story' | 'teleport'
  storyId?: string
  targetMap?: string
  targetX?: number
  targetY?: number
  then?: ThenAction
}

/**
 * イベントトリガー管理システム
 * - マップ上の特定座標でストーリーイベントを発火
 * - 一度きりイベントはGameStateManagerで永続管理
 * - 視覚的マーカー表示
 */
export class EventTriggerManager {
  private scene: Phaser.Scene
  private triggers: EventTrigger[]
  private markers: Map<string, Phaser.GameObjects.Sprite>
  private tileSize: number
  private mapId: string

  constructor(scene: Phaser.Scene, triggers: EventTrigger[], tileSize: number, mapId: string) {
    this.scene = scene
    this.triggers = triggers
    this.tileSize = tileSize
    this.mapId = mapId
    this.markers = new Map()

    // マーカーを表示
    this.createMarkers()
  }

  /**
   * 視覚的マーカーを作成
   */
  private createMarkers() {
    this.triggers.forEach((trigger, index) => {
      const gsKey = `${this.mapId}:${trigger.x}:${trigger.y}`
      if (trigger.marker && !GameStateManager.isTriggerFired(gsKey)) {
        const key = `event_marker_${this.mapId}_${index}`
        const x = trigger.x * this.tileSize
        const y = trigger.y * this.tileSize

        console.log(`[EventTrigger] Creating ${trigger.type} marker at tile(${trigger.x}, ${trigger.y}) -> world(${x}, ${y})`)

        let color = 0xffff00
        if (trigger.markerColor === 'green' || trigger.type === 'teleport') {
          color = 0x00ff00
        } else if (trigger.markerColor === 'yellow' || trigger.type === 'story') {
          color = 0xffff00
        } else if (trigger.markerColor === 'blue') {
          color = 0x0099ff
        } else if (trigger.markerColor === 'red') {
          color = 0xff0000
        }

        const graphics = this.scene.make.graphics({ x: 0, y: 0 })
        graphics.fillStyle(color, 0.5)
        graphics.fillCircle(32, 32, 20)
        graphics.generateTexture(key, 64, 64)
        graphics.destroy()

        const marker = this.scene.add.sprite(x, y, key)
        marker.setOrigin(0.5, 0.5)
        marker.setDepth(5)

        this.scene.tweens.add({
          targets: marker,
          alpha: 0.3,
          scale: 1.2,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })

        this.markers.set(key, marker)
      }
    })
  }

  /**
   * プレイヤーの位置をチェックしてイベントを発火
   */
  checkTrigger(playerX: number, playerY: number, tileSize: number): TriggerResult | null {
    const playerTileX = Math.floor(playerX / tileSize)
    const playerTileY = Math.floor(playerY / tileSize)

    for (let i = 0; i < this.triggers.length; i++) {
      const trigger = this.triggers[i]
      const gsKey = `${this.mapId}:${trigger.x}:${trigger.y}`

      // once フラグ: GameStateManager で永続管理
      if (trigger.once && GameStateManager.isTriggerFired(gsKey)) {
        continue
      }

      if (trigger.x === playerTileX && trigger.y === playerTileY) {
        console.log(`[EventTrigger] Triggered ${trigger.type} event at (${playerTileX}, ${playerTileY})`)

        if (trigger.once) {
          GameStateManager.markTriggerFired(gsKey)

          // マーカーを削除
          if (trigger.marker) {
            const key = `event_marker_${this.mapId}_${i}`
            const marker = this.markers.get(key)
            if (marker) {
              marker.destroy()
              this.markers.delete(key)
            }
          }
        }

        return {
          type: trigger.type,
          storyId: trigger.storyId,
          targetMap: trigger.targetMap,
          targetX: trigger.targetX,
          targetY: trigger.targetY,
          then: trigger.then
        }
      }
    }

    return null
  }

  /**
   * すべてのマーカーを破棄
   */
  destroy() {
    this.markers.forEach(marker => marker.destroy())
    this.markers.clear()
  }
}
