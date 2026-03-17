import Phaser from 'phaser'
import { GAME_W, GAME_H, TILE } from '../config'
import DialogUI from '../systems/Dialog'
import {
  updateEnemyAI,
  EnemyWithAI,
  Archer,
  Mage,
  Brute,
  makeArcher,
  makeMage,
  makeBrute,
  makeEnemy,
  updateArcherAI,
  updateMageAI,
  updateBruteAI,
  EnemyDialogs,
  EnemyOverrides,
} from '../systems/EnemyAI'
import { EnemySpeech } from '../systems/EnemySpeech'
import { buildMapFromJSON } from '../systems/Tilemap'
import type { TileDef, MapData } from '../types/tileset'
import {
  createPlayerAnimations,
  createEnemyAnimations,
  getDirectionFromVelocity
} from '../systems/AnimationManager'
import { NPCManager } from '../systems/NPCManager'
import { updateHomingOrbs, FireBall, type Projectile } from '../systems/Projectile'
import { events } from '../systems/Events'
import { EventTriggerManager } from '../systems/EventTriggerManager'
import { Boss } from '../types/BossTypes'
import { makeBoss, updateBossAI } from '../systems/BossAI'
import { AudioBus } from '../systems/AudioBus'
import { BossHpUI } from '../systems/BossHpUI'
import { BossSpeechBubble } from '../systems/BossSpeechBubble'
import { CutinSystem } from '../systems/CutinSystem'
import { logger } from '../utils/Logger'
import { AttackButton } from '../ui/AttackButton'
import { BGMManager } from '../systems/BGMManager'
import { PauseMenu } from '../ui/PauseMenu'
import { GameStateManager } from '../systems/GameStateManager'
import { GameFlowManager } from '../systems/GameFlowManager'
import { PortalManager } from '../systems/PortalManager'
import type { FullPortalData } from '../systems/PortalManager'
import type { ThenAction } from '../types/GameFlowTypes'

