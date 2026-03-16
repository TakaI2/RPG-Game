import Phaser from 'phaser'
import { GAME_W, GAME_H, TILE } from '../config'
import type { GameFlowConfig } from '../types/GameFlowTypes'
import type { TileDef } from '../types/tileset'

/**
 * ローディング画面
 * - 進捗バー表示
 * - パーセンテージ表示
 * - ロード中のアセット名表示
 * - MainSceneで必要な全アセットをプリロード
 */
export default class LoadingScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Graphics
  private progressBox!: Phaser.GameObjects.Graphics
  private percentText!: Phaser.GameObjects.Text
  private loadingText!: Phaser.GameObjects.Text
  private assetText!: Phaser.GameObjects.Text

  constructor() {
    super('LoadingScene')
  }

  preload() {
    // ローディング画面のUI作成
    this.createLoadingUI()

    // ローディングイベントの設定
    this.load.on('progress', this.onProgress, this)
    this.load.on('fileprogress', this.onFileProgress, this)
    this.load.on('complete', this.onComplete, this)

    // ========================================
    // MainScene用アセットのプリロード
    // ========================================

    // プレイヤースプライトシート（64×64、チョロマキー処理のため raw で読み込む）
    this.load.image('hero_raw', 'assets/images/hero.png')

    // 敵スプライトシート（チョロマキー処理のため raw で読み込む）
    this.load.image('solder_raw', 'assets/images/solder.png')
    this.load.image('vamp1_raw', 'assets/images/vamp1.png')
    this.load.image('vamp2_raw', 'assets/images/vamp2.png')
    this.load.image('succubus_raw', 'assets/images/succubus.png')
    this.load.image('mage_raw', 'assets/images/mage.png')
    this.load.image('belladonna_raw', 'assets/images/Belladonna.png')

    // 飛び道具
    this.load.image('arrow', 'assets/images/arrow.png')
    this.load.image('orb', 'assets/images/magic_orb.png')

    // NPCスプライト（64x64）
    this.load.image('npc_villager', 'assets/images/npc_villager.png')
    this.load.image('npc_merchant', 'assets/images/npc_merchant.png')

    // ゲームフロー設定JSON（最初にロードして、完了後に BGM・ボスJSONを動的追加）
    this.load.json('gameflow', 'assets/gameflow.json')
    this.load.once('filecomplete-json-gameflow', () => {
      const config = this.cache.json.get('gameflow') as GameFlowConfig
      config.assets?.bgm?.forEach(({ key, url }) => {
        this.load.audio(key, url)
      })
      // ボスJSON動的ロード（gameflow.json に定義された configKey を収集）
      const bossKeys = new Set<string>()
      Object.values(config.maps).forEach(mapConfig => {
        if (mapConfig.boss?.configKey) bossKeys.add(mapConfig.boss.configKey)
      })
      bossKeys.forEach(key => {
        this.load.json(key, `assets/bosses/${key}.json`)
      })
    })

    // タイルセット定義JSON（同期XHRで先行取得 → タイル画像を直接ロード）
    this.load.json('tilesets', 'assets/maps/tilesets.json')
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', 'assets/maps/tilesets.json', false) // synchronous
      xhr.send()
      if (xhr.status === 200) {
        const defs = JSON.parse(xhr.responseText) as TileDef[]
        defs.forEach(def => {
          if (def.animated) {
            this.load.spritesheet(def.textureKey, `assets/images/maptip/${def.textureKey}.png`, {
              frameWidth: 64,
              frameHeight: 64,
            })
          } else {
            this.load.image(def.textureKey, `assets/images/maptip/${def.textureKey}.png`)
          }
        })
      }
    } catch (e) {
      console.warn('[LoadingScene] Could not sync-load tilesets.json:', e)
    }

    // マップJSON
    this.load.json('demo_map', 'assets/maps/demo_map.json')
    this.load.json('boss_map', 'assets/maps/boss_map.json')
    this.load.json('first_map', 'assets/maps/first_map.json')
    this.load.json('queen_map', 'assets/maps/queen_map.json')

    // NPC設定JSON
    this.load.json('npc_config', 'assets/npcs/npcs.json')

    // 敵定義JSON
    this.load.json('enemy-defs', 'assets/enemies/enemy-defs.json')

    // NPCダイアログファイル
    this.load.json('dialog_npc1', 'assets/dialog/npc1.json')
    this.load.json('dialog_merchant', 'assets/dialog/merchant.json')

    // ボスカットイン用画像（オプション：画像がない場合はプレースホルダー表示）
    this.load.image('boss_face', 'assets/images/boss_face.png')

    // タイトル画面用アセット
    this.load.image('title', 'assets/images/title.png')

    // ボタン画像
    this.load.image('btn_play', 'assets/images/Play_button.png')
    this.load.image('btn_resume', 'assets/images/Resume_Button.png')
    this.load.image('btn_backtotitle', 'assets/images/BacktoTitle_Button.png')

    // ポータルスプライト（チョロマキー処理のため raw で読み込む）
    this.load.image('door_raw', 'assets/images/door.png')

    // エラーハンドリング：画像が見つからない場合でもゲームを続行
    this.load.on('loaderror', (fileObj: Phaser.Loader.File) => {
      console.warn(`[LoadingScene] Failed to load: ${fileObj.key} (${fileObj.url})`)
      // エラーがあっても続行
    })
  }

  private createLoadingUI() {
    const centerX = GAME_W / 2
    const centerY = GAME_H / 2

    // タイトルテキスト
    this.loadingText = this.add.text(centerX, centerY - 100, 'Loading...', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    // 進捗バーの外枠
    this.progressBox = this.add.graphics()
    this.progressBox.fillStyle(0x222222, 0.8)
    this.progressBox.fillRect(centerX - 320, centerY - 30, 640, 60)
    this.progressBox.lineStyle(3, 0xffffff, 1)
    this.progressBox.strokeRect(centerX - 320, centerY - 30, 640, 60)

    // 進捗バー
    this.progressBar = this.add.graphics()

    // パーセンテージテキスト
    this.percentText = this.add.text(centerX, centerY, '0%', {
      fontSize: '36px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    // 現在ロード中のアセット名
    this.assetText = this.add.text(centerX, centerY + 80, '', {
      fontSize: '24px',
      color: '#aaaaaa',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5)
  }

  private onProgress(value: number) {
    const centerX = GAME_W / 2
    const centerY = GAME_H / 2

    // 進捗バーを更新
    this.progressBar.clear()
    this.progressBar.fillStyle(0x00ff00, 1)
    this.progressBar.fillRect(centerX - 310, centerY - 20, 620 * value, 40)

    // パーセンテージを更新
    const percent = Math.floor(value * 100)
    this.percentText.setText(`${percent}%`)
  }

  private onFileProgress(file: Phaser.Loader.File) {
    // ロード中のファイル名を表示
    const fileName = file.key.length > 40
      ? file.key.substring(0, 37) + '...'
      : file.key
    this.assetText.setText(`Loading: ${fileName}`)
  }

  private onComplete() {
    console.log('[LoadingScene] Loading complete')

    // ローディング完了のアニメーション
    this.tweens.add({
      targets: [this.progressBar, this.progressBox, this.percentText, this.loadingText, this.assetText],
      alpha: 0,
      duration: 500,
      onComplete: () => {
        // TitleSceneへ遷移
        this.scene.start('TitleScene')
      }
    })
  }

  create() {
    // hero_raw に RGB(0,254,0) チョロマキー処理を施し、スプライトシートとして登録
    this.applyChromaKey('hero_raw',     'hero',     0, 254, 0, 64, 64)
    // 敵スプライトシートにも同様のチョロマキー処理
    this.applyChromaKey('solder_raw',   'solder',   0, 254, 0, 64, 64)
    this.applyChromaKey('vamp1_raw',    'vamp1',    0, 254, 0, 64, 64)
    this.applyChromaKey('vamp2_raw',    'vamp2',    0, 254, 0, 64, 64)
    this.applyChromaKey('succubus_raw', 'succubus', 0, 254, 0, 64, 64)
    this.applyChromaKey('mage_raw',     'mage',     0, 254, 0, 64, 64)
    this.applyChromaKey('door_raw',     'door',     0, 254, 0, 64, 64)
    this.applyChromaKey('belladonna_raw', 'belladonna', 0, 254, 0, 64, 64)

    // タイル用のテクスチャを生成
    // これらはMainSceneのpreloadで生成されていたものをここに移動

    // 地面タイル（後方互換用）
    const g4 = this.make.graphics({ x: 0, y: 0 })
    g4.fillStyle(0x143d2a, 1).fillRect(0, 0, TILE, TILE).generateTexture('ground', TILE, TILE).clear()

    // 壁タイル（後方互換用）
    const g5 = this.make.graphics({ x: 0, y: 0 })
    g5.fillStyle(0x3a3a4a, 1).fillRect(0, 0, TILE, TILE)
      .lineStyle(2, 0x2a2a36, 1).strokeRect(1, 1, TILE - 2, TILE - 2)
      .generateTexture('wall', TILE, TILE).clear()

    // tilesets.json に定義された各タイルの procedural texture を生成
    // （画像ファイルがロードできていない場合のフォールバック）
    const defs = this.cache.json.get('tilesets') as TileDef[] | null
    if (defs) {
      defs.forEach(def => {
        if (this.textures.exists(def.textureKey)) {
          // アニメーションタイルでフレーム0が存在しない = スプライトシートの読み込み失敗
          // 無効なテクスチャエントリを削除してプロシージャルテクスチャで上書きする
          if (def.animated && this.textures.get(def.textureKey).getFrameNames().length === 0) {
            this.textures.remove(def.textureKey)
            console.warn(`[LoadingScene] Spritesheet failed for '${def.textureKey}', generating procedural fallback`)
          } else {
            return
          }
        }
        const hex = parseInt(def.color.replace('#', ''), 16)
        const g = this.make.graphics({ x: 0, y: 0 })
        g.fillStyle(hex, 1).fillRect(0, 0, TILE, TILE)
        if (def.role === 'wall') {
          g.lineStyle(2, 0x000000, 0.3).strokeRect(1, 1, TILE - 2, TILE - 2)
        }
        g.generateTexture(def.textureKey, TILE, TILE).clear()
        console.log(`[LoadingScene] Procedural texture generated: ${def.textureKey}`)
      })
    }

    // ポートレート用テクスチャ（DialogUI用）
    const g7 = this.make.graphics({ x: 0, y: 0 })
    g7.fillStyle(0xffffff, 1).fillRect(0, 0, 200, 200).generateTexture('portrait', 200, 200).clear()

    console.log('[LoadingScene] Textures generated')
  }

  /**
   * 指定した色を透明にしてスプライトシートとして登録する（チョロマキー処理）
   * @param rawKey ロード済み画像キー
   * @param destKey 登録先スプライトシートキー
   * @param r 透過色 R
   * @param g 透過色 G
   * @param b 透過色 B
   * @param frameWidth フレーム幅
   * @param frameHeight フレーム高さ
   */
  private applyChromaKey(
    rawKey: string,
    destKey: string,
    r: number,
    g: number,
    b: number,
    frameWidth: number,
    frameHeight: number
  ) {
    const rawTex = this.textures.get(rawKey)
    const src = rawTex.source[0]
    const canvas = document.createElement('canvas')
    canvas.width = src.width
    canvas.height = src.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(src.image as HTMLImageElement, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) {
        data[i + 3] = 0
      }
    }
    ctx.putImageData(imageData, 0, 0)
    this.textures.addSpriteSheet(destKey, canvas as unknown as HTMLImageElement, { frameWidth, frameHeight })
    this.textures.remove(rawKey)
    console.log(`[LoadingScene] ChromaKey applied: ${rawKey} -> ${destKey}`)
  }
}
