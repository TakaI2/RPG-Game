import Phaser from 'phaser'
import { TILE } from '../config'

/**
 * demo_map.json の形式
 * {
 *   "cols": 120, "rows": 120,
 *   "tiles": [ [0|1, ...], ... ], // 0=床, 1=壁
 *   "enemySpawns": [{"x":50,"y":45},{"x":60,"y":60}]
 * }
 */
export function buildMapFromJSON(scene: Phaser.Scene, data: any) {
  const cols: number = data.cols
  const rows: number = data.rows
  const tiles: number[][] = data.tiles

  const worldW = cols * TILE
  const worldH = rows * TILE

  // 背景（床）をタイルスプライトで塗る
  scene.add.tileSprite(worldW / 2, worldH / 2, worldW, worldH, 'ground')

  // 壁をStaticGroupで配置
  const walls = scene.physics.add.staticGroup()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (tiles[y][x] === 1) {
        walls.create(x * TILE + TILE / 2, y * TILE + TILE / 2, 'wall')
      }
    }
  }
  return { worldW, worldH, walls }
}
