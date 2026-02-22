import Phaser from 'phaser';

export default class TitleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private playButton!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    console.log('[TitleScene] create() called');

    // シーンとカメラを明示的にアクティブ化
    this.scene.setActive(true);
    this.scene.setVisible(true);

    // 前シーンのカメラ状態をリセット（追従・スクロール・フェード効果を除去）
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.removeBounds();
    this.cameras.main.resetFX();

    // カメラの初期化
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.setAlpha(1);
    this.cameras.main.setVisible(true);

    // 背景画像の表示（画面中央、1920x1080にスケール）
    this.background = this.add.image(960, 540, 'title');
    this.background.setDisplaySize(1920, 1080);
    this.background.setDepth(0);

    // Playボタンの作成
    this.createPlayButton();

    console.log('[TitleScene] create() completed');
  }

  private createPlayButton(): void {
    // ボタンの位置
    const buttonX = 960;
    const buttonY = 800;

    // 画像ボタンの作成
    this.playButton = this.add.image(buttonX, buttonY, 'btn_play');
    this.playButton.setScale(2); // 適切なサイズに調整

    // インタラクティブ設定
    this.playButton.setInteractive({ useHandCursor: true });

    // ホバーエフェクト
    this.playButton.on('pointerover', () => {
      this.playButton.setScale(2.2);
    });

    this.playButton.on('pointerout', () => {
      this.playButton.setScale(2);
    });

    // クリックエフェクト
    this.playButton.on('pointerdown', () => {
      this.playButton.setScale(1.9);
    });

    this.playButton.on('pointerup', () => {
      this.playButton.setScale(2.2);
      this.startGame();
    });
  }

  private startGame(): void {
    // MainScene が gameflow.json の start.story を処理する
    this.scene.start('MainScene');
  }
}
