import Phaser from 'phaser'
import { TILE } from '../config'
import type { TileDef, MapData } from '../types/tileset'

const FALLBACK_DEF: TileDef = {
  id: 0,
  role: 'floor',
  textureKey: 'tile_ground',
  label: '地面',
  color: '#143d2a',
}

const DEFAULT_ANIM_FPS = 8

export function buildMapFromJSON(
  scene: Phaser.Scene,
  data: MapData,
  tileDefMap: Map<number, TileDef>
): { worldW: number; worldH: number; walls: Phaser.Physics.Arcade.StaticGroup } {
  const { cols, rows, tiles } = data
  const worldW = cols * TILE
  const worldH = rows * TILE

  // 床を一括描画する RenderTexture（描画コスト O(1)）
  const floorRT = scene.add.renderTexture(0, 0, worldW, worldH)
  floorRT.setDepth(0)

  // 壁の物理グループ
  const walls = scene.physics.add.staticGroup()

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileId = tiles[y]?.[x] ?? 0
      const def = tileDefMap.get(tileId) ?? FALLBACK_DEF
      const cx = x * TILE + TILE / 2
      const cy = y * TILE + TILE / 2

      if (def.animated) {
        // アニメーションタイル: Sprite として配置
        const sprite = scene.add.sprite(cx, cy, def.textureKey)
        sprite.setDisplaySize(TILE, TILE)

        const animKey = `anim_${def.textureKey}`
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(def.textureKey, { start: 0, end: 3 }),
            frameRate: def.fps ?? DEFAULT_ANIM_FPS,
            repeat: -1,
          })
        }
        sprite.play(animKey)

        if (def.role === 'wall') {
          // 可視スプライトは depth=1、衝突用の不可視ボディを別途作成
          sprite.setDepth(1)
          const body = walls.create(cx, cy, def.textureKey, 0) as Phaser.Physics.Arcade.Sprite
          body.setVisible(false)
          body.setDisplaySize(TILE, TILE)
          body.refreshBody()
        } else {
          sprite.setDepth(0)
        }
      } else if (def.role === 'floor') {
        // 静的床: RenderTexture に一括描画
        floorRT.draw(def.textureKey, x * TILE, y * TILE)
      } else {
        // 静的壁: StaticGroup に追加
        const wallObj = walls.create(cx, cy, def.textureKey) as Phaser.Physics.Arcade.Sprite
        wallObj.setDepth(1)
      }
    }
  }

  return { worldW, worldH, walls }
}
