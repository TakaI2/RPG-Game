import Phaser from 'phaser'
import { GAME_W, GAME_H } from './config'
import LoadingScene from './scenes/LoadingScene'
import TitleScene from './scenes/TitleScene'
import MainScene from './scenes/MainScene'
import StoryScene from './scenes/StoryScene'
import ChapterLoadingScene from './scenes/ChapterLoadingScene'
import { logger } from './utils/Logger'

// コンソールログの自動記録を開始
logger.startCapture()

console.log('=== GAME STARTING ===')
console.log('Game dimensions:', GAME_W, GAME_H)

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#081018',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false, gravity: { x: 0, y: 0 } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  loader: { imageLoadType: 'HTMLImageElement' },
  scene: [LoadingScene, TitleScene, MainScene, StoryScene, ChapterLoadingScene]
})

console.log('Phaser game created:', game)

// iOS向け: 初回タッチで AudioContext を resume するフォールバック
// Phaser の自動アンロックが効かない場合の保険
const unlockAudioContext = () => {
  const sm = game.sound
  if ('context' in sm) {
    const ctx = (sm as Phaser.Sound.WebAudioSoundManager).context
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  }
}
document.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true })
document.addEventListener('touchend',   unlockAudioContext, { once: true, passive: true })

export default game
