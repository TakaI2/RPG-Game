import Phaser from 'phaser'
import { GAME_W, GAME_H, TILE } from '../config'
import DialogUI from '../systems/Dialog'
import {
  updateEnemyAI,
  EnemyWithAI,
  makeEnemy,
  Archer,
  Mage,
  Brute,
  makeArcher,
  makeMage,
  makeBrute,
  updateArcherAI,
  updateMageAI,
  updateBruteAI,
  AnyEnemy
} from '../systems/EnemyAI'
import { buildMapFromJSON } from '../systems/Tilemap'
import {
  createPlayerAnimations,
  createEnemyAnimations,
  getDirectionFromVelocity
} from '../systems/AnimationManager'
import { NPCManager } from '../systems/NPCManager'
import { updateHomingOrbs, Projectile } from '../systems/Projectile'
import { events } from '../systems/Events'
import { EventTriggerManager, EventTrigger, TriggerResult } from '../systems/EventTriggerManager'
import { Boss } from '../types/BossTypes'
import { makeBoss, updateBossAI } from '../systems/BossAI'
import { AudioBus } from '../systems/AudioBus'
import { BossHpUI } from '../systems/BossHpUI'
import { BossSpeechBubble } from '../systems/BossSpeechBubble'
import { CutinSystem } from '../systems/CutinSystem'
import { logger } from '../utils/Logger'
import { VirtualJoystick } from '../ui/VirtualJoystick'
import { AttackButton } from '../ui/AttackButton'
import { BGMManager } from '../systems/BGMManager'
import { PauseMenu } from '../ui/PauseMenu'
import { GameStateManager } from '../systems/GameStateManager'

