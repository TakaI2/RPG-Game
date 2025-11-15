import Phaser from 'phaser'
import { GAME_W, GAME_H, TILE } from '../config'

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

    // プレイヤースプライトシート（64×64）
    this.load.spritesheet('hero', 'assets/images/player_hero.png', { frameWidth: 64, frameHeight: 64 })

    // 敵スプライトシート（64×64）
    this.load.spritesheet('blob', 'assets/images/enemy_blob.png', { frameWidth: 64, frameHeight: 64 })
    this.load.spritesheet('archer', 'assets/images/enemy_archer.png', { frameWidth: 64, frameHeight: 64 })
    this.load.spritesheet('brute', 'assets/images/enemy_brute.png', { frameWidth: 64, frameHeight: 64 })
    this.load.spritesheet('mage', 'assets/images/enemy_mage.png', { frameWidth: 64, frameHeight: 64 })

    // 飛び道具
    this.load.image('arrow', 'assets/images/arrow.png')
    this.load.image('orb', 'assets/images/magic_orb.png')

    // NPCスプライト（64x64）
    this.load.image('npc_villager', 'assets/images/npc_villager.png')
    this.load.image('npc_merchant', 'assets/images/npc_merchant.png')

    // マップJSON
    this.load.json('demo_map', 'assets/maps/demo_map.json')
    this.load.json('boss_map', 'assets/maps/boss_map.json')

    // NPC設定JSON
    this.load.json('npc_config', 'assets/npcs/npcs.json')

    // ボス設定JSON
    this.load.json('volg_boss', 'assets/bosses/volg_boss.json')

    // NPCダイアログファイル
    this.load.json('dialog_npc1', 'assets/dialog/npc1.json')
    this.load.json('dialog_merchant', 'assets/dialog/merchant.json')

    // ボスカットイン用画像（オプション：画像がない場合はプレースホルダー表示）
    this.load.image('boss_face', 'assets/images/boss_face.png')

    // タイトル画面用アセット
    this.load.image('title', 'assets/images/title.png')

    // ゲームBGM（マップ用）
    this.load.audio('spiral', 'assets/story/bgm/spiral.ogg')
    this.load.audio('redmoon', 'assets/story/bgm/redmoon.ogg')

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
    // タイル用のテクスチャを生成
    // これらはMainSceneのpreloadで生成されていたものをここに移動

    // 地面タイル
    const g4 = this.make.graphics({ x: 0, y: 0 })
    g4.fillStyle(0x143d2a, 1).fillRect(0, 0, TILE, TILE).generateTexture('ground', TILE, TILE).clear()

    // 壁タイル
    const g5 = this.make.graphics({ x: 0, y: 0 })
    g5.fillStyle(0x3a3a4a, 1).fillRect(0, 0, TILE, TILE)
      .lineStyle(2, 0x2a2a36, 1).strokeRect(1, 1, TILE - 2, TILE - 2)
      .generateTexture('wall', TILE, TILE).clear()

    // ポートレート用テクスチャ（DialogUI用）
    const g7 = this.make.graphics({ x: 0, y: 0 })
    g7.fillStyle(0xffffff, 1).fillRect(0, 0, 200, 200).generateTexture('portrait', 200, 200).clear()

    console.log('[LoadingScene] Textures generated')
  }
}
