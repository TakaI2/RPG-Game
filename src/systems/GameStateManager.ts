import Phaser from 'phaser';

export class GameStateManager {
  /**
   * ゲーム状態を完全にリセットする
   * タイトル画面に戻る際に呼び出される
   */
  static reset(scene: Phaser.Scene): void {
    console.log('[GameStateManager] Resetting game state...');

    // MainSceneの参照を取得
    const mainScene = scene.scene.get('MainScene') as any;

    if (mainScene) {
      this.resetPlayer(mainScene);
      this.resetEnemies(mainScene);
      this.resetMap(mainScene);
      this.resetBoss(mainScene);
    }

    // すべてのBGM/SEを停止
    this.stopAllAudio(scene);

    console.log('[GameStateManager] Game state reset complete');
  }

  private static resetPlayer(scene: any): void {
    // プレイヤーのHPを満タンに戻す
    if (scene.player && scene.playerHp !== undefined) {
      scene.playerHp = 100;
      console.log('[GameStateManager] Player HP reset to 100');
    }

    // プレイヤーの位置は初期位置に戻す
    // （MainSceneの再起動時に自動的にリセットされる）
  }

  private static resetEnemies(scene: any): void {
    // 既存の敵をすべて削除
    const enemyArrays = ['enemies', 'archers', 'mages', 'brutes'];

    enemyArrays.forEach((arrayName) => {
      if (scene[arrayName] && Array.isArray(scene[arrayName])) {
        scene[arrayName].forEach((enemy: any) => {
          if (enemy && enemy.destroy) {
            enemy.destroy();
          }
        });
        scene[arrayName] = [];
        console.log(`[GameStateManager] ${arrayName} cleared`);
      }
    });
  }

  private static resetMap(scene: any): void {
    // 現在のマップIDをdemo_mapに戻す
    if (scene.currentMapId) {
      scene.currentMapId = 'demo_map';
      console.log('[GameStateManager] Map reset to demo_map');
    }
  }

  private static resetBoss(scene: any): void {
    // ボスが存在する場合は削除
    if (scene.boss) {
      if (scene.boss.destroy) {
        scene.boss.destroy();
      }
      scene.boss = null;
      console.log('[GameStateManager] Boss cleared');
    }

    // ボスHPUIが存在する場合は削除
    if (scene.bossHpUI) {
      if (scene.bossHpUI.destroy) {
        scene.bossHpUI.destroy();
      }
      scene.bossHpUI = null;
    }
  }

  private static stopAllAudio(scene: Phaser.Scene): void {
    // Phaserの全サウンドを停止
    scene.sound.stopAll();
    console.log('[GameStateManager] All audio stopped');
  }
}
