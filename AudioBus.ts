// systems/AudioBus.ts
import Phaser from 'phaser'
export class AudioBus {
  private scene: Phaser.Scene
  private bgm?: Phaser.Sound.BaseSound
  constructor(scene: Phaser.Scene){ this.scene = scene }

  playBgm(key: string, opt?: { loop?: boolean; volume?: number; fade?: number }) {
    if (this.bgm?.isPlaying) this.stopBgm({ fade: opt?.fade ?? 0 })
    this.bgm = this.scene.sound.add(key, { loop: opt?.loop ?? true, volume: opt?.volume ?? 1 })
    if (opt?.fade) { this.scene.tweens.add({ targets: this.bgm, volume: this.bgm.volume, duration: 0 }) }
    this.bgm.play()
    if (opt?.fade) this.scene.tweens.add({ targets: this.bgm, volume: opt.volume ?? 1, duration: opt.fade })
  }
  stopBgm(opt?: { fade?: number }) {
    if (!this.bgm) return
    if (opt?.fade) {
      this.scene.tweens.add({
        targets: this.bgm, volume: 0, duration: opt.fade,
        onComplete: () => { this.bgm?.stop(); this.bgm?.destroy(); this.bgm = undefined }
      })
    } else { this.bgm.stop(); this.bgm.destroy(); this.bgm = undefined }
  }
  cross(fromKey: string, toKey: string, time=600, loop=true) {
    const from = this.bgm; if (!from) return this.playBgm(toKey, { loop, fade: time })
    const to = this.scene.sound.add(toKey, { loop, volume: 0 }); to.play()
    this.scene.tweens.add({ targets: from, volume: 0, duration: time, onComplete: () => { from.stop(); from.destroy() } })
    this.scene.tweens.add({ targets: to, volume: 1, duration: time })
    this.bgm = to
  }
  se(key: string) { this.scene.sound.play(key) }
}
