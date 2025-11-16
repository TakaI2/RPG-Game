import Phaser from 'phaser';

export class PauseMenu {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Rectangle;
  private pausedText!: Phaser.GameObjects.Text;
  private resumeButton!: Phaser.GameObjects.Container;
  private titleButton!: Phaser.GameObjects.Container;
  private isVisible: boolean = false;
  private onBackToTitle?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.create();
  }

  private create(): void {
    // コンテナを作成（最初は非表示）
    this.container = this.scene.add.container(0, 0);
    this.container.setDepth(10000); // タッチUIより前面に表示
    // scrollFactorは使用せず、show()時にカメラ位置に合わせて配置
    this.container.setVisible(false);

    // 半透明黒のオーバーレイ（全画面）
    this.overlay = this.scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.7);
    // オーバーレイをインタラクティブにして、下のクリックイベントをブロック
    this.overlay.setInteractive();

    // "PAUSED" テキスト
    this.pausedText = this.scene.add.text(960, 300, 'PAUSED', {
      fontSize: '72px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.pausedText.setOrigin(0.5, 0.5);

    // Resumeボタンの作成
    this.resumeButton = this.createButton(960, 500, 'RESUME', () => {
      this.hide();
    });

    // Back to Titleボタンの作成
    this.titleButton = this.createButton(960, 620, 'BACK TO TITLE', () => {
      if (this.onBackToTitle) {
        this.onBackToTitle();
      }
    });

    // コンテナに全て追加
    this.container.add([
      this.overlay,
      this.pausedText,
      this.resumeButton,
      this.titleButton,
    ]);
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const buttonWidth = 300;
    const buttonHeight = 80;

    const container = this.scene.add.container(x, y);
    // scrollFactorは親containerと同じく使用しない

    // ボタン背景
    const bg = this.scene.add.rectangle(0, 0, buttonWidth, buttonHeight, 0xffffff, 0.9);

    // ボタンテキスト
    const buttonText = this.scene.add.text(0, 0, text, {
      fontSize: '32px',
      color: '#000000',
      fontStyle: 'bold',
    });
    buttonText.setOrigin(0.5, 0.5);

    container.add([bg, buttonText]);

    // インタラクティブ設定
    bg.setInteractive(
      new Phaser.Geom.Rectangle(
        -buttonWidth / 2,
        -buttonHeight / 2,
        buttonWidth,
        buttonHeight
      ),
      Phaser.Geom.Rectangle.Contains
    );

    // ホバーエフェクト
    bg.on('pointerover', () => {
      container.setScale(1.05);
      bg.setAlpha(1.0);
    });

    bg.on('pointerout', () => {
      container.setScale(1.0);
      bg.setAlpha(0.9);
    });

    // クリックエフェクト
    bg.on('pointerdown', () => {
      container.setScale(0.95);
    });

    bg.on('pointerup', () => {
      container.setScale(1.05);
      onClick();
    });

    return container;
  }

  show(): void {
    if (this.isVisible) return;

    this.isVisible = true;

    // カメラの位置を取得して、containerをカメラ位置に配置
    const camera = this.scene.cameras.main;
    this.container.setPosition(camera.scrollX, camera.scrollY);
    console.log('[PauseMenu] Camera position:', camera.scrollX, camera.scrollY);

    this.container.setVisible(true);

    // ゲームの物理演算を一時停止
    this.scene.physics.pause();

    console.log('[PauseMenu] Game paused');
  }

  hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;
    this.container.setVisible(false);

    // ゲームの物理演算を再開
    this.scene.physics.resume();

    console.log('[PauseMenu] Game resumed');
  }

  isShowing(): boolean {
    return this.isVisible;
  }

  setBackToTitleCallback(callback: () => void): void {
    this.onBackToTitle = callback;
  }

  destroy(): void {
    if (this.container) {
      this.container.destroy();
    }
  }
}
