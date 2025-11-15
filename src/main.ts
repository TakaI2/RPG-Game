import Phaser from 'phaser'
import { GAME_W, GAME_H } from './config'
import LoadingScene from './scenes/LoadingScene'
import TitleScene from './scenes/TitleScene'
import MainScene from './scenes/MainScene'
import StoryScene from './scenes/StoryScene'
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
  scene: [LoadingScene, TitleScene, MainScene, StoryScene]
})

console.log('Phaser game created:', game)

export default game
