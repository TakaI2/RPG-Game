import Phaser from 'phaser';

export default class TitleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private playButton!: Phaser.GameObjects.Container;
  private playButtonBg!: Phaser.GameObjects.Rectangle;
  private playButtonText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    console.log('[TitleScene] create() called');

    // シーンとカメラを明示的にアクティブ化
    this.scene.setActive(true);
    this.scene.setVisible(true);

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
    // ボタンの位置とサイズ
    const buttonX = 960;
    const buttonY = 800;
    const buttonWidth = 300;
    const buttonHeight = 80;

    // コンテナの作成
    this.playButton = this.add.container(buttonX, buttonY);

    // ボタン背景（半透明の白）
    this.playButtonBg = this.add.rectangle(
      0,
      0,
      buttonWidth,
      buttonHeight,
      0xffffff,
      0.8
    );

    // ボタンテキスト
    this.playButtonText = this.add.text(0, 0, 'PLAY', {
      fontSize: '48px',
      color: '#000000',
      fontStyle: 'bold',
    });
    this.playButtonText.setOrigin(0.5, 0.5);

    // コンテナに追加
    this.playButton.add([this.playButtonBg, this.playButtonText]);

    // インタラクティブ設定（ヒットエリアを明示的に設定）
    this.playButtonBg.setInteractive(
      new Phaser.Geom.Rectangle(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight
      ),
      Phaser.Geom.Rectangle.Contains
    );

    // ホバーエフェクト
    this.playButtonBg.on('pointerover', () => {
      this.playButton.setScale(1.1);
      this.playButtonBg.setAlpha(1.0);
    });

    this.playButtonBg.on('pointerout', () => {
      this.playButton.setScale(1.0);
      this.playButtonBg.setAlpha(0.8);
    });

    // クリックエフェクト
    this.playButtonBg.on('pointerdown', () => {
      this.playButton.setScale(0.95);
    });

    this.playButtonBg.on('pointerup', () => {
      this.playButton.setScale(1.1);
      this.startGame();
    });
  }

  private startGame(): void {
    // オープニングストーリーを再生してからゲーム開始
    this.scene.start('StoryScene', {
      scriptKey: 'intro',
      nextScene: 'MainScene',
    });
  }
}
