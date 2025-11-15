import Phaser from 'phaser';
import { events } from './Events';

export class BGMManager {
  private scene: Phaser.Scene;
  private audioBus: any; // AudioBusの型
  private currentMapId: string | null = null;
  private currentBgmKey: string | null = null;
  private isStoryActive: boolean = false;

  // マップIDとBGMキーのマッピング
  private readonly MAP_BGM: Record<string, string> = {
    demo_map: 'spiral',
    boss_map: 'redmoon',
  };

  constructor(scene: Phaser.Scene, audioBus: any) {
    this.scene = scene;
    this.audioBus = audioBus;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // マップロード時のBGM再生
    events.on('map-loaded', (mapId: string) => {
      this.currentMapId = mapId;
      // ストーリー中でなければBGMを再生
      if (!this.isStoryActive) {
        this.playMapBGM(mapId);
      }
    });

    // ストーリー開始時にマップBGMを停止
    events.on('story-start', () => {
      this.onStoryStart();
    });

    // ストーリー終了時にマップBGMを再開
    events.on('story-end', () => {
      this.onStoryEnd();
    });
  }

  playMapBGM(mapId: string): void {
    const bgmKey = this.MAP_BGM[mapId];

    if (!bgmKey) {
      console.warn(`[BGMManager] No BGM defined for map: ${mapId}`);
      return;
    }

    // 既に同じBGMが再生中なら何もしない
    if (this.currentBgmKey === bgmKey) {
      return;
    }

    // AudioBusが利用可能か確認
    if (!this.audioBus) {
      console.warn('[BGMManager] AudioBus is not available');
      return;
    }

    // 古いBGMがあればフェードアウトして停止
    if (this.currentBgmKey) {
      this.audioBus.stopBGM(this.currentBgmKey, { fadeOut: 1000 });
    }

    // 新しいBGMをフェードインして再生
    this.audioBus.playBGM(bgmKey, { loop: true, fadeIn: 1000 });
    this.currentBgmKey = bgmKey;

    console.log(`[BGMManager] Playing BGM: ${bgmKey} for map: ${mapId}`);
  }

  stopMapBGM(): void {
    if (this.currentBgmKey && this.audioBus) {
      this.audioBus.stopBGM(this.currentBgmKey, { fadeOut: 1000 });
      this.currentBgmKey = null;
    }
  }

  onStoryStart(): void {
    this.isStoryActive = true;
    // マップBGMを停止
    if (this.currentBgmKey && this.audioBus) {
      this.audioBus.stopBGM(this.currentBgmKey, { fadeOut: 500 });
    }
    console.log('[BGMManager] Story started, map BGM stopped');
  }

  onStoryEnd(): void {
    this.isStoryActive = false;
    // 元のマップのBGMを再開
    if (this.currentMapId) {
      this.playMapBGM(this.currentMapId);
    }
    console.log('[BGMManager] Story ended, map BGM resumed');
  }

  destroy(): void {
    // イベントリスナーを削除
    events.off('map-loaded');
    events.off('story-start');
    events.off('story-end');
  }
}
