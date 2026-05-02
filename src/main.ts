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

// タッチデバイスでの横向き対応
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  // Android Chrome等で横向きをロック（HTTPS + user gesture が必要）
  const tryLockLandscape = () => {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    if (so && typeof so.lock === 'function') {
      so.lock('landscape-primary').catch(() => {})
    }
  }

  // オーバーレイはCSSで表示制御 (index.html の @media orientation:landscape で非表示)
  // タッチデバイスのみ DOM に追加する
  const overlay = document.createElement('div')
  overlay.id = 'orientation-overlay'
  overlay.innerHTML = '<div style="font-size:10vw">📱→📱</div><div>Please rotate your device to landscape</div><div style="font-size:3vw;margin-top:8px">横向きでプレイしてください</div>'
  overlay.addEventListener('click', tryLockLandscape)
  document.body.appendChild(overlay)

  // Phaserキャンバスを回転後のサイズに合わせる
  const refreshScale = () => game.scale.refresh()
  window.addEventListener('resize', refreshScale)
  window.addEventListener('orientationchange', () => {
    // iOS Safariは orientationchange 後も innerWidth/Height の更新が遅れるため複数回試行
    setTimeout(refreshScale, 100)
    setTimeout(refreshScale, 300)
    setTimeout(refreshScale, 600)
  })

  // 最初のタッチで横向きロック試行
  document.addEventListener('touchstart', tryLockLandscape, { once: true, passive: true })
}

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
