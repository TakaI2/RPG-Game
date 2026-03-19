import Phaser from 'phaser'
import { loadSoundConfig, saveSoundConfig } from '../utils/SoundConfig'

export class AudioBus {
  private scene: Phaser.Scene
  private currentBgm: Phaser.Sound.BaseSound | null = null
  private bgmKey: string = ''
  private bgmVolume: number
  private seVolume: number
  private storySeVolume: number
  private loopSounds: Map<string, Phaser.Sound.BaseSound> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    const cfg = loadSoundConfig()
    this.bgmVolume     = cfg.bgmVolume
    this.seVolume      = cfg.seVolume
    this.storySeVolume = cfg.storySeVolume
  }

  // -------------------------------------------------------
  // 音量設定
  // -------------------------------------------------------

  setBgmVolume(volume: number): void {
    this.bgmVolume = volume
    if (this.currentBgm && 'setVolume' in this.currentBgm) {
      (this.currentBgm as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).setVolume(volume)
    }
    saveSoundConfig({ bgmVolume: volume, seVolume: this.seVolume, storySeVolume: this.storySeVolume })
  }

  setSeVolume(volume: number): void {
    this.seVolume = volume
    saveSoundConfig({ bgmVolume: this.bgmVolume, seVolume: volume, storySeVolume: this.storySeVolume })
  }

  setStorySeVolume(volume: number): void {
    this.storySeVolume = volume
    saveSoundConfig({ bgmVolume: this.bgmVolume, seVolume: this.seVolume, storySeVolume: volume })
  }

  getBgmVolume(): number    { return this.bgmVolume }
  getSeVolume(): number     { return this.seVolume }
  getStorySeVolume(): number { return this.storySeVolume }

  // -------------------------------------------------------
  // BGM
  // -------------------------------------------------------

  playBgm(key: string, options?: { loop?: boolean; volume?: number; fade?: number }) {
    const loop   = options?.loop ?? true
    const volume = (options?.volume ?? 0.7) * this.bgmVolume
    const fade   = options?.fade ?? 0

    if (this.currentBgm && this.currentBgm.isPlaying) {
      if (fade > 0) {
        this.scene.tweens.add({
          targets: this.currentBgm,
          volume: 0,
          duration: fade,
          onComplete: () => {
            this.currentBgm?.stop()
            this.startNewBgm(key, loop, volume, fade)
          }
        })
        return
      } else {
        this.currentBgm.stop()
      }
    }

    this.startNewBgm(key, loop, volume, fade)
  }

  private startNewBgm(key: string, loop: boolean, volume: number, fade: number) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] BGM not found: ${key}`)
      return
    }
    this.bgmKey = key
    this.currentBgm = this.scene.sound.add(key, { loop, volume: fade > 0 ? 0 : volume })
    this.currentBgm.play()
    if (fade > 0) {
      this.scene.tweens.add({ targets: this.currentBgm, volume, duration: fade })
    }
    console.log(`[AudioBus] BGM started: ${key}`)
  }

  stopBgm(options?: { fade?: number }) {
    const fade = options?.fade ?? 0
    if (!this.currentBgm) return

    const soundToStop = this.currentBgm
    this.currentBgm = null
    this.bgmKey = ''

    if (fade > 0 && soundToStop.isPlaying) {
      this.scene.tweens.add({
        targets: soundToStop,
        volume: 0,
        duration: fade,
        onComplete: () => { soundToStop.stop() }
      })
    } else {
      soundToStop.stop()
    }
    console.log('[AudioBus] BGM stopped')
  }

  cross(from: string, to: string, time: number, loop: boolean = true) {
    if (this.bgmKey !== from) {
      console.warn(`[AudioBus] cross: current BGM is ${this.bgmKey}, not ${from}`)
    }
    this.playBgm(to, { loop, fade: time })
  }

  // -------------------------------------------------------
  // SE（ワンショット）
  // -------------------------------------------------------

  se(key: string) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] SE not found: ${key}`)
      return
    }
    this.scene.sound.play(key, { volume: this.seVolume })
  }

  playSe(key: string, options?: { volume?: number; rate?: number }) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] SE not found: ${key}`)
      return
    }
    const volume = (options?.volume ?? 1.0) * this.seVolume
    const rate   = options?.rate ?? 1.0

    const sound = this.scene.sound.add(key, { volume })
    sound.setRate(rate)
    sound.play()
    sound.once('complete', () => { sound.destroy() })
  }

  playStorySe(key: string, options?: { volume?: number; rate?: number }) {
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] StorySE not found: ${key}`)
      return
    }
    const volume = (options?.volume ?? 1.0) * this.storySeVolume
    const rate   = options?.rate ?? 1.0

    const sound = this.scene.sound.add(key, { volume })
    sound.setRate(rate)
    sound.play()
    sound.once('complete', () => { sound.destroy() })
  }

  // -------------------------------------------------------
  // SE（ループ）
  // -------------------------------------------------------

  playSeLoop(key: string, volume: number = 1.0): void {
    if (this.loopSounds.has(key)) return  // 既に再生中
    if (!this.scene.cache.audio.exists(key)) {
      console.warn(`[AudioBus] LoopSE not found: ${key}`)
      return
    }
    const sound = this.scene.sound.add(key, { loop: true, volume: volume * this.seVolume })
    sound.play()
    this.loopSounds.set(key, sound)
  }

  stopSeLoop(key: string): void {
    const sound = this.loopSounds.get(key)
    if (!sound) return
    sound.stop()
    sound.destroy()
    this.loopSounds.delete(key)
  }

  // -------------------------------------------------------
  // レガシー互換
  // -------------------------------------------------------

  setVolume(volume: number) {
    this.setBgmVolume(volume)
  }

  getVolume(): number {
    return this.bgmVolume
  }

  // -------------------------------------------------------
  // クリーンアップ
  // -------------------------------------------------------

  destroy() {
    if (this.currentBgm) {
      this.currentBgm.stop()
      this.currentBgm = null
    }
    this.loopSounds.forEach(s => { s.stop(); s.destroy() })
    this.loopSounds.clear()
  }
}
