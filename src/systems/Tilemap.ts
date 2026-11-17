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

/**
 * オブジェクト・オーバーレイレイヤー用のスプライトを生成する。
 * depth はレイヤーに応じて呼び出し側で指定する。
 */
function buildLayerTileSprite(
  scene: Phaser.Scene,
  def: TileDef,
  cx: number,
  cy: number,
  depth: number
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(cx, cy, def.textureKey)
  sprite.setDisplaySize(TILE, TILE)
  sprite.setDepth(depth)

  if (def.animated) {
    const animKey = `anim_${def.textureKey}`
    if (!scene.anims.exists(animKey)) {
      const frames = scene.anims.generateFrameNumbers(def.textureKey, { start: 0, end: 3 })
      if (frames.length > 0) {
        scene.anims.create({
          key: animKey,
          frames,
          frameRate: def.fps ?? DEFAULT_ANIM_FPS,
          repeat: -1,
        })
      }
    }
    if (scene.anims.exists(animKey)) {
      sprite.play(animKey)
    }
  }

  return sprite
}

export function buildMapFromJSON(
  scene: Phaser.Scene,
  data: MapData,
  tileDefMap: Map<number, TileDef>
): {
  worldW: number
  worldH: number
  walls: Phaser.Physics.Arcade.StaticGroup
  animSprites: Phaser.GameObjects.Sprite[]
  layerSprites: Phaser.GameObjects.Sprite[]
} {
  const { cols, rows, tiles, objectLayer, overlayLayer } = data
  const worldW = cols * TILE
  const worldH = rows * TILE

  // 壁の物理グループ
  const walls = scene.physics.add.staticGroup()

  // アニメーションスプライトの追跡（マップ遷移時に破棄するため）
  const animSprites: Phaser.GameObjects.Sprite[] = []

  // オブジェクト・オーバーレイレイヤーのスプライト（マップ遷移時に破棄）
  const layerSprites: Phaser.GameObjects.Sprite[] = []

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
          animSprites.push(sprite)
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

  // オブジェクトレイヤー（depth 3 – プレイヤー手前、PNG alpha 透過対応）
  if (objectLayer) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tileId = objectLayer[y]?.[x] ?? 0
        if (tileId === 0) continue
        const def = tileDefMap.get(tileId) ?? FALLBACK_DEF
        layerSprites.push(buildLayerTileSprite(scene, def, x * TILE + TILE / 2, y * TILE + TILE / 2, 3))
      }
    }
  }

  // オーバーレイレイヤー（depth 15 – プレイヤー背後、PNG alpha 透過対応）
  if (overlayLayer) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tileId = overlayLayer[y]?.[x] ?? 0
        if (tileId === 0) continue
        const def = tileDefMap.get(tileId) ?? FALLBACK_DEF
        layerSprites.push(buildLayerTileSprite(scene, def, x * TILE + TILE / 2, y * TILE + TILE / 2, 15))
      }
    }
  }

  console.log(
    `[Tilemap] buildMapFromJSON: ${cols}x${rows}, floor=${floorTileCount}, worldSize=${worldW}x${worldH}`
  )

  return { worldW, worldH, walls, animSprites, layerSprites }
}
