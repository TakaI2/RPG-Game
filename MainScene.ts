// MainScene.ts (create内の最後あたり)
import { events } from '../systems/Events'

this.scene.launch('StoryScene', { key: 'intro' })
this.scene.pause()

events.once('story:end', ({ id }) => {
  // intro 終了後にゲームへ復帰
  this.scene.resume()
  // 必要ならフラグやガイド表示など
})

// ゲームクリア時 or ゲームオーバー時のハンドラで：
// this.scene.launch('StoryScene', { key: 'gameclear' }); this.scene.pause();
// this.scene.launch('StoryScene', { key: 'gameover' });  this.scene.pause();
