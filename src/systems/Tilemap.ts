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

  // 壁の物理グループ
  const walls = scene.physics.add.staticGroup()

  // 床タイルを HTML Canvas に描画してから単一テクスチャとして登録
  const floorCanvas = document.createElement('canvas')
  floorCanvas.width = worldW
  floorCanvas.height = worldH
  const ctx = floorCanvas.getContext('2d')!

  let floorTileCount = 0

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tileId = tiles[y]?.[x] ?? 0
      const def = tileDefMap.get(tileId) ?? FALLBACK_DEF
      const cx = x * TILE + TILE / 2
      const cy = y * TILE + TILE / 2

      if (def.animated) {
        // アニメーションタイル: スプライトシートが有効かどうかを確認
        const animKey = `anim_${def.textureKey}`
        const animFrames = scene.anims.exists(animKey)
          ? null // すでに登録済み
          : scene.anims.generateFrameNumbers(def.textureKey, { start: 0, end: 3 })

        const hasValidAnim = scene.anims.exists(animKey) || (animFrames !== null && animFrames.length > 0)

        if (hasValidAnim) {
          // 有効なスプライトシート: アニメーションスプライトとして配置
          const sprite = scene.add.sprite(cx, cy, def.textureKey)
          sprite.setDisplaySize(TILE, TILE)

          if (animFrames !== null && animFrames.length > 0) {
            scene.anims.create({
              key: animKey,
              frames: animFrames,
              frameRate: def.fps ?? DEFAULT_ANIM_FPS,
              repeat: -1,
            })
          }
          sprite.play(animKey)

          if (def.role === 'wall') {
            sprite.setDepth(1)
            const body = walls.create(cx, cy, def.textureKey, 0) as Phaser.Physics.Arcade.Sprite
            body.setVisible(false)
            body.setDisplaySize(TILE, TILE)
            body.refreshBody()
          } else {
            sprite.setDepth(0)
          }
        } else if (def.role === 'wall') {
          // スプライトシート失敗 + 壁: 静的壁としてフォールバック
          const wallObj = walls.create(cx, cy, def.textureKey) as Phaser.Physics.Arcade.Sprite
          wallObj.setDisplaySize(TILE, TILE)
          wallObj.refreshBody()
          wallObj.setDepth(1)
        } else {
          // スプライトシート失敗 + 床: HTMLCanvas に描画してフォールバック
          const texSrc = scene.textures.get(def.textureKey).source[0]
          const img = texSrc.image as HTMLImageElement | HTMLCanvasElement
          if (img) {
            ctx.drawImage(img, 0, 0, texSrc.width, texSrc.height, x * TILE, y * TILE, TILE, TILE)
            floorTileCount++
          }
        }
      } else if (def.role === 'floor') {
        // 静的床: HTML Canvas に TILE サイズで描画
        const texSrc = scene.textures.get(def.textureKey).source[0]
        const img = texSrc.image as HTMLImageElement | HTMLCanvasElement
        ctx.drawImage(img, 0, 0, texSrc.width, texSrc.height, x * TILE, y * TILE, TILE, TILE)
        floorTileCount++
      } else {
        // 静的壁: StaticGroup に追加
        const wallObj = walls.create(cx, cy, def.textureKey) as Phaser.Physics.Arcade.Sprite
        wallObj.setDisplaySize(TILE, TILE)
        wallObj.refreshBody()
        wallObj.setDepth(1)
      }
    }
  }

  // Canvas からテクスチャを生成して単一 Image として表示
  const floorKey = '__floor_canvas__'
  if (scene.textures.exists(floorKey)) {
    scene.textures.remove(floorKey)
  }
  scene.textures.addCanvas(floorKey, floorCanvas)
  scene.add.image(0, 0, floorKey).setOrigin(0, 0).setDepth(0)

  console.log(
    `[Tilemap] buildMapFromJSON: ${cols}x${rows}, floor=${floorTileCount}, worldSize=${worldW}x${worldH}`
  )

  return { worldW, worldH, walls }
}