export default class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private spaceKey!: Phaser.Input.Keyboard.Key
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private npcManager!: NPCManager
  private enemies: EnemyWithAI[] = []
  private archers: Archer[] = []
  private mages: Mage[] = []
  private brutes: Brute[] = []
  private walls?: Phaser.Physics.Arcade.StaticGroup
  private hitbox!: Phaser.GameObjects.Rectangle & { body: Phaser.Physics.Arcade.Body }
  private ui!: DialogUI
  private playerDirection: string = 'down'
  private isAttacking: boolean = false
  private isSpecialAttacking: boolean = false
  private isRightMouseHeld: boolean = false
  private projectiles!: Phaser.Physics.Arcade.Group
  private hpText!: Phaser.GameObjects.Text
  private isGameOver: boolean = false
  private gameOverText?: Phaser.GameObjects.Text
  private isGameCleared: boolean = false
  private eventTriggerManager?: EventTriggerManager
  private portalManager?: PortalManager
  private currentMapId: string = ''
  private currentMapData: Record<string, unknown> | null = null
  private colliders: Phaser.Physics.Arcade.Collider[] = []

  // ボス関連
  private boss: Boss | null = null
  private audioBus!: AudioBus
  private bossHpUI: BossHpUI | null = null
  private bossSpeechBubble!: BossSpeechBubble
  private cutinSystem!: CutinSystem

  // マウス/タッチ操作UI
  private attackButton: AttackButton | null = null
  private isMouseMoving: boolean = false
  private mouseWorldX: number = 0
  private mouseWorldY: number = 0

  // 火炎放射
  private firePool!: Phaser.Physics.Arcade.Group
  private lastFireTime: number = 0
  private flameIsPlaying: boolean = false
  private readonly FIRE_INTERVAL = 50
  private readonly FIRE_SPEED    = 600
  private readonly FIRE_RANGE    = 333

  // タイトル画面・ポーズメニュー関連
  private bgmManager?: BGMManager
  private pauseMenu?: PauseMenu
  private escKey?: Phaser.Input.Keyboard.Key

  // ゲームフロー管理
  private gameFlowManager!: GameFlowManager
  private introLaunched: boolean = false

  constructor() { super('MainScene') }

  create() {
    // シーン再起動時のステイル状態リセット（コンストラクタは再呼び出しされないため必須）
    this.enemies = []
    this.archers = []
    this.mages = []
    this.brutes = []
    this.colliders = []
    this.boss = null
    this.bossHpUI = null
    this.eventTriggerManager = undefined
    this.portalManager = undefined
    this.walls = undefined
    this.isGameOver = false
    this.isGameCleared = false
    this.currentMapId = ''
    this.currentMapData = null
    this.introLaunched = false

    // アニメーション定義
    createPlayerAnimations(this, 'hero')
    createEnemyAnimations(this, 'blob',   'solder')
    createEnemyAnimations(this, 'archer', 'vamp1')
    createEnemyAnimations(this, 'mage',   'succubus')
    createEnemyAnimations(this, 'brute',  'mage')
    // enemy-defsで指定されたspriteKeyごとにアニメーションセットを追加生成
    {
      const defsForAnims = (this.cache.json.get('enemy-defs') as { spriteKey?: string }[]) || []
      for (const d of defsForAnims) {
        if (d.spriteKey && this.textures.exists(d.spriteKey)) {
          createEnemyAnimations(this, d.spriteKey, d.spriteKey)
        }
      }
    }

    // プレイヤー（初期位置はダミー、switchMap後に正式に配置される）
    this.player = this.physics.add.sprite(40 * TILE, 40 * TILE, 'hero')
    ;(this.player as any).speed = 260
    ;(this.player as any).hp = 100
    this.player.setCollideWorldBounds(true)
    this.player.setDepth(10)
    this.player.play('hero-idle-down')

    // 飛び道具グループ初期化
    this.projectiles = this.physics.add.group()
    this.firePool = this.physics.add.group({ maxSize: 20, runChildUpdate: false })

    // 飛び道具 vs プレイヤーの永続オーバーラップ
    // physics.add.overlap(group, sprite, cb) の引数順: cb は (sprite, groupMember)
    this.physics.add.overlap(this.projectiles, this.player, (_playerObj, projObj) => {
      const proj = projObj as Projectile
      if (!proj.active) return
      if (this.player.getData('hitCool') || this.isGameOver) return
      const damage = (proj.damage as number | undefined) ?? 1
      type PlayerWithHp = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & { hp: number }
      const oldHP = (this.player as PlayerWithHp).hp
      const newHP = Math.max(0, oldHP - damage)
      ;(this.player as PlayerWithHp).hp = newHP
      this.updateHPDisplay()
      this.player.setTint(0xff4444)
      this.audioBus.playSe('se_player_hit', { volume: 0.8 })
      this.player.setData('hitCool', true)
      this.time.delayedCall(100, () => this.player.clearTint())
      this.time.delayedCall(500, () => this.player.setData('hitCool', false))
      proj.destroy()
      if (newHP <= 0) this.triggerGameOver()
    })

    // ボスシステム初期化
    this.audioBus = new AudioBus(this)
    this.bossSpeechBubble = new BossSpeechBubble(this)
    this.cutinSystem = new CutinSystem(this)

    // DialogUI初期化
    this.ui = new DialogUI(this)

    // NPCマネージャー初期化（マップロード時にNPCを読み込む）
    this.npcManager = new NPCManager(this, this.ui)

    // HP表示を先に作成
    this.createHPDisplay()

    // ログダウンロードボタンを作成
    this.createLogDownloadButton()

    // 仮想ジョイスティックと攻撃ボタンを作成
    this.createVirtualControls()

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.cameras.main.setBackgroundColor('#000000')

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    // 攻撃ヒットボックス
    this.hitbox = this.add.rectangle(0, 0, 48, 48, 0xffffff, 0) as any
    this.physics.add.existing(this.hitbox)
    ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false)

    // アニメ完了時のイベント
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key.startsWith('hero-atk-')) {
        this.isAttacking = false
        if (this.isRightMouseHeld) {
          this.isSpecialAttacking = true
          this.player.play(`hero-special-${this.playerDirection}`, true)
        } else {
          this.player.play(`hero-idle-${this.playerDirection}`)
        }
      }
    })

    // 攻撃判定とアニメの同期
    this.player.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (anim.key.startsWith('hero-atk-')) {
        const f = frame.index % 4
        const active = (f === 1 || f === 2)
        ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(active)
      }
    })

    this.spaceKey.on('down', () => {
      if (this.ui.visible) {
        this.ui.next()
        return
      }

      if (this.npcManager.tryInteract(this.player, 80)) {
        return
      }

      this.doAttack()
    })

    // GameFlowManager初期化（BGMManager より先に初期化する）
    this.gameFlowManager = new GameFlowManager(this)

    // BGMManagerの初期化
    this.bgmManager = new BGMManager(this, this.audioBus, this.gameFlowManager)
    console.log('[MainScene] BGMManager initialized')

    // PauseMenuの初期化
    this.pauseMenu = new PauseMenu(this)
    this.pauseMenu.setBackToTitleCallback(() => {
      GameStateManager.reset(this)
      this.scene.stop()
      this.scene.start('TitleScene')
    })
    console.log('[MainScene] PauseMenu initialized')

    // Escキーの登録
    this.escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    console.log('[MainScene] ESC key registered')

    // シャットダウン時のクリーンアップ
    this.events.once('shutdown', () => {
      GameStateManager.reset(this)
      if (this.bgmManager) {
        this.bgmManager.destroy()
      }
      if (this.pauseMenu) {
        this.pauseMenu.destroy()
      }
      this.enemies.forEach(en => en.speech?.destroy())
      this.archers.forEach(ar => ar.speech?.destroy())
      this.mages.forEach(mg => mg.speech?.destroy())
      this.brutes.forEach(br => br.speech?.destroy())
      console.log('[MainScene] Cleanup complete')
    })
  }

  private createHPDisplay() {
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

    this.hpText.setScrollFactor(0, 0)
    this.hpText.setOrigin(0, 0)
    this.hpText.setDepth(10000)

    console.log('HP Display created at position:', this.hpText.x, this.hpText.y)

    this.updateHPDisplay()
  }

  private createLogDownloadButton() {
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

    buttonText.on('pointerover', () => {
      buttonText.setColor('#ffff00')
    })

    buttonText.on('pointerout', () => {
      buttonText.setColor('#00ff00')
    })

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
    this.attackButton = new AttackButton(this, GAME_W - 150, GAME_H - 150)
    this.attackButton.setOnAttack(() => {
      this.performAttack()
    })

    this.setupMouseMovement()

    console.log('[MainScene] Virtual controls created')
  }

  private setupMouseMovement() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.isRightMouseHeld = true
        this.performAttack()
      }
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) {
        this.isRightMouseHeld = false
        if (this.isSpecialAttacking) {
          this.isSpecialAttacking = false
          this.player.play(`hero-idle-${this.playerDirection}`)
        }
      }
    })

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        if (!this.isPointerOnAttackButton(pointer)) {
          this.isMouseMoving = true
          this.updateMouseWorldPosition(pointer)
        }
      }
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isMouseMoving && pointer.leftButtonDown()) {
        this.updateMouseWorldPosition(pointer)
      }
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        this.isMouseMoving = false
      }
    })

    this.input.mouse?.disableContextMenu()

    console.log('[MainScene] Mouse movement controls setup complete')
  }

  private updateMouseWorldPosition(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.mouseWorldX = worldPoint.x
    this.mouseWorldY = worldPoint.y
  }

  private isPointerOnAttackButton(pointer: Phaser.Input.Pointer): boolean {
    const buttonX = GAME_W - 150
    const buttonY = GAME_H - 150
    const buttonRadius = 60

    const dx = pointer.x - buttonX
    const dy = pointer.y - buttonY
    return (dx * dx + dy * dy) < (buttonRadius * buttonRadius)
  }

  update(time: number, delta: number) {
    // 初回 update でイントロを起動（scene が RUNNING 状態であることを保証）
    if (!this.introLaunched) {
      this.introLaunched = true
      const start = this.gameFlowManager.getStartConfig()
      if (start.story) {
        this.launchStory(start.story, start.then)
      } else {
        this.executeThen(start.then)
      }
      return
    }

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
      this.isMouseMoving = false
      if (this.attackButton) {
        this.attackButton.setVisible(false)
      }
      return
    } else {
      if (this.attackButton) {
        this.attackButton.setVisible(true)
      }
    }

    // ゲームオーバー時は処理を停止
    if (this.isGameOver) {
      this.player.setVelocity(0)
      return
    }

    if (this.ui.visible) {
      this.player.setVelocity(0)
      if (!this.isAttacking && !this.isSpecialAttacking) {
        this.player.anims.pause()
      }
      return
    } else {
      if (!this.isAttacking && !this.isSpecialAttacking) {
        const idleAnim = `hero-idle-${this.playerDirection}`
        if (this.player.anims.isPaused && this.player.anims.currentAnim?.key === idleAnim) {
          this.player.anims.resume()
        }
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

      if (this.bossHpUI) {
        this.bossHpUI.update(this.boss.hp, this.boss.maxHp, this.boss.phase)
      }

      // ボスアニメーション更新
      if (this.boss.animKey) {
        const vx = this.boss.body.velocity.x
        const vy = this.boss.body.velocity.y
        const moving = Math.abs(vx) > 10 || Math.abs(vy) > 10
        const dir = getDirectionFromVelocity(vx, vy)
        if (moving) {
          const targetAnim = `${this.boss.animKey}-walk-${dir}`
          if (this.boss.anims.currentAnim?.key !== targetAnim) this.boss.play(targetAnim, true)
        } else {
          const idleAnim = `${this.boss.animKey}-idle-${dir}`
          if (this.boss.anims.currentAnim?.key !== idleAnim && !this.boss.anims.currentAnim?.key.includes('atk')) {
            this.boss.play(idleAnim, true)
          }
        }
      }
    }

    // 誘導魔法弾の更新
    updateHomingOrbs(this)

    // 火炎放射の更新
    this.updateFireBalls(time)

    // イベントトリガーのチェック
    if (this.eventTriggerManager && !this.ui.visible) {
      const result = this.eventTriggerManager.checkTrigger(
        this.player.x,
        this.player.y,
        TILE
      )

      if (result && result.type === 'story' && result.storyId) {
        console.log(`[MainScene] Story event triggered: ${result.storyId}`)
        this.launchStory(result.storyId, result.then ?? { action: 'stay' })
      }
    }

    // 攻撃中・特殊攻撃中は移動不可
    // プレイヤー移動（攻撃中はスキップ）
    if (this.isAttacking || this.isSpecialAttacking) {
      this.player.setVelocity(0)
    } else {
      const speed: number = (this.player as any).speed

      let vx = (this.cursors.left?.isDown ? -1 : this.cursors.right?.isDown ? 1 : 0)
      let vy = (this.cursors.up?.isDown ? -1 : this.cursors.down?.isDown ? 1 : 0)

      if (vx === 0 && vy === 0 && this.isMouseMoving) {
        const dx = this.mouseWorldX - this.player.x
        const dy = this.mouseWorldY - this.player.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        const arrivalThreshold = 20
        if (distance > arrivalThreshold) {
          vx = dx / distance
          vy = dy / distance
        }
      }

      const v = new Phaser.Math.Vector2(vx, vy)

      if (v.lengthSq() > 0) {
        v.normalize().scale(speed)
        this.player.setVelocity(v.x, v.y)

        const direction = getDirectionFromVelocity(v.x, v.y)
        this.playerDirection = direction

        const targetAnim = `hero-walk-${direction}`
        if (this.player.anims.currentAnim?.key !== targetAnim) {
          this.player.play(targetAnim, true)
        }
      } else {
        this.player.setVelocity(0, 0)
        const idleAnim = `hero-idle-${this.playerDirection}`
        const currentKey = this.player.anims.currentAnim?.key
        if (currentKey !== idleAnim) {
          this.player.play(idleAnim, true)
        }
      }
    }

    // 敵のAI更新とアニメ
    this.enemies.forEach(en => {
      if (!en.active) return

      if (en.getData('dead')) return
      if (en.getData('dying')) {
        en.setVelocity(0, 0)
        if (en.anims.currentAnim?.key !== `${en.animKey}-dying`) en.play(`${en.animKey}-dying`, true)
        return
      }

      updateEnemyAI(this, en, this.player)
      en.speech?.update(en)

      if (en.body.velocity.x !== 0 || en.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(en.body.velocity.x, en.body.velocity.y)
        en.setData('dir', dir)
        const targetAnim = `${en.animKey}-walk-${dir}`
        if (en.anims.currentAnim?.key !== targetAnim) en.play(targetAnim, true)
      } else {
        const dir = en.getData('dir') || 'down'
        const idleAnim = `${en.animKey}-idle-${dir}`
        if (en.anims.currentAnim?.key !== idleAnim) en.play(idleAnim, true)
      }
    })

    // Archerの更新
    this.archers.forEach(archer => {
      if (!archer.active) return

      if (archer.getData('dead')) return
      if (archer.getData('dying')) {
        archer.setVelocity(0, 0)
        if (archer.anims.currentAnim?.key !== `${archer.animKey}-dying`) archer.play(`${archer.animKey}-dying`, true)
        return
      }

      updateArcherAI(this, archer, this.player)
      archer.speech?.update(archer)

      if (archer.body.velocity.x !== 0 || archer.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(archer.body.velocity.x, archer.body.velocity.y)
        archer.setData('dir', dir)
        const targetAnim = `${archer.animKey}-walk-${dir}`
        if (archer.anims.currentAnim?.key !== targetAnim) archer.play(targetAnim, true)
      } else {
        if (archer.state === 'aim' || archer.state === 'shoot') {
          const dir = this.getDirectionToPlayer(archer)
          const targetAnim = `${archer.animKey}-atk-${dir}`
          if (archer.anims.currentAnim?.key !== targetAnim) archer.play(targetAnim, false)
        } else {
          const dir = archer.getData('dir') || 'down'
          const idleAnim = `${archer.animKey}-idle-${dir}`
          if (archer.anims.currentAnim?.key !== idleAnim && !archer.anims.currentAnim?.key.includes('atk')) {
            archer.play(idleAnim, true)
          }
        }
      }
    })

    // Mageの更新
    this.mages.forEach(mage => {
      if (!mage.active) return

      if (mage.getData('dead')) return
      if (mage.getData('dying')) {
        mage.setVelocity(0, 0)
        if (mage.anims.currentAnim?.key !== `${mage.animKey}-dying`) mage.play(`${mage.animKey}-dying`, true)
        return
      }

      updateMageAI(this, mage, this.player)
      mage.speech?.update(mage)

      if (mage.body.velocity.x !== 0 || mage.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(mage.body.velocity.x, mage.body.velocity.y)
        mage.setData('dir', dir)
        const targetAnim = `${mage.animKey}-walk-${dir}`
        if (mage.anims.currentAnim?.key !== targetAnim) mage.play(targetAnim, true)
      } else {
        if (mage.state === 'aim' || mage.state === 'cast' || mage.state === 'shoot') {
          const dir = this.getDirectionToPlayer(mage)
          const targetAnim = `${mage.animKey}-atk-${dir}`
          if (mage.anims.currentAnim?.key !== targetAnim) mage.play(targetAnim, false)
        } else {
          const dir = mage.getData('dir') || 'down'
          const idleAnim = `${mage.animKey}-idle-${dir}`
          if (mage.anims.currentAnim?.key !== idleAnim && !mage.anims.currentAnim?.key.includes('atk')) {
            mage.play(idleAnim, true)
          }
        }
      }
    })

    // Bruteの更新
    this.brutes.forEach(brute => {
      if (!brute.active) return

      if (brute.getData('dead')) return
      if (brute.getData('dying')) {
        brute.setVelocity(0, 0)
        if (brute.anims.currentAnim?.key !== `${brute.animKey}-dying`) brute.play(`${brute.animKey}-dying`, true)
        return
      }

      updateBruteAI(this, brute, this.player)
      brute.speech?.update(brute)

      if (brute.state === 'dash') {
        const dir = getDirectionFromVelocity(brute.body.velocity.x, brute.body.velocity.y)
        const targetAnim = `${brute.animKey}-atk-${dir}`
        if (brute.anims.currentAnim?.key !== targetAnim) brute.play(targetAnim, true)
      } else if (brute.body.velocity.x !== 0 || brute.body.velocity.y !== 0) {
        const dir = getDirectionFromVelocity(brute.body.velocity.x, brute.body.velocity.y)
        brute.setData('dir', dir)
        const targetAnim = `${brute.animKey}-walk-${dir}`
        if (brute.anims.currentAnim?.key !== targetAnim) brute.play(targetAnim, true)
      } else {
        const dir = brute.getData('dir') || 'down'
        const idleAnim = `${brute.animKey}-idle-${dir}`
        if (brute.anims.currentAnim?.key !== idleAnim && !brute.anims.currentAnim?.key.includes('atk')) {
          brute.play(idleAnim, true)
        }
      }
    })
  }

  /**
   * ストーリーを起動してゲームを一時停止する
   */
  private launchStory(storyId: string, then: ThenAction) {
    console.log(`[MainScene] launchStory: ${storyId}`, then)
    this.scene.launch('StoryScene', { id: storyId, then })
    this.scene.pause()

    events.once('story:end', (data: { id: string; then: ThenAction }) => {
      console.log('[MainScene] story:end received, then:', data.then)
      this.executeThen(data.then)
    })
  }

  /**
   * ThenAction に従ってフロー制御を実行する
   */
  private executeThen(then: ThenAction) {
    console.log('[MainScene] executeThen:', then)
    switch (then.action) {
      case 'stay':
        this.scene.resume()
        break
      case 'exit':
        this.scene.stop()
        this.scene.start('TitleScene')
        break
      case 'goto_map':
        this.scene.resume()
        this.switchMap(then.mapId, then.x, then.y)
        break
    }
  }

  /**
   * ゲームクリア処理（ボス撃破時などに呼び出す）
   */
  private triggerGameClear() {
    console.log('triggerGameClear called!')

    if (this.isGameCleared) {
      return
    }

    this.isGameCleared = true
    this.player.setVelocity(0)

    const config = this.gameFlowManager.getMapConfig(this.currentMapId)
    const bossDefeat = config?.onBossDefeat ?? { story: 'clear', then: { action: 'exit' } as ThenAction }

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      console.log('[MainScene] Fade out complete, launching clear story')
      if (bossDefeat.story) {
        this.launchStory(bossDefeat.story, bossDefeat.then)
      } else {
        this.executeThen(bossDefeat.then)
      }
    })

    this.cameras.main.fadeOut(800, 0, 0, 0)
  }

  private getDirectionToPlayer(enemy: Phaser.GameObjects.Sprite): string {
    const dx = this.player.x - enemy.x
    const dy = this.player.y - enemy.y
    return getDirectionFromVelocity(dx, dy)
  }

  private makeAnimatedEnemy(x: number, y: number, overrides?: EnemyOverrides): EnemyWithAI {
    const en = makeEnemy(this, x, y, overrides)
    en.setScale(2)
    en.lastSpeechTime = 0
    en.lastSpeechState = ''
    en.play(`${en.animKey}-idle-down`)
    if (overrides?.dialogs) {
      en.speech = new EnemySpeech(this)
    }
    return en
  }

  private makeAnimatedArcher(x: number, y: number, overrides?: EnemyOverrides): Archer {
    const archer = makeArcher(this, x, y, overrides)
    archer.play(`${archer.animKey}-idle-down`)
    if (overrides?.dialogs) {
      archer.speech = new EnemySpeech(this)
    }
    return archer
  }

  private makeAnimatedMage(x: number, y: number, overrides?: EnemyOverrides): Mage {
    const mage = makeMage(this, x, y, overrides)
    mage.play(`${mage.animKey}-idle-down`)
    if (overrides?.dialogs) {
      mage.speech = new EnemySpeech(this)
    }
    return mage
  }

  private makeAnimatedBrute(x: number, y: number, overrides?: EnemyOverrides): Brute {
    const brute = makeBrute(this, x, y, overrides)
    brute.play(`${brute.animKey}-idle-down`)
    if (overrides?.dialogs) {
      brute.speech = new EnemySpeech(this)
    }
    return brute
  }

  private doAttack() {
    if (this.isAttacking) return

    this.isAttacking = true
    this.audioBus.playSe('se_player_attack', { volume: 0.8 })

    this.player.play(`hero-atk-${this.playerDirection}`)

    const dir = this.getFacingVector()
    const off = 40
    this.hitbox.x = this.player.x + dir.x * off
    this.hitbox.y = this.player.y + dir.y * off

    this.time.delayedCall(300, () => {
      ;(this.hitbox.body as Phaser.Physics.Arcade.Body).setEnable(false)
    })
  }

  private performAttack() {
    this.doAttack()
  }

  private spawnFireBall(): void {
    const fb = this.firePool.get(this.player.x, this.player.y, 'magic_fire') as FireBall | null
    if (!fb) return

    fb.setActive(true).setVisible(true).setDepth(5)
    fb.setScale(0.1)
    fb.damage = 1
    fb.originX = this.player.x
    fb.originY = this.player.y

    const ptr = this.input.activePointer
    const worldMouse = this.cameras.main.getWorldPoint(ptr.x, ptr.y)
    const dir = new Phaser.Math.Vector2(worldMouse.x - this.player.x, worldMouse.y - this.player.y).normalize()
    fb.setVelocity(dir.x * this.FIRE_SPEED, dir.y * this.FIRE_SPEED)
    fb.setRotation(Phaser.Math.Angle.Between(0, 0, dir.x, dir.y))

    if (fb.body) {
      (fb.body as Phaser.Physics.Arcade.Body).setEnable(true)
    }
  }

  private updateFireBalls(now: number): void {
    // 発射ループ
    if (this.isSpecialAttacking && this.isRightMouseHeld) {
      if (now - this.lastFireTime >= this.FIRE_INTERVAL) {
        this.lastFireTime = now
        this.spawnFireBall()
      }
      if (!this.flameIsPlaying) {
        this.audioBus.playSeLoop('se_flame', 0.6)
        this.flameIsPlaying = true
      }
    } else if (this.flameIsPlaying) {
      this.audioBus.stopSeLoop('se_flame')
      this.flameIsPlaying = false
    }

    // 各弾の更新（飛距離チェック・スケール更新）
    this.firePool.getChildren().forEach(obj => {
      const fb = obj as FireBall
      if (!fb.active) return
      const dist = Phaser.Math.Distance.Between(fb.originX, fb.originY, fb.x, fb.y)
      if (dist >= this.FIRE_RANGE) {
        this.firePool.killAndHide(fb)
        if (fb.body) (fb.body as Phaser.Physics.Arcade.Body).setEnable(false)
        return
      }
      fb.setScale(Math.min(1.0, 0.1 + 0.9 * (dist / this.FIRE_RANGE)))
    })
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
    const maxHP = 100

    const barLength = 20
    const filledCount = Math.floor((currentHP / maxHP) * barLength)
    const filledBars = '█'.repeat(Math.max(0, filledCount))
    const emptyBars = '░'.repeat(Math.max(0, barLength - filledCount))

    const newText = `HP: ${currentHP}/${maxHP} [${filledBars}${emptyBars}]`
    this.hpText.setText(newText)

    if (currentHP <= 20) {
      this.hpText.setColor('#ff0000')
    } else if (currentHP <= 40) {
      this.hpText.setColor('#ffaa00')
    } else {
      this.hpText.setColor('#ffffff')
    }
  }

  private triggerGameOver() {
    console.log('triggerGameOver called! isGameOver:', this.isGameOver)

    if (this.isGameOver) {
      return
    }

    this.isGameOver = true
    console.log('=== GAME OVER ===')

    this.player.setVelocity(0)

    const config = this.gameFlowManager.getMapConfig(this.currentMapId)
    const defeat = config?.onPlayerDefeat ?? { story: 'gameover', then: { action: 'exit' } as ThenAction }

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      console.log('[MainScene] Fade out complete, launching gameover story')
      if (defeat.story) {
        this.launchStory(defeat.story, defeat.then)
      } else {
        this.executeThen(defeat.then)
      }
    })

    this.cameras.main.fadeOut(800, 0, 0, 0)
  }

  /**
   * 敵とイベントトリガーを初期化
   */
  private initializeEnemiesAndTriggers(mapData: Record<string, unknown>) {
    type EnemySpawn = { x: number; y: number; enemyDefId?: string }
    type EnemyDef = {
      id: string
      enemyType: string
      spriteKey: string
      animPrefix: string
      stats: Record<string, number>
      dialogs?: EnemyDialogs
      hitSound?: string
      attackSound?: string
    }

    const defs = (this.cache.json.get('enemy-defs') as EnemyDef[]) || []
    const enemySpawns = (mapData.enemySpawns as EnemySpawn[]) || []

    // enemyType → デフォルトanimKeyのマッピング
    const defaultAnimKey: Record<string, string> = {
      blob: 'blob', archer: 'archer', mage: 'mage', brute: 'brute'
    }

    enemySpawns.forEach((spawn) => {
      const def = spawn.enemyDefId ? defs.find(d => d.id === spawn.enemyDefId) : undefined
      // spriteKeyが存在しテクスチャが読み込まれていればそれをanimKeyとして使用
      const animKey = def?.spriteKey && this.textures.exists(def.spriteKey)
        ? def.spriteKey
        : (def?.enemyType ? (defaultAnimKey[def.enemyType] ?? def.enemyType) : undefined)
      const overrides: EnemyOverrides | undefined = def
        ? {
            ...def.stats,
            dialogs: def.dialogs,
            ...(animKey ? { animKey } : {}),
            ...(def.hitSound    ? { hitSound: def.hitSound }       : {}),
            ...(def.attackSound ? { attackSound: def.attackSound } : {}),
          }
        : undefined
      const resolvedType = def?.enemyType ?? (['blob', 'archer', 'mage', 'brute'] as const)[Math.floor(Math.random() * 4)]

      const px = spawn.x * TILE
      const py = spawn.y * TILE
      if (resolvedType === 'blob') {
        this.enemies.push(this.makeAnimatedEnemy(px, py, overrides))
      } else if (resolvedType === 'archer') {
        this.archers.push(this.makeAnimatedArcher(px, py, overrides))
      } else if (resolvedType === 'mage') {
        this.mages.push(this.makeAnimatedMage(px, py, overrides))
      } else {
        this.brutes.push(this.makeAnimatedBrute(px, py, overrides))
      }
    })

    // 敵と壁の衝突判定を設定
    this.enemies.forEach(en => {
      const collider = this.physics.add.collider(en, this.walls!)
      this.colliders.push(collider)
      const hitCollider = this.physics.add.overlap(this.hitbox, en, () => {
        if (!en.getData('hitCool') && !en.getData('dead')) {
          en.hp -= 1
          en.setTint(0xff4444)
          const enHitKey = (en as any).hitSound ? 'se_' + (en as any).hitSound.replace(/\.(ogg|mp3)$/, '') : 'se_enemy_hit'
          this.audioBus.playSe(enHitKey, { volume: 0.8 })
          en.setData('hitCool', true)
          this.time.delayedCall(100, () => en.clearTint())
          this.time.delayedCall(250, () => en.setData('hitCool', false))
          if (en.hp <= 0) {
            if (!en.getData('dead')) this.triggerEnemyDeath(en)
          } else if (en.hp <= 10 && !en.getData('dying')) {
            en.setData('dying', true)
            en.setVelocity(0, 0)
          }
        }
      })
      this.colliders.push(hitCollider)
    })
    this.archers.forEach(ar => {
      const collider = this.physics.add.collider(ar, this.walls!)
      this.colliders.push(collider)
      this.setupEnemyHit(ar)
    })
    this.mages.forEach(mg => {
      const collider = this.physics.add.collider(mg, this.walls!)
      this.colliders.push(collider)
      this.setupEnemyHit(mg)
    })
    this.brutes.forEach(br => {
      const collider = this.physics.add.collider(br, this.walls!)
      this.colliders.push(collider)
      this.setupEnemyHit(br)
    })

    // 火炎弾 vs 壁・敵
    if (this.walls) {
      const fireVsWall = this.physics.add.overlap(this.firePool, this.walls, (fb) => {
        this.firePool.killAndHide(fb as Phaser.GameObjects.GameObject)
        if ((fb as FireBall).body) ((fb as FireBall).body as Phaser.Physics.Arcade.Body).setEnable(false)
      })
      this.colliders.push(fireVsWall)
    }

    const allEnemyGroups = [...this.enemies, ...this.archers, ...this.mages, ...this.brutes]
    allEnemyGroups.forEach(en => {
      const fireVsEnemy = this.physics.add.overlap(this.firePool, en, (_enCb, fb) => {
        this.firePool.killAndHide(fb as Phaser.GameObjects.GameObject)
        if ((fb as FireBall).body) ((fb as FireBall).body as Phaser.Physics.Arcade.Body).setEnable(false)
        if (!en.getData('hitCool') && !en.getData('dead')) {
          en.hp -= 1
          en.setTint(0xff4444)
          const hitKey = (en as any).hitSound ? 'se_' + (en as any).hitSound.replace(/\.(ogg|mp3)$/, '') : 'se_enemy_hit'
          this.audioBus.playSe(hitKey, { volume: 0.8 })
          en.setData('hitCool', true)
          this.time.delayedCall(100, () => en.clearTint())
          this.time.delayedCall(250, () => en.setData('hitCool', false))
          if (en.hp <= 0 && !en.getData('dead')) this.triggerEnemyDeath(en)
        }
      })
      this.colliders.push(fireVsEnemy)
    })

    // イベントトリガーを gameflow.json から取得して初期化
    const eventTriggers = this.gameFlowManager.getEventTriggers(this.currentMapId)
    if (eventTriggers.length > 0) {
      this.eventTriggerManager = new EventTriggerManager(this, eventTriggers, TILE, this.currentMapId)
      console.log(`[MainScene] Initialized ${eventTriggers.length} event triggers for ${this.currentMapId}`)
    }

    // PortalManager を初期化（map JSON の portals と gameflow.json の portals をインデックス突合）
    const gameflowPortals = this.gameFlowManager.getPortals(this.currentMapId)
    const mapPortalPositions = ((this.currentMapData as Record<string, unknown>).portals as Array<{ x: number; y: number }> | undefined) ?? []
    const fullPortals: FullPortalData[] = mapPortalPositions
      .map((pos, i) => {
        const dest = gameflowPortals[i]
        if (!dest) return null
        return { x: pos.x, y: pos.y, targetMap: dest.targetMap, targetX: dest.targetX, targetY: dest.targetY }
      })
      .filter((p): p is FullPortalData => p !== null)

    if (fullPortals.length > 0) {
      this.portalManager = new PortalManager(this, fullPortals, TILE)
      this.portalManager.setupOverlap(this.player, (p: FullPortalData) => {
        if (this.isGameOver || this.ui.visible) return
        console.log(`[MainScene] Portal triggered: ${p.targetMap} (${p.targetX}, ${p.targetY})`)
        this.switchMap(p.targetMap, p.targetX, p.targetY)
      })
      console.log(`[MainScene] Initialized ${fullPortals.length} portals for ${this.currentMapId}`)
    }
  }

  /**
   * 敵の死亡処理
   */
  private triggerEnemyDeath(en: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
    en.setData('dead', true)
    en.setData('dying', false)
    en.setVelocity(0, 0)
    en.clearTint()

    const key = en.texture.key
    const prefixMap: Record<string, string> = {
      solder: 'blob',
      vamp1: 'archer',
      succubus: 'mage',
      mage: 'brute',
    }
    const prefix = prefixMap[key] ?? 'blob'
    en.play(`${prefix}-dead`)
    en.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      en.disableBody(true, true)
    })
  }

  /**
   * 敵との攻撃判定を設定
   */
  private setupEnemyHit(en: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & { hp: number }) {
    const hitCollider = this.physics.add.overlap(this.hitbox, en, () => {
      if (!en.getData('hitCool') && !en.getData('dead')) {
        en.hp -= 1
        en.setTint(0xff4444)
        const hitKey = (en as any).hitSound ? 'se_' + (en as any).hitSound.replace(/\.(ogg|mp3)$/, '') : 'se_enemy_hit'
        this.audioBus.playSe(hitKey, { volume: 0.8 })
        en.setData('hitCool', true)
        this.time.delayedCall(100, () => en.clearTint())
        this.time.delayedCall(250, () => en.setData('hitCool', false))

        if (en.hp <= 0) {
          if (!en.getData('dead')) this.triggerEnemyDeath(en)
        } else if (en.hp <= 10 && !en.getData('dying')) {
          en.setData('dying', true)
          en.setVelocity(0, 0)
        }
      }
    })
    this.colliders.push(hitCollider)

    if ((en as any).enemyType === 'brute') {
      const bruteCollider = this.physics.add.overlap(this.player, en, () => {
        const brute = en as Brute
        if (brute.state === 'dash' && !this.player.getData('hitCool') && !this.isGameOver) {
          const oldHP = (this.player as any).hp
          ;(this.player as any).hp = Math.max(0, oldHP - 2)
          const newHP = (this.player as any).hp
          console.log(`Player hit by Brute dash! HP: ${oldHP} -> ${newHP}`)
          this.updateHPDisplay()
          this.player.setTint(0xff4444)
          this.audioBus.playSe('se_player_hit', { volume: 0.8 })
          this.player.setData('hitCool', true)
          this.time.delayedCall(100, () => this.player.clearTint())
          this.time.delayedCall(1000, () => this.player.setData('hitCool', false))

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
   */
  private switchMap(mapId: string, targetX: number, targetY: number) {
    console.log(`[MainScene] Switching to map: ${mapId} at (${targetX}, ${targetY})`)

    // すべての衝突判定を破棄
    this.colliders.forEach(collider => {
      if (collider && collider.active) {
        collider.destroy()
      }
    })
    this.colliders = []

    // 既存の敵を破棄
    this.enemies.forEach(enemy => { if (enemy) { enemy.speech?.destroy(); enemy.destroy() } })
    this.enemies = []

    this.archers.forEach(archer => { if (archer) { archer.speech?.destroy(); archer.destroy() } })
    this.archers = []

    this.mages.forEach(mage => { if (mage) { mage.speech?.destroy(); mage.destroy() } })
    this.mages = []

    this.brutes.forEach(brute => { if (brute) { brute.speech?.destroy(); brute.destroy() } })
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
    if (this.firePool) {
      this.firePool.clear(true, true)
    }

    // 既存のマップオブジェクト（床と壁）を破棄
    const tileSprites = this.children.list.filter(obj => obj.type === 'TileSprite')
    tileSprites.forEach(sprite => sprite.destroy())
    // 床キャンバス Image を破棄
    if (this.textures.exists('__floor_canvas__')) {
      const floorImg = this.children.list.find(
        obj => obj.type === 'Image' && (obj as Phaser.GameObjects.Image).texture?.key === '__floor_canvas__'
      ) as Phaser.GameObjects.Image | undefined
      floorImg?.destroy()
      this.textures.remove('__floor_canvas__')
    }

    if (this.walls) {
      this.walls.clear(true, true)
      this.walls.destroy()
    }

    // イベントトリガーマネージャーを破棄
    if (this.eventTriggerManager) {
      this.eventTriggerManager.destroy()
      this.eventTriggerManager = undefined
    }

    // PortalManagerを破棄
    if (this.portalManager) {
      this.portalManager.destroy()
      this.portalManager = undefined
    }

    // NPCを破棄
    if (this.npcManager) {
      this.npcManager.destroy()
    }

    // ゲームオーバー・クリアフラグをリセット（新マップ遷移時）
    this.isGameOver = false
    this.isGameCleared = false

    // 新しいマップをロード
    this.loadMap(mapId)

    // プレイヤーを移動先に配置
    this.player.setPosition(targetX * TILE, targetY * TILE)
    this.player.setDepth(10)

    // カメラを追従させる
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    // マップロード完了イベントを発火（BGM切り替え用）
    events.emit('map-loaded', mapId)
    console.log('[MainScene] Map loaded event emitted:', mapId)
  }

  /**
   * マップをロードして構築
   */
  private loadMap(mapId: string) {
    console.log(`[MainScene] Loading map: ${mapId}`)

    let mapData = this.cache.json.get(mapId) as Record<string, unknown> | undefined
    if (!mapData) {
      // キャッシュにない場合、同期XHRでフォールバック取得
      console.warn(`[MainScene] ${mapId} not in cache, fetching directly...`)
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', `assets/maps/${mapId}.json`, false)
        xhr.send()
        if (xhr.status === 200) {
          mapData = JSON.parse(xhr.responseText) as Record<string, unknown>
          this.cache.json.add(mapId, mapData)
        } else {
          console.error(`Map data not found: ${mapId} (HTTP ${xhr.status})`)
          return
        }
      } catch (e) {
        console.error(`Map data not found: ${mapId}`, e)
        return
      }
    }

    this.currentMapId = mapId
    this.currentMapData = mapData

    // タイルマップを構築
    const tileDefArray = this.cache.json.get('tilesets') as TileDef[]
    const tileDefMap = new Map(tileDefArray.map(d => [d.id, d]))
    const result = buildMapFromJSON(this, mapData as unknown as MapData, tileDefMap)
    this.walls = result.walls

    // カメラと物理世界の境界を更新
    this.cameras.main.setBounds(0, 0, result.worldW, result.worldH)
    this.physics.world.setBounds(0, 0, result.worldW, result.worldH)

    // プレイヤーと壁の衝突を設定
    const playerWallCollider = this.physics.add.collider(this.player, this.walls!)
    this.colliders.push(playerWallCollider)

    // ボス生成（gameflow.json の boss フィールドで判定）
    const mapConfig = this.gameFlowManager.getMapConfig(mapId)
    if (mapConfig?.boss) {
      this.spawnBoss()
    }

    // 敵とイベントトリガーを初期化
    this.initializeEnemiesAndTriggers(mapData)

    // NPCを再初期化
    this.npcManager.loadNPCs('npc_config', mapId)
    const npcColliders = this.npcManager.setupCollisions(this.player)
    this.colliders.push(...npcColliders)

    // onEnter ストーリーがあれば再生
    if (mapConfig?.onEnter) {
      this.launchStory(mapConfig.onEnter, { action: 'stay' })
    }

    console.log(`[MainScene] Map loaded: ${mapId}`)
  }

  /**
   * ボス生成
   */
  private spawnBoss() {
    const mapConfig = this.gameFlowManager.getMapConfig(this.currentMapId)
    if (!mapConfig?.boss) return
    const { configKey, x, y } = mapConfig.boss
    console.log(`[MainScene] Spawning boss: ${configKey} at (${x}, ${y})`)

    this.boss = makeBoss(this, x * TILE, y * TILE, configKey)

    const bossWallCollider = this.physics.add.collider(this.boss, this.walls!)
    this.colliders.push(bossWallCollider)

    this.setupBossHit()

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

    const playerAttackCollider = this.physics.add.overlap(this.hitbox, this.boss, () => {
      if (!this.boss || !this.boss.active) return

      if (!this.boss.getData('hitCool')) {
        const oldHP = this.boss.hp
        this.boss.hp -= 1
        console.log(`[MainScene] Boss damaged! HP: ${oldHP} -> ${this.boss.hp} (Phase: ${this.boss.phase})`)
        this.boss.setTint(0xff4444)
        this.boss.setData('hitCool', true)

        if (this.boss.config.se.damage) {
          this.audioBus.playSe(this.boss.config.se.damage, { volume: 0.7 })
        }

        this.time.delayedCall(100, () => {
          if (this.boss) this.boss.clearTint()
        })
        this.time.delayedCall(250, () => {
          if (this.boss) this.boss.setData('hitCool', false)
        })

        if (this.boss.hp <= 0) {
          this.defeatBoss()
        }
      }
    })
    this.colliders.push(playerAttackCollider)

    const bossContactCollider = this.physics.add.overlap(this.player, this.boss, () => {
      if (!this.boss || !this.boss.active) return

      const dashDamage = this.boss.getData('dashDamage') || 0
      if (dashDamage > 0 && !this.player.getData('hitCool') && !this.isGameOver) {
        const oldHP = (this.player as any).hp
        ;(this.player as any).hp = Math.max(0, oldHP - dashDamage)

        console.log(`Player hit by boss dash! HP: ${oldHP} -> ${(this.player as any).hp}`)

        this.updateHPDisplay()
        this.player.setTint(0xff4444)
        this.audioBus.playSe('se_player_hit', { volume: 0.8 })
        this.player.setData('hitCool', true)
        this.time.delayedCall(100, () => this.player.clearTint())
        this.time.delayedCall(500, () => this.player.setData('hitCool', false))

        if ((this.player as any).hp <= 0) {
          this.triggerGameOver()
        }
      }
    })
    this.colliders.push(bossContactCollider)

    // 火炎弾 vs ボス
    if (this.firePool) {
      const fireVsBoss = this.physics.add.overlap(this.firePool, this.boss, (_bossCb, fb) => {
        if (!this.boss || !this.boss.active || !this.boss.getData) return
        this.firePool.killAndHide(fb as Phaser.GameObjects.GameObject)
        if ((fb as FireBall).body) ((fb as FireBall).body as Phaser.Physics.Arcade.Body).setEnable(false)
        if (!this.boss.getData('hitCool')) {
          this.boss.hp -= 1
          this.boss.setTint(0xff4444)
          this.boss.setData('hitCool', true)
          if (this.boss.config.se.damage) this.audioBus.playSe(this.boss.config.se.damage, { volume: 0.7 })
          this.time.delayedCall(100, () => { if (this.boss) this.boss.clearTint() })
          this.time.delayedCall(250, () => { if (this.boss) this.boss.setData('hitCool', false) })
          this.bossHpUI?.update(this.boss.hp, this.boss.maxHp, this.boss.phase)
          if (this.boss.hp <= 0) this.defeatBoss()
        }
      })
      this.colliders.push(fireVsBoss)
    }
  }

  /**
   * ボス撃破処理
   */
  private defeatBoss() {
    if (!this.boss) return

    console.log('[MainScene] Boss defeated!')

    this.boss.state = 'defeated'

    if (this.boss.config.se.defeat) {
      this.audioBus.playSe(this.boss.config.se.defeat, { volume: 0.8 })
    }

    if (this.boss.config.speeches.defeat) {
      this.bossSpeechBubble.show(this.boss, this.boss.config.speeches.defeat, 2000)
    }

    if (this.bossHpUI) {
      this.bossHpUI.hide()
    }

    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      scale: 6,
      duration: 1500,
      onComplete: () => {
        if (this.boss) {
          this.boss.disableBody(true, true)
        }
        this.triggerGameClear()
      }
    })
  }
}
