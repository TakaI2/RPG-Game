import Phaser from 'phaser'
import { events } from './Events'

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
  triggered?: boolean // 発火済みフラグ
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
}

/**
 * イベントトリガー管理システム
 * - マップ上の特定座標でストーリーイベントを発火
 * - 一度きりイベントの管理
 * - 視覚的マーカー表示
 */
export class EventTriggerManager {
  private scene: Phaser.Scene
  private triggers: EventTrigger[]
  private markers: Map<string, Phaser.GameObjects.Sprite>
  private tileSize: number

  constructor(scene: Phaser.Scene, triggers: EventTrigger[], tileSize: number) {
    this.scene = scene
    this.triggers = triggers
    this.tileSize = tileSize
    this.markers = new Map()

    // 発火済みフラグを初期化
    this.triggers.forEach(trigger => {
      trigger.triggered = false
    })

    // マーカーを表示
    this.createMarkers()
  }

  /**
   * 視覚的マーカーを作成
   */
  private createMarkers() {
    this.triggers.forEach((trigger, index) => {
      if (trigger.marker && !trigger.triggered) {
        // マーカーのグラフィックを作成（光るエフェクト）
        const key = `event_marker_${index}`
        // タイル座標をワールド座標（ピクセル）に変換
        const x = trigger.x * this.tileSize
        const y = trigger.y * this.tileSize

        console.log(`[EventTrigger] Creating ${trigger.type} marker at tile(${trigger.x}, ${trigger.y}) -> world(${x}, ${y})`)

        // マーカーの色を決定
        let color = 0xffff00 // デフォルト: 黄色
        if (trigger.markerColor === 'green' || trigger.type === 'teleport') {
          color = 0x00ff00 // 緑
        } else if (trigger.markerColor === 'yellow' || trigger.type === 'story') {
          color = 0xffff00 // 黄色
        } else if (trigger.markerColor === 'blue') {
          color = 0x0099ff // 青
        } else if (trigger.markerColor === 'red') {
          color = 0xff0000 // 赤
        }

        // 円形のマーカーを作成
        const graphics = this.scene.make.graphics({ x: 0, y: 0 })
        graphics.fillStyle(color, 0.5) // 半透明
        graphics.fillCircle(32, 32, 20) // 中心に円を描画
        graphics.generateTexture(key, 64, 64)
        graphics.destroy()

        // スプライトとして配置
        const marker = this.scene.add.sprite(x, y, key)
        marker.setOrigin(0.5, 0.5)
        marker.setDepth(5) // 地面の上、キャラクターの下

        // 光るアニメーション
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
   * @param playerX プレイヤーのワールド座標X
   * @param playerY プレイヤーのワールド座標Y
   * @param tileSize タイルサイズ
   * @returns 発火したイベント情報（なければnull）
   */
  checkTrigger(playerX: number, playerY: number, tileSize: number): TriggerResult | null {
    // プレイヤーの中心座標からタイル座標を計算
    const playerTileX = Math.floor(playerX / tileSize)
    const playerTileY = Math.floor(playerY / tileSize)

    for (let i = 0; i < this.triggers.length; i++) {
      const trigger = this.triggers[i]

      // 既に発火済みでonceフラグがtrueなら無視
      if (trigger.triggered && trigger.once) {
        continue
      }

      // タイル座標が一致するかチェック
      if (trigger.x === playerTileX && trigger.y === playerTileY) {
        console.log(`[EventTrigger] Triggered ${trigger.type} event at (${playerTileX}, ${playerTileY})`)

        // 発火済みフラグを立てる（teleportの場合はonceでない限り再発火可能）
        if (trigger.once) {
          trigger.triggered = true
        }

        // マーカーを削除（onceの場合のみ）
        if (trigger.marker && trigger.once) {
          const key = `event_marker_${i}`
          const marker = this.markers.get(key)
          if (marker) {
            marker.destroy()
            this.markers.delete(key)
          }
        }

        // 結果を返す
        return {
          type: trigger.type,
          storyId: trigger.storyId,
          targetMap: trigger.targetMap,
          targetX: trigger.targetX,
          targetY: trigger.targetY
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
