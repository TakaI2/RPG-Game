import Phaser from 'phaser';
import { AudioBus } from './AudioBus';
import { GameFlowManager } from './GameFlowManager';
import { events } from './Events';

export class BGMManager {
  private scene: Phaser.Scene;
  private audioBus: AudioBus;
  private flowManager: GameFlowManager;
  private currentMapId: string | null = null;
  private currentBgmKey: string | null = null;
  private isStoryActive: boolean = false;

  // events.off() で自分のリスナーだけを削除できるよう参照を保持
  private readonly boundOnMapLoaded = (mapId: string) => {
    this.currentMapId = mapId;
    if (!this.isStoryActive) {
      this.playMapBGM(mapId);
    }
  };
  private readonly boundOnStoryStart = () => { this.onStoryStart(); };
  private readonly boundOnStoryEnd   = () => { this.onStoryEnd(); };

  constructor(scene: Phaser.Scene, audioBus: AudioBus, flowManager: GameFlowManager) {
    this.scene = scene;
    this.audioBus = audioBus;
    this.flowManager = flowManager;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    events.on('map-loaded',  this.boundOnMapLoaded);
    events.on('story-start', this.boundOnStoryStart);
    events.on('story:end',   this.boundOnStoryEnd);
  }

  playMapBGM(mapId: string): void {
    const bgmKey = this.flowManager.getMapConfig(mapId)?.bgm;

    if (!bgmKey) {
      console.warn(`[BGMManager] No BGM defined for map: ${mapId}`);
      return;
    }

    // 既に同じBGMが再生中なら何もしない
    if (this.currentBgmKey === bgmKey) {
      return;
    }

    // 古いBGMがあればフェードアウトして停止してから新BGMへ
    if (this.currentBgmKey) {
      this.audioBus.stopBgm({ fade: 1000 });
    }

    // マップBGMはフェードなしで即時再生（tween不要で確実に音が出る）
    this.audioBus.playBgm(bgmKey, { loop: true, fade: 0 });
    this.currentBgmKey = bgmKey;

    console.log(`[BGMManager] Playing BGM: ${bgmKey} for map: ${mapId}`);
  }

  stopMapBGM(): void {
    if (this.currentBgmKey) {
      this.audioBus.stopBgm({ fade: 1000 });
      this.currentBgmKey = null;
    }
  }

  onStoryStart(): void {
    this.isStoryActive = true;
    // マップBGMを停止し、currentBgmKey をリセット（Bug1 修正）
    if (this.currentBgmKey) {
      this.audioBus.stopBgm({ fade: 500 });
      this.currentBgmKey = null;
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
    // 自分のリスナーだけを削除（他のリスナーは残す）
    events.off('map-loaded',  this.boundOnMapLoaded);
    events.off('story-start', this.boundOnStoryStart);
    events.off('story:end',   this.boundOnStoryEnd);
  }
}
