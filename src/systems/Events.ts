import Phaser from 'phaser'

/**
 * シーン間通信用のグローバルEventEmitter
 * 使用例:
 *   events.on('story:end', (data) => { ... })
 *   events.emit('story:end', { id: 'intro' })
 */
export const events = new Phaser.Events.EventEmitter()
