import Phaser from 'phaser'
import { TILE } from '../config'
import DialogUI from './Dialog'

export interface NPCData {
  id: string
  name: string
  sprite: string
  position: { x: number, y: number }
  dialogFile: string
  map?: string // どのマップに属するか（オプション、指定がない場合は全マップに表示）
}

export interface NPCConfig {
  npcs: NPCData[]
}

export interface NPCSprite extends Phaser.Physics.Arcade.Sprite {
  npcData: NPCData
  dialogData?: any
}

/**
 * NPCマネージャー
 * 外部JSONファイルからNPCを読み込み、管理する
 */
export class NPCManager {
  private scene: Phaser.Scene
  private npcs: NPCSprite[] = []
  private ui: DialogUI

  constructor(scene: Phaser.Scene, ui: DialogUI) {
    this.scene = scene
    this.ui = ui
  }

  /**
   * NPCデータを読み込み、スプライトを生成する
   * @param configKey preloadで読み込んだNPC設定JSONのキー
   * @param mapId 現在のマップID（指定した場合、そのマップに属するNPCのみをロード）
   */
  loadNPCs(configKey: string, mapId?: string) {
    const config = this.scene.cache.json.get(configKey) as NPCConfig

    if (!config || !config.npcs) {
      console.warn(`NPC config not found: ${configKey}`)
      return
    }

    config.npcs.forEach(npcData => {
      // マップIDが指定されている場合、そのマップに属するNPCのみをロード
      if (mapId && npcData.map && npcData.map !== mapId) {
        return // スキップ
      }
      this.createNPC(npcData)
    })
  }

  /**
   * 個別のNPCを生成
   */
  private createNPC(npcData: NPCData) {
    const x = npcData.position.x * TILE
    const y = npcData.position.y * TILE

    // スプライトを生成（64x64を想定）
    const sprite = this.scene.physics.add.staticSprite(x, y, npcData.sprite) as NPCSprite
    sprite.npcData = npcData

    // セリフデータを読み込む
    const dialogKey = this.getDialogKey(npcData.dialogFile)
    if (this.scene.cache.json.exists(dialogKey)) {
      sprite.dialogData = this.scene.cache.json.get(dialogKey)
    } else {
      console.warn(`Dialog data not found for NPC ${npcData.id}: ${dialogKey}`)
    }

    this.npcs.push(sprite)
  }

  /**
   * ダイアログファイルパスからキャッシュキーを生成
   */
  private getDialogKey(filePath: string): string {
    // "src/assets/dialog/npc1.json" -> "dialog_npc1"
    const match = filePath.match(/dialog\/(.+)\.json$/)
    return match ? `dialog_${match[1]}` : filePath
  }

  /**
   * プレイヤーと近いNPCを検出して会話を開始
   * @param player プレイヤースプライト
   * @param maxDistance 最大距離（ピクセル）
   * @returns 会話を開始したかどうか
   */
  tryInteract(player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody, maxDistance: number = 80): boolean {
    for (const npc of this.npcs) {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, npc.x, npc.y)

      if (distance < maxDistance) {
        if (npc.dialogData) {
          this.ui.show(npc.npcData.name, npc.dialogData)
          return true
        }
      }
    }
    return false
  }

  /**
   * プレイヤーとの衝突判定を設定
   * @returns 作成された衝突判定の配列
   */
  setupCollisions(player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody): Phaser.Physics.Arcade.Collider[] {
    const colliders: Phaser.Physics.Arcade.Collider[] = []
    this.npcs.forEach(npc => {
      const collider = this.scene.physics.add.collider(player, npc)
      colliders.push(collider)
    })
    return colliders
  }

  /**
   * すべてのNPCスプライトを取得
   */
  getNPCs(): NPCSprite[] {
    return this.npcs
  }

  /**
   * IDでNPCを検索
   */
  getNPCById(id: string): NPCSprite | undefined {
    return this.npcs.find(npc => npc.npcData.id === id)
  }

  /**
   * すべてのNPCを破棄
   */
  destroy() {
    this.npcs.forEach(npc => {
      if (npc && npc.active) {
        npc.destroy()
      }
    })
    this.npcs = []
  }
}
