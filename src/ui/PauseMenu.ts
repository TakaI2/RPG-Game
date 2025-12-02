import Phaser from 'phaser';

export class PauseMenu {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Rectangle;
  private pausedText!: Phaser.GameObjects.Text;
  private resumeButton!: Phaser.GameObjects.Image;
  private titleButton!: Phaser.GameObjects.Image;
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

    // Resumeボタンの作成（画像ボタン）
    this.resumeButton = this.createImageButton(960, 480, 'btn_resume', () => {
      this.hide();
    });

    // Back to Titleボタンの作成（画像ボタン）
    this.titleButton = this.createImageButton(960, 620, 'btn_backtotitle', () => {
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

  private createImageButton(
    x: number,
    y: number,
    imageKey: string,
    onClick: () => void
  ): Phaser.GameObjects.Image {
    // 画像ボタンの作成
    const button = this.scene.add.image(x, y, imageKey);
    button.setScale(2); // 適切なサイズに調整

    // インタラクティブ設定
    button.setInteractive({ useHandCursor: true });

    // ホバーエフェクト
    button.on('pointerover', () => {
      button.setScale(2.2);
    });

    button.on('pointerout', () => {
      button.setScale(2);
    });

    // クリックエフェクト
    button.on('pointerdown', () => {
      button.setScale(1.9);
    });

    button.on('pointerup', () => {
      button.setScale(2.2);
      onClick();
    });

    return button;
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
