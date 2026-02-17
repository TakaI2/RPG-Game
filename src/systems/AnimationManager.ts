import Phaser from 'phaser'

// プレイヤースプライトシートのレイアウト
// 画像サイズ: 1024×256 / フレームサイズ: 64×64 → 16列 × 4行
// 列グループ: 0-3=アイドル, 4-7=歩行, 8-11=攻撃, 12-15=特殊攻撃
// 行: 0=上, 1=左, 2=下, 3=右
const PLAYER_COLS = 16

/**
 * プレイヤースプライトシートの特定グループ・方向のフレーム配列を生成
 * @param colStart 開始列インデックス (0, 4, 8, 12)
 * @param row 行番号 (0=up, 1=left, 2=down, 3=right)
 */
function getPlayerFrames(colStart: number, row: number): number[] {
  return Array.from({ length: 4 }, (_, i) => row * PLAYER_COLS + colStart + i)
}

/**
 * 敵スプライトシートの行番号からフレーム配列を生成（4列レイアウト用）
 * @param row 行番号 (0-7)
 * @param frames フレーム数 (デフォルト: 4)
 */
export function getRowFrames(row: number, frames = 4): number[] {
  return Array.from({ length: frames }, (_, i) => row * 4 + i)
}

/**
 * プレイヤーのアニメーションを定義
 * スプライトシート: 1024×256, 64×64フレーム, 16列×4行
 * @param scene Phaser Scene
 * @param key スプライトシートのキー
 */
export function createPlayerAnimations(scene: Phaser.Scene, key: string) {
  const dirs: { name: string; row: number }[] = [
    { name: 'up',    row: 0 },
    { name: 'left',  row: 1 },
    { name: 'down',  row: 2 },
    { name: 'right', row: 3 },
  ]

  for (const { name, row } of dirs) {
    // アイドルアニメーション（列 0-3）
    if (!scene.anims.exists(`${key}-idle-${name}`)) {
      scene.anims.create({
        key: `${key}-idle-${name}`,
        frames: getPlayerFrames(0, row).map(f => ({ key, frame: f })),
        frameRate: 5,
        repeat: -1
      })
    }

    // 歩行アニメーション（列 4-7）
    if (!scene.anims.exists(`${key}-walk-${name}`)) {
      scene.anims.create({
        key: `${key}-walk-${name}`,
        frames: getPlayerFrames(4, row).map(f => ({ key, frame: f })),
        frameRate: 10,
        repeat: -1
      })
    }

    // 攻撃アニメーション（列 8-11、1回再生）
    if (!scene.anims.exists(`${key}-atk-${name}`)) {
      scene.anims.create({
        key: `${key}-atk-${name}`,
        frames: getPlayerFrames(8, row).map(f => ({ key, frame: f })),
        frameRate: 14,
        repeat: 0
      })
    }

    // 特殊攻撃アニメーション（列 12-15、ホールド中ループ）
    if (!scene.anims.exists(`${key}-special-${name}`)) {
      scene.anims.create({
        key: `${key}-special-${name}`,
        frames: getPlayerFrames(12, row).map(f => ({ key, frame: f })),
        frameRate: 14,
        repeat: -1
      })
    }
  }
}

/**
 * 敵のアニメーションを定義
 * @param scene Phaser Scene
 * @param key スプライトシートのキー
 */
export function createEnemyAnimations(scene: Phaser.Scene, key: string) {
  // 歩行アニメーション（4方向）
  if (!scene.anims.exists(`${key}-walk-down`)) {
    scene.anims.create({
      key: `${key}-walk-down`,
      frames: getRowFrames(0).map(f => ({ key, frame: f })),
      frameRate: 8,
      repeat: -1
    })
  }

  if (!scene.anims.exists(`${key}-walk-left`)) {
    scene.anims.create({
      key: `${key}-walk-left`,
      frames: getRowFrames(1).map(f => ({ key, frame: f })),
      frameRate: 8,
      repeat: -1
    })
  }

  if (!scene.anims.exists(`${key}-walk-right`)) {
    scene.anims.create({
      key: `${key}-walk-right`,
      frames: getRowFrames(2).map(f => ({ key, frame: f })),
      frameRate: 8,
      repeat: -1
    })
  }

  if (!scene.anims.exists(`${key}-walk-up`)) {
    scene.anims.create({
      key: `${key}-walk-up`,
      frames: getRowFrames(3).map(f => ({ key, frame: f })),
      frameRate: 8,
      repeat: -1
    })
  }

  // 攻撃アニメーション（4方向）
  if (!scene.anims.exists(`${key}-atk-down`)) {
    scene.anims.create({
      key: `${key}-atk-down`,
      frames: getRowFrames(4).map(f => ({ key, frame: f })),
      frameRate: 10,
      repeat: 0
    })
  }

  if (!scene.anims.exists(`${key}-atk-left`)) {
    scene.anims.create({
      key: `${key}-atk-left`,
      frames: getRowFrames(5).map(f => ({ key, frame: f })),
      frameRate: 10,
      repeat: 0
    })
  }

  if (!scene.anims.exists(`${key}-atk-right`)) {
    scene.anims.create({
      key: `${key}-atk-right`,
      frames: getRowFrames(6).map(f => ({ key, frame: f })),
      frameRate: 10,
      repeat: 0
    })
  }

  if (!scene.anims.exists(`${key}-atk-up`)) {
    scene.anims.create({
      key: `${key}-atk-up`,
      frames: getRowFrames(7).map(f => ({ key, frame: f })),
      frameRate: 10,
      repeat: 0
    })
  }
}

/**
 * 速度ベクトルから方向を判定
 * @param vx X軸速度
 * @param vy Y軸速度
 * @returns 方向文字列 ('down' | 'left' | 'right' | 'up')
 */
export function getDirectionFromVelocity(vx: number, vy: number): string {
  if (Math.abs(vx) > Math.abs(vy)) {
    return vx < 0 ? 'left' : 'right'
  } else {
    return vy < 0 ? 'up' : 'down'
  }
}

/**
 * 64x64プレースホルダースプライトシートを生成
 * @param scene Phaser Scene
 * @param key テクスチャキー
 * @param color ベースカラー
 */
export function generatePlaceholderSpritesheet(
  scene: Phaser.Scene,
  key: string,
  color: number
) {
  const frameW = 64
  const frameH = 64
  const cols = 4
  const rows = 8
  const totalW = frameW * cols
  const totalH = frameH * rows

  const g = scene.make.graphics({}, false)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * frameW
      const y = row * frameH

      // フレームごとに少し色を変えてアニメーションを識別しやすく
      const brightness = 1 - (col * 0.15)
      const r = ((color >> 16) & 0xFF) * brightness
      const g_val = ((color >> 8) & 0xFF) * brightness
      const b = (color & 0xFF) * brightness
      const frameColor = (r << 16) | (g_val << 8) | b

      g.fillStyle(frameColor, 1)
      g.fillRect(x, y, frameW, frameH)

      // 枠線
      g.lineStyle(2, 0x000000, 0.5)
      g.strokeRect(x + 1, y + 1, frameW - 2, frameH - 2)

      // フレーム番号を表示（小さく）
      // 注: テキストはGraphicsに直接描画できないので、番号は省略
    }
  }

  g.generateTexture(key, totalW, totalH)
  g.destroy()
}