export default class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private npcManager!: NPCManager
  private enemies: EnemyWithAI[] = []
  private archers: Archer[] = []
  private mages: Mage[] = []
  private brutes: Brute[] = []
  private walls!: Phaser.Physics.Arcade.StaticGroup
  private hitbox!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
  private ui!: DialogUI
  private playerDirection: string = 'down' // プレイヤーの現在の向き
  private isAttacking: boolean = false // 攻撃中フラグ
  private projectiles!: Phaser.Physics.Arcade.Group
  private hpText!: Phaser.GameObjects.Text // HP表示テキスト
  private isGameOver: boolean = false // ゲームオーバーフラグ
  private gameOverText?: Phaser.GameObjects.Text // ゲームオーバーテキスト
  private isGameCleared: boolean = false // ゲームクリアフラグ
  private eventTriggerManager?: EventTriggerManager // イベントトリガー管理
  private currentMapId: string = 'demo_map' // 現在のマップID
  private currentMapData: Record<string, unknown> | null = null // 現在のマップデータ
  private colliders: Phaser.Physics.Arcade.Collider[] = [] // 衝突判定の配列

  // ボス関連
  private boss: Boss | null = null
  private audioBus!: AudioBus
  private bossHpUI: BossHpUI | null = null
  private bossSpeechBubble!: BossSpeechBubble
  private cutinSystem!: CutinSystem

  // マウス/タッチ操作UI
  private virtualJoystick: VirtualJoystick | null = null
  private attackButton: AttackButton | null = null

  // タイトル画面・ポーズメニュー関連
  private bgmManager?: BGMManager
  private pauseMenu?: PauseMenu
  private escKey?: Phaser.Input.Keyboard.Key

  constructor() { super('MainScene') }

  // preloadはLoadingSceneで実行済み
  // 全アセットは既にキャッシュに格納されている

  create() {
    // アニメーション定義
    createPlayerAnimations(this, 'hero')
    createEnemyAnimations(this, 'blob')
    createEnemyAnimations(this, 'archer')
    createEnemyAnimations(this, 'mage')
    createEnemyAnimations(this, 'brute')

    // タイルマップを読み込み→壁と床を配置
    const mapData = this.cache.json.get('demo_map')
    const { worldW, worldH, walls } = buildMapFromJSON(this, mapData)
    this.walls = walls

    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.physics.world.setBounds(0, 0, worldW, worldH)

    // プレイヤー（64x64スプライト）
    this.player = this.physics.add.sprite(40 * TILE, 40 * TILE, 'hero')
    ;(this.player as any).speed = 260
    ;(this.player as any).hp = 100
    this.player.setCollideWorldBounds(true)
    this.player.setDepth(10) // プレイヤーを前面に表示
    this.player.play('hero-walk-down') // 初期アニメ

    // 飛び道具グループ初期化
    this.projectiles = this.physics.add.group()

    // ボスシステム初期化
    this.audioBus = new AudioBus(this)
    this.bossSpeechBubble = new BossSpeechBubble(this)
    this.cutinSystem = new CutinSystem(this)

    // DialogUI初期化
    this.ui = new DialogUI(this)

    // NPCマネージャー初期化
    this.npcManager = new NPCManager(this, this.ui)
    this.npcManager.loadNPCs('npc_config', this.currentMapId)
    const npcColliders = this.npcManager.setupCollisions(this.player)
    this.colliders.push(...npcColliders)

    // HP表示を先に作成（DialogUIより前）
    this.createHPDisplay()

    // ログダウンロードボタンを作成
    this.createLogDownloadButton()

    // 仮想ジョイスティックと攻撃ボタンを作成
    this.createVirtualControls()

    // プレイヤーと壁の衝突判定を設定
    const playerWallCollider = this.physics.add.collider(this.player, this.walls)
    this.colliders.push(playerWallCollider)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // 攻撃ヒットボックス
    this.hitbox = this.add.rectangle(0, 0, 48, 48, 0xffffff, 0) as any
    this.physics.add.existing(this.hitbox)
    ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false)

    // 敵とイベントトリガーを初期化
    this.initializeEnemiesAndTriggers(mapData)

    // 攻撃アニメ完了時のイベント
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key.startsWith('hero-atk-')) {
        this.isAttacking = false
        // 攻撃終了後、現在の方向の歩行アニメに戻る
        this.player.play(`hero-walk-${this.playerDirection}`)
      }
    })

    // 攻撃判定とアニメの同期
    this.player.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (anim.key.startsWith('hero-atk-')) {
        const f = frame.index % 4 // 0..3
        const active = (f === 1 || f === 2) // 真ん中の2フレームのみ有効
        ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(active)
      }
    })

    this.spaceKey.on('down', () => {
      if (this.ui.visible) {
        this.ui.next()
        return
      }

      // NPCとの対話を試みる
      if (this.npcManager.tryInteract(this.player, 80)) {
        return
      }

      // NPCが近くにいない場合は攻撃
      this.doAttack()
    })

    // BGMManagerの初期化
    this.bgmManager = new BGMManager(this, this.audioBus)
    console.log('[MainScene] BGMManager initialized')

    // PauseMenuの初期化
    this.pauseMenu = new PauseMenu(this)
    this.pauseMenu.setBackToTitleCallback(() => {
      // ゲーム状態をリセットしてタイトルに戻る
      GameStateManager.reset(this)
      this.scene.start('TitleScene')
    })
    console.log('[MainScene] PauseMenu initialized')

    // Escキーの登録
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    console.log('[MainScene] ESC key registered')

    // マップロード完了イベントを発火（初回マップロード）
    events.emit('map-loaded', this.currentMapId)
    console.log('[MainScene] Initial map loaded event emitted:', this.currentMapId)

    // シャットダウン時のクリーンアップ
    this.events.once('shutdown', () => {
      if (this.bgmManager) {
        this.bgmManager.destroy()
      }
      if (this.pauseMenu) {
        this.pauseMenu.destroy()
      }
      console.log('[MainScene] Cleanup complete')
    })
  }

  private createHPDisplay() {
    // HP表示テキストを作成（カメラに固定）- 初期テキストを設定
    const initialText = 'HP: 100/100'
    this.hpText = this.add.text(20, 20, initialText, {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'Courier New, monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#000000',
        blur: 4,
        fill: true
      }
    })

    // 固定表示の設定
    this.hpText.setScrollFactor(0, 0)
    this.hpText.setOrigin(0, 0)
    this.hpText.setDepth(10000)

    // デバッグログ（初期化確認用）
    console.log('HP Display created at position:', this.hpText.x, this.hpText.y)

    this.updateHPDisplay()
  }

  private createLogDownloadButton() {
    // ログダウンロードボタンを作成（画面右上、カメラに固定）
    const buttonText = this.add.text(GAME_W - 200, 20, '[LOG DL]', {
      fontSize: '24px',
      color: '#00ff00',
      fontFamily: 'Courier New, monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      backgroundColor: '#00000088',
      padding: { x: 12, y: 8 }
    })

    buttonText.setScrollFactor(0, 0)
    buttonText.setOrigin(0, 0)
    buttonText.setDepth(10000)
    buttonText.setInteractive({ useHandCursor: true })

    // ホバー時の色変更
    buttonText.on('pointerover', () => {
      buttonText.setColor('#ffff00')
    })

    buttonText.on('pointerout', () => {
      buttonText.setColor('#00ff00')
    })

    // クリック時にログをダウンロード
    buttonText.on('pointerdown', () => {
      console.log('[MainScene] Log download button clicked')
      logger.downloadLogs()
      buttonText.setColor('#ff00ff')
      this.time.delayedCall(200, () => {
        buttonText.setColor('#00ff00')
      })
    })

    console.log('[MainScene] Log download button created')
  }

  private createVirtualControls() {
    // 仮想ジョイスティック（画面左下）
    this.virtualJoystick = new VirtualJoystick(this, 150, GAME_H - 150)

    // 攻撃ボタン（画面右下）
    this.attackButton = new AttackButton(this, GAME_W - 150, GAME_H - 150)
    this.attackButton.setOnAttack(() => {
      this.performAttack()
    })

    console.log('[MainScene] Virtual controls created')
  }

  update(time: number, delta: number) {
    // Escキーでポーズメニューの表示/非表示を切り替え
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (this.pauseMenu) {
        if (this.pauseMenu.isShowing()) {
          this.pauseMenu.hide()
        } else {
          this.pauseMenu.show()
        }
      }
    }

    // ポーズメニュー表示中は処理を停止
    if (this.pauseMenu && this.pauseMenu.isShowing()) {
      this.player.setVelocity(0)
      return
    }

    // ゲームオーバー時は処理を停止
    if (this.isGameOver) {
      this.player.setVelocity(0)
      return
    }

    if (this.ui.visible) {
      this.player.setVelocity(0)
      if (this.player.anims.currentAnim && !this.isAttacking) {
        this.player.anims.pause()
      }
      return
    } else {
      if (this.player.anims.currentAnim && !this.isAttacking) {
        this.player.anims.resume()
      }
    }

    // ボスAI更新
    if (this.boss && this.boss.state !== 'defeated') {
      updateBossAI(
        this,
        this.boss,
        this.player,
        this.projectiles,
        this.audioBus,
        this.cutinSystem,
        this.bossSpeechBubble,
        time,
        delta
      )

      // ボスHP表示を更新
      if (this.bossHpUI) {
        this.bossHpUI.update(this.boss.hp, this.boss.maxHp, this.boss.phase)
      }
    }

    // 誘導魔法弾の更新
    updateHomingOrbs(this)

    // 飛び道具とプレイヤーの衝突判定（動的に処理）
    this.physics.world.colliders.getActive().forEach((collider) => {
      // 既存のコライダーを維持
    })

    // すべての画像オブジェクトをチェックして飛び道具との衝突を検出
    this.children.list.forEach((obj) => {
      if (obj instanceof Phaser.Physics.Arcade.Image) {
        const img = obj as Phaser.Physics.Arcade.Image
        if ((img.texture.key === 'arrow' || img.texture.key === 'orb') && img.active) {
          // プレイヤーとの衝突チェック
          if (this.physics.overlap(img, this.player)) {
            if (!this.player.getData('hitCool') && !this.isGameOver) {
              const damage = (img as any).damage || 1
              const oldHP = (this.player as any).hp
              console.log('===== NEW CODE VERSION 2.0 RUNNING =====')
              console.log('Before damage:', oldHP, 'Damage:', damage)

              // HPを減らす（0未満にならないように）
              const newHP = Math.max(0, oldHP - damage)
              ;(this.player as any).hp = newHP

              console.log('After damage:', newHP)
              console.log(`Player hit by ${img.texture.key}! HP: ${oldHP} -> ${newHP}`)

              this.updateHPDisplay() // HP表示を更新
              this.player.setTint(0xffaaaa)
              this.player.setData('hitCool', true)
              this.time.delayedCall(120, () => this.player.clearTint())
              this.time.delayedCall(500, () => this.player.setData('hitCool', false))
              img.destroy()

              // HPが0になったらゲームオーバー
              if (newHP <= 0) {
                console.log('===== TRIGGERING GAME OVER =====')
                this.triggerGameOver()
              }
            }
          }

          // 壁との衝突チェック
          if (this.walls && this.walls.active) {
            this.physics.overlap(img, this.walls, () => {
              img.destroy()
            })
          }
        }
      }
    })

    // イベントトリガーのチェック
    if (this.eventTriggerManager && !this.ui.visible) {
      const result = this.eventTriggerManager.checkTrigger(
        this.player.x,
        this.player.y,
        TILE
      )

      if (result) {
        if (result.type === 'story' && result.storyId) {
          console.log(`[MainScene] Story event triggered: ${result.storyId}`)
          // ゲームを一時停止してストーリーシーンを起動
          this.scene.launch('StoryScene', { id: result.storyId })
          this.scene.pause()

          // ストーリー終了時にゲームを再開
          events.once('story:end', () => {
            console.log('[MainScene] Event story ended, resuming game')
            this.scene.resume()
          })
        } else if (result.type === 'teleport' && result.targetMap) {
          console.log(`[MainScene] Teleport triggered: ${result.targetMap} (${result.targetX}, ${result.targetY})`)
          // マップを切り替え
          this.switchMap(result.targetMap, result.targetX || 0, result.targetY || 0)
        }
      }
    }

    // 攻撃中は移動不可
    if (this.isAttacking) {
      this.player.setVelocity(0)
      return
    }

    const speed: number = (this.player as any).speed

    // キーボード入力
    let vx = (this.cursors.left?.isDown ? -1 : this.cursors.right?.isDown ? 1 : 0)
    let vy = (this.cursors.up?.isDown ? -1 : this.cursors.down?.isDown ? 1 : 0)

    // ジョイスティック入力（キーボード入力がない場合のみ）
    if (vx === 0 && vy === 0 && this.virtualJoystick && this.virtualJoystick.active) {
      const joystickVector = this.virtualJoystick.getVector()
      vx = joystickVector.x
      vy = joystickVector.y
    }

    const v = new Phaser.Math.Vector2(vx, vy)

    if (v.lengthSq() > 0) {
      v.normalize().scale(speed)
      this.player.setVelocity(v.x, v.y)

      // 移動方向を取得
      const direction = getDirectionFromVelocity(v.x, v.y)
      this.playerDirection = direction

      // 移動アニメを再生
      const targetAnim = `hero-walk-${direction}`
      if (this.player.anims.currentAnim?.key !== targetAnim) {
        this.player.play(targetAnim, true)
      }
    } else {
      this.player.setVelocity(0, 0)
      // 停止時はアニメを一時停止
      if (this.player.anims.currentAnim && !this.player.anims.currentAnim.key.startsWith('hero-atk-')) {
        this.player.anims.pause()
      }
    }

    // 敵のAI更新とアニメ
    this.enemies.forEach(en => {
      if (!en.active) return

      const prevVx = en.body.velocity.x
      const prevVy = en.body.velocity.y

      updateEnemyAI(this, en, this.player)

      // 敵の移動アニメ
      if (en.body.velocity.x !== 0 || en.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(en.body.velocity.x, en.body.velocity.y)
        const targetAnim = `blob-walk-${dir}`
        if (en.anims.currentAnim?.key !== targetAnim) {
          en.play(targetAnim, true)
        }
      } else {
        if (en.anims.currentAnim) {
          en.anims.pause()
        }
      }
    })

    // Archerの更新
    this.archers.forEach(archer => {
      if (!archer.active) return
      updateArcherAI(this, archer, this.player)

      // アニメーション更新
      if (archer.body.velocity.x !== 0 || archer.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(archer.body.velocity.x, archer.body.velocity.y)
        const targetAnim = `archer-walk-${dir}`
        if (archer.anims.currentAnim?.key !== targetAnim) {
          archer.play(targetAnim, true)
        }
      } else {
        // 停止中は攻撃アニメの可能性があるのでチェック
        if (archer.state === 'aim' || archer.state === 'shoot') {
          const dir = this.getDirectionToPlayer(archer)
          const targetAnim = `archer-atk-${dir}`
          if (archer.anims.currentAnim?.key !== targetAnim) {
            archer.play(targetAnim, false)
          }
        } else if (archer.anims.currentAnim && !archer.anims.currentAnim.key.includes('atk')) {
          archer.anims.pause()
        }
      }
    })

    // Mageの更新
    this.mages.forEach(mage => {
      if (!mage.active) return
      updateMageAI(this, mage, this.player)

      // アニメーション更新
      if (mage.body.velocity.x !== 0 || mage.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(mage.body.velocity.x, mage.body.velocity.y)
        const targetAnim = `mage-walk-${dir}`
        if (mage.anims.currentAnim?.key !== targetAnim) {
          mage.play(targetAnim, true)
        }
      } else {
        // 停止中は詠唱アニメの可能性
        if (mage.state === 'aim' || mage.state === 'cast' || mage.state === 'shoot') {
          const dir = this.getDirectionToPlayer(mage)
          const targetAnim = `mage-atk-${dir}`
          if (mage.anims.currentAnim?.key !== targetAnim) {
            mage.play(targetAnim, false)
          }
        } else if (mage.anims.currentAnim && !mage.anims.currentAnim.key.includes('atk')) {
          mage.anims.pause()
        }
      }
    })

    // Bruteの更新
    this.brutes.forEach(brute => {
      if (!brute.active) return
      updateBruteAI(this, brute, this.player)

      // アニメーション更新
      if (brute.state === 'dash') {
        const dir = getDirectionFromVelocity(brute.body.velocity.x, brute.body.velocity.y)
        const targetAnim = `brute-atk-${dir}`
        if (brute.anims.currentAnim?.key !== targetAnim) {
          brute.play(targetAnim, true)
        }
      } else if (brute.body.velocity.x !== 0 || brute.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(brute.body.velocity.x, brute.body.velocity.y)
        const targetAnim = `brute-walk-${dir}`
        if (brute.anims.currentAnim?.key !== targetAnim) {
          brute.play(targetAnim, true)
        }
      } else {
        if (brute.anims.currentAnim && !brute.anims.currentAnim.key.includes('atk')) {
          brute.anims.pause()
        }
      }
    })
  }

  /**
   * ゲームクリア処理（ボス撃破時などに呼び出す）
   */
  private triggerGameClear() {
    console.log('triggerGameClear called!')

    if (this.isGameCleared) {
      return // 既にクリア済み
    }

    this.isGameCleared = true

    // プレイヤーを停止
    this.player.setVelocity(0)

    // フェードアウト完了時の処理
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      console.log('[MainScene] Fade out complete, launching clear story')

      // ストーリーシーンを起動
      this.scene.launch('StoryScene', { id: 'clear' })
      this.scene.pause()

      // ストーリー終了後の処理
      events.once('story:end', (data: { id: string }) => {
        if (data.id === 'clear') {
          console.log('[MainScene] Clear story ended')
          // ゲームをリスタート
          this.scene.restart()
        }
      })
    })

    // クリア演出（フェードアウト）
    this.cameras.main.fadeOut(800, 0, 0, 0)
  }

  private getDirectionToPlayer(enemy: Phaser.GameObjects.Sprite): string {
    const dx = this.player.x - enemy.x
    const dy = this.player.y - enemy.y
    return getDirectionFromVelocity(dx, dy)
  }

  private makeAnimatedEnemy(x: number, y: number): EnemyWithAI {
    const en = this.physics.add.sprite(x, y, 'blob') as EnemyWithAI
    en.state = 'patrol'
    en.speed = 180
    en.hp = 3
    en.patrolPoints = [new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + 10 * 32, y)]
    en.patrolIndex = 0
    en.play('blob-walk-down') // 初期アニメ
    return en
  }

  private makeAnimatedArcher(x: number, y: number): Archer {
    const archer = makeArcher(this, x, y)
    archer.play('archer-walk-down')
    return archer
  }

  private makeAnimatedMage(x: number, y: number): Mage {
    const mage = makeMage(this, x, y)
    mage.play('mage-walk-down')
    return mage
  }

  private makeAnimatedBrute(x: number, y: number): Brute {
    const brute = makeBrute(this, x, y)
    brute.play('brute-walk-down')
    return brute
  }

  private doAttack() {
    if (this.isAttacking) return // 攻撃中は攻撃不可

    this.isAttacking = true

    // 攻撃アニメを再生
    this.player.play(`hero-atk-${this.playerDirection}`)

    // ヒットボックスを配置
    const dir = this.getFacingVector()
    const off = 40
    this.hitbox.x = this.player.x + dir.x * off
    this.hitbox.y = this.player.y + dir.y * off

    // アニメ完了後にヒットボックスを無効化
    this.time.delayedCall(300, () => {
      ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false)
    })
  }

  /**
   * 攻撃ボタン用のラッパーメソッド
   */
  private performAttack() {
    this.doAttack()
  }

  private getFacingVector() {
    if (this.playerDirection === 'left') return new Phaser.Math.Vector2(-1, 0)
    if (this.playerDirection === 'right') return new Phaser.Math.Vector2(1, 0)
    if (this.playerDirection === 'up') return new Phaser.Math.Vector2(0, -1)
    if (this.playerDirection === 'down') return new Phaser.Math.Vector2(0, 1)
    return new Phaser.Math.Vector2(0, 1)
  }

  private updateHPDisplay() {
    if (!this.player || !this.hpText) {
      console.warn('updateHPDisplay: player or hpText is null!', { player: this.player, hpText: this.hpText })
      return
    }

    const currentHP = (this.player as any).hp || 0
    const maxHP = 100 // 最大HP

    // パーセンテージバー表示（20個の█で100%を表現）
    const barLength = 20
    const filledCount = Math.floor((currentHP / maxHP) * barLength)
    const filledBars = '█'.repeat(Math.max(0, filledCount))
    const emptyBars = '░'.repeat(Math.max(0, barLength - filledCount))

    const newText = `HP: ${currentHP}/${maxHP} [${filledBars}${emptyBars}]`
    this.hpText.setText(newText)
    // console.log('HP Display updated:', newText) // デバッグ用（通常はコメントアウト）

    // HPに応じて色を変更
    if (currentHP <= 20) {
      this.hpText.setColor('#ff0000') // 赤（危険）
    } else if (currentHP <= 40) {
      this.hpText.setColor('#ffaa00') // オレンジ（警告）
    } else {
      this.hpText.setColor('#ffffff') // 白（正常）
    }
  }

  private triggerGameOver() {
    console.log('triggerGameOver called! isGameOver:', this.isGameOver)

    if (this.isGameOver) {
      console.log('Already game over, returning')
      return // 既にゲームオーバーの場合は何もしない
    }

    this.isGameOver = true
    console.log('=== GAME OVER ===')

    // プレイヤーを停止
    this.player.setVelocity(0)

    // フェードアウト完了時の処理
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      console.log('[MainScene] Fade out complete, launching gameover story')

      // ストーリーシーンを起動
      this.scene.launch('StoryScene', { id: 'gameover' })
      this.scene.pause()

      // ストーリー終了後の処理
      events.once('story:end', (data: { id: string }) => {
        if (data.id === 'gameover') {
          console.log('[MainScene] GameOver story ended')
          // ゲームをリスタート
          this.scene.restart()
        }
      })
    })

    // ゲームオーバー演出（フェードアウト）
    this.cameras.main.fadeOut(800, 0, 0, 0)
  }

  /**
   * 敵とイベントトリガーを初期化
   * @param mapData マップデータ
   */
  private initializeEnemiesAndTriggers(mapData: any) {
    // 敵をスポーン
    const enemySpawns = mapData.enemySpawns as Array<{ x: number; y: number }> || []
    enemySpawns.forEach((spawn) => {
      const enemyType = Math.floor(Math.random() * 4) // 0-3でランダムに敵タイプを選択
      if (enemyType === 0) {
        this.enemies.push(this.makeAnimatedEnemy(spawn.x * TILE, spawn.y * TILE))
      } else if (enemyType === 1) {
        this.archers.push(this.makeAnimatedArcher(spawn.x * TILE, spawn.y * TILE))
      } else if (enemyType === 2) {
        this.mages.push(this.makeAnimatedMage(spawn.x * TILE, spawn.y * TILE))
      } else {
        this.brutes.push(this.makeAnimatedBrute(spawn.x * TILE, spawn.y * TILE))
      }
    })

    // 敵と壁の衝突判定を設定
    this.enemies.forEach(en => {
      const collider = this.physics.add.collider(en, this.walls)
      this.colliders.push(collider)
      // 攻撃判定を設定
      const hitCollider = this.physics.add.overlap(this.hitbox, en, () => {
        if (!en.getData('hitCool')) {
          en.hp -= 1
          en.setTint(0xffffaa)
          en.setData('hitCool', true)
          this.time.delayedCall(120, () => en.clearTint())
          this.time.delayedCall(250, () => en.setData('hitCool', false))
          if (en.hp <= 0) {
            en.disableBody(true, true)
          }
        }
      })
      this.colliders.push(hitCollider)
    })
    this.archers.forEach(ar => {
      const collider = this.physics.add.collider(ar, this.walls)
      this.colliders.push(collider)
      this.setupEnemyHit(ar) // 攻撃判定を設定
    })
    this.mages.forEach(mg => {
      const collider = this.physics.add.collider(mg, this.walls)
      this.colliders.push(collider)
      this.setupEnemyHit(mg) // 攻撃判定を設定
    })
    this.brutes.forEach(br => {
      const collider = this.physics.add.collider(br, this.walls)
      this.colliders.push(collider)
      this.setupEnemyHit(br) // 攻撃判定を設定
    })

    // イベントトリガーを初期化
    const eventTriggers = mapData.eventTriggers as EventTrigger[] || []
    if (eventTriggers.length > 0) {
      this.eventTriggerManager = new EventTriggerManager(this, eventTriggers, TILE)
      console.log(`[MainScene] Initialized ${eventTriggers.length} event triggers`)
    }
  }

  /**
   * 敵との攻撃判定を設定
   * @param en 敵スプライト
   */
  private setupEnemyHit(en: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & { hp: number }) {
    const hitCollider = this.physics.add.overlap(this.hitbox, en, () => {
      if (!en.getData('hitCool')) {
        en.hp -= 1
        en.setTint(0xffffaa)
        en.setData('hitCool', true)
        this.time.delayedCall(120, () => en.clearTint())
        this.time.delayedCall(250, () => en.setData('hitCool', false))
        if (en.hp <= 0) {
          en.disableBody(true, true)
        }
      }
    })
    this.colliders.push(hitCollider)

    // Bruteの突進攻撃による接触ダメージ
    if ((en as any).enemyType === 'brute') {
      const bruteCollider = this.physics.add.overlap(this.player, en, () => {
        const brute = en as Brute
        if (brute.state === 'dash' && !this.player.getData('hitCool') && !this.isGameOver) {
          const oldHP = (this.player as any).hp
          ;(this.player as any).hp = Math.max(0, oldHP - 2)
          const newHP = (this.player as any).hp
          console.log(`Player hit by Brute dash! HP: ${oldHP} -> ${newHP}`)
          this.updateHPDisplay() // HP表示を更新
          this.player.setTint(0xffaaaa)
          this.player.setData('hitCool', true)
          this.time.delayedCall(120, () => this.player.clearTint())
          this.time.delayedCall(1000, () => this.player.setData('hitCool', false))

          // HPが0になったらゲームオーバー
          if (newHP <= 0) {
            this.triggerGameOver()
          }
        }
      })
      this.colliders.push(bruteCollider)
    }
  }

  /**
   * マップを切り替える
   * @param mapId 移動先のマップID
   * @param targetX 移動先のタイルX座標
   * @param targetY 移動先のタイルY座標
   */
  private switchMap(mapId: string, targetX: number, targetY: number) {
    console.log(`[MainScene] Switching to map: ${mapId} at (${targetX}, ${targetY})`)

    // 最初にすべての衝突判定を破棄（オブジェクトを破棄する前に）
    this.colliders.forEach(collider => {
      if (collider && collider.active) {
        collider.destroy()
      }
    })
    this.colliders = []

    // 既存の敵を破棄
    this.enemies.forEach(enemy => {
      if (enemy) {
        enemy.destroy()
      }
    })
    this.enemies = []

    this.archers.forEach(archer => {
      if (archer) {
        archer.destroy()
      }
    })
    this.archers = []

    this.mages.forEach(mage => {
      if (mage) {
        mage.destroy()
      }
    })
    this.mages = []

    this.brutes.forEach(brute => {
      if (brute) {
        brute.destroy()
      }
    })
    this.brutes = []

    // ボスとUIを破棄
    if (this.boss) {
      this.boss.destroy()
      this.boss = null
    }

    if (this.bossHpUI) {
      this.bossHpUI.destroy()
      this.bossHpUI = null
    }

    // 飛び道具を破棄
    if (this.projectiles) {
      this.projectiles.clear(true, true)
    }

    // 既存のマップオブジェクト（床と壁）を破棄
    // 床のタイルスプライトを削除
    const tileSprites = this.children.list.filter(obj => obj.type === 'TileSprite')
    tileSprites.forEach(sprite => sprite.destroy())

    // 壁を破棄
    if (this.walls) {
      this.walls.clear(true, true)
      this.walls.destroy()
    }

    // イベントトリガーマネージャーを破棄
    if (this.eventTriggerManager) {
      this.eventTriggerManager.destroy()
      this.eventTriggerManager = undefined
    }

    // NPCを破棄
    if (this.npcManager) {
      this.npcManager.destroy()
    }

    // 新しいマップをロード
    this.loadMap(mapId)

    // プレイヤーを移動先に配置
    this.player.setPosition(targetX * TILE, targetY * TILE)
    this.player.setDepth(10) // プレイヤーを前面に表示

    // カメラを追従させる
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    // マップロード完了イベントを発火（BGM切り替え用）
    events.emit('map-loaded', mapId)
    console.log('[MainScene] Map loaded event emitted:', mapId)
  }

  /**
   * マップをロードして構築
   * @param mapId マップID
   */
  private loadMap(mapId: string) {
    console.log(`[MainScene] Loading map: ${mapId}`)

    // マップデータを取得
    const mapData = this.cache.json.get(mapId)
    if (!mapData) {
      console.error(`Map data not found: ${mapId}`)
      return
    }

    this.currentMapId = mapId
    this.currentMapData = mapData

    // タイルマップを構築
    const result = buildMapFromJSON(this, mapData)
    this.walls = result.walls

    // カメラと物理世界の境界を更新
    this.cameras.main.setBounds(0, 0, result.worldW, result.worldH)
    this.physics.world.setBounds(0, 0, result.worldW, result.worldH)

    // プレイヤーと壁の衝突を設定
    const playerWallCollider = this.physics.add.collider(this.player, this.walls)
    this.colliders.push(playerWallCollider)

    // ボス生成（boss_mapの場合のみ）
    if (mapId === 'boss_map') {
      this.spawnBoss()
    }

    // 敵とイベントトリガーを初期化
    this.initializeEnemiesAndTriggers(mapData)

    // NPCを再初期化
    this.npcManager.loadNPCs('npc_config', mapId)
    const npcColliders = this.npcManager.setupCollisions(this.player)
    this.colliders.push(...npcColliders)

    console.log(`[MainScene] Map loaded: ${mapId}`)
  }

  /**
   * ボス生成
   */
  private spawnBoss() {
    console.log('[MainScene] Spawning boss...')

    // ボス生成（マップ中央に配置）
    const bossX = 25 * TILE
    const bossY = 25 * TILE
    this.boss = makeBoss(this, bossX, bossY, 'volg_boss')

    // ボスと壁の衝突判定
    const bossWallCollider = this.physics.add.collider(this.boss, this.walls)
    this.colliders.push(bossWallCollider)

    // ボスとプレイヤーの被ダメージ処理
    this.setupBossHit()

    // ボスHP UI表示
    this.bossHpUI = new BossHpUI(this, this.boss.name)
    this.bossHpUI.show()
    this.bossHpUI.update(this.boss.hp, this.boss.maxHp, this.boss.phase)

    console.log(`[MainScene] Boss spawned: ${this.boss.name}`)
  }

  /**
   * ボスとの攻撃判定を設定
   */
  private setupBossHit() {
    if (!this.boss) return

    // プレイヤー→ボスへの攻撃判定
    const playerAttackCollider = this.physics.add.overlap(this.hitbox, this.boss, () => {
      if (!this.boss || !this.boss.active) return

      if (!this.boss.getData('hitCool')) {
        // ダメージ処理
        const oldHP = this.boss.hp
        this.boss.hp -= 1
        console.log(`[MainScene] Boss damaged! HP: ${oldHP} -> ${this.boss.hp} (Phase: ${this.boss.phase})`)
        this.boss.setTint(0xffffaa)
        this.boss.setData('hitCool', true)

        // SE再生
        if (this.boss.config.se.damage) {
          this.audioBus.playSe(this.boss.config.se.damage, { volume: 0.7 })
        }

        this.time.delayedCall(120, () => {
          if (this.boss) this.boss.clearTint()
        })
        this.time.delayedCall(250, () => {
          if (this.boss) this.boss.setData('hitCool', false)
        })

        // HP0で撃破
        if (this.boss.hp <= 0) {
          this.defeatBoss()
        }
      }
    })
    this.colliders.push(playerAttackCollider)

    // ボス→プレイヤーへの接触ダメージ（突進中）
    const bossContactCollider = this.physics.add.overlap(this.player, this.boss, () => {
      if (!this.boss || !this.boss.active) return

      const dashDamage = this.boss.getData('dashDamage') || 0
      if (dashDamage > 0 && !this.player.getData('hitCool') && !this.isGameOver) {
        const oldHP = (this.player as any).hp
        ;(this.player as any).hp = Math.max(0, oldHP - dashDamage)

        console.log(`Player hit by boss dash! HP: ${oldHP} -> ${(this.player as any).hp}`)

        this.updateHPDisplay()
        this.player.setTint(0xffaaaa)
        this.player.setData('hitCool', true)
        this.time.delayedCall(120, () => this.player.clearTint())
        this.time.delayedCall(500, () => this.player.setData('hitCool', false))

        // HPが0になったらゲームオーバー
        if ((this.player as any).hp <= 0) {
          this.triggerGameOver()
        }
      }
    })
    this.colliders.push(bossContactCollider)
  }

  /**
   * ボス撃破処理
   */
  private defeatBoss() {
    if (!this.boss) return

    console.log('[MainScene] Boss defeated!')

    this.boss.state = 'defeated'

    // 撃破SE再生
    if (this.boss.config.se.defeat) {
      this.audioBus.playSe(this.boss.config.se.defeat, { volume: 0.8 })
    }

    // 撃破セリフ
    if (this.boss.config.speeches.defeat) {
      this.bossSpeechBubble.show(this.boss, this.boss.config.speeches.defeat, 2000)
    }

    // ボスHP UI非表示
    if (this.bossHpUI) {
      this.bossHpUI.hide()
    }

    // フェードアウト演出
    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      scale: 6,
      duration: 1500,
      onComplete: () => {
        if (this.boss) {
          this.boss.disableBody(true, true)
        }
        // ゲームクリア
        this.triggerGameClear()
      }
    })
  }
}
