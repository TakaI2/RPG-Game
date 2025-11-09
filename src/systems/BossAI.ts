import Phaser from 'phaser'
import {
  Boss,
  BossConfig,
  AttackConfig,
  ProjectileRadialConfig,
  ProjectileCircleConfig,
  TeleportDashConfig,
  UltimateConfig
} from '../types/BossTypes'
import { fireArrowAngle, fireOrbAt, Projectile } from './Projectile'
import { AudioBus } from './AudioBus'
import { CutinSystem } from './CutinSystem'
import { BossSpeechBubble } from './BossSpeechBubble'
import { GAME_W, GAME_H } from '../config'

/**
 * ボス設定をロード
 */
export function loadBossConfig(scene: Phaser.Scene, bossId: string): BossConfig {
  const config = scene.cache.json.get(bossId)
  if (!config) {
    throw new Error(`Boss config not found: ${bossId}`)
  }
  return config as BossConfig
}

/**
 * ボス生成
 */
export function makeBoss(scene: Phaser.Scene, x: number, y: number, configId: string): Boss {
  const config = loadBossConfig(scene, configId)

  const sprite = config.sprite.key
  const boss = scene.physics.add.sprite(x, y, sprite).setScale(config.stats.scale) as Boss

  // 型プロパティ設定
  boss.enemyType = 'boss'
  boss.name = config.name
  boss.state = 'idle'
  boss.phase = 1
  boss.hp = config.stats.hp
  boss.maxHp = config.stats.hp
  boss.speed = config.stats.speed

  // 設定データを保持
  boss.config = config

  // 攻撃管理
  boss.currentAttackId = null
  boss.attackStartTime = 0
  boss.lastAttackTime = 0
  boss.attackCooldown = 3000 // デフォルト3秒

  // 必殺技管理
  boss.ultimateReady = false
  boss.lastUltimateTime = 0
  boss.ultimateCooldown = 30000 // 30秒

  // セリフ表示フラグ
  boss.phase2SpeechShown = false
  boss.lowHpSpeechShown = false

  // テレポート突進用
  boss.dashDirection = null

  // Tint設定
  if (config.sprite.tint) {
    const tintValue = parseInt(config.sprite.tint, 16)
    boss.setTint(tintValue)
  }

  boss.setDepth(5)

  console.log(`[BossAI] Boss created: ${config.name} (${config.id})`)

  return boss
}

/**
 * ボスAI更新（メインループ）
 */
export function updateBossAI(
  scene: Phaser.Scene,
  boss: Boss,
  player: Phaser.GameObjects.Sprite,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  cutinSystem: CutinSystem,
  speechBubble: BossSpeechBubble,
  time: number,
  delta: number
) {
  if (boss.state === 'defeated') return

  // フェーズ判定
  updatePhase(boss, speechBubble)

  // 攻撃状態の管理
  if (boss.state === 'idle' || boss.state === 'cooldown') {
    // 次の攻撃を選択
    const timeSinceLastAttack = time - boss.lastAttackTime
    if (timeSinceLastAttack >= boss.attackCooldown) {
      selectNextAttack(boss, time)
    }
  }

  // 攻撃実行
  if (boss.currentAttackId && boss.state === 'attacking') {
    executeAttack(
      scene,
      boss,
      boss.currentAttackId,
      player,
      projectiles,
      audioBus,
      cutinSystem,
      speechBubble,
      time
    )
  }
}

/**
 * フェーズ更新
 */
function updatePhase(boss: Boss, speechBubble: BossSpeechBubble) {
  const config = boss.config

  // 現在のHPに基づいてフェーズを判定
  for (const phaseConfig of config.phases) {
    const [minHp, maxHp] = phaseConfig.hpRange
    if (boss.hp >= minHp && boss.hp <= maxHp) {
      if (boss.phase !== phaseConfig.phase) {
        // フェーズ変更
        boss.phase = phaseConfig.phase
        boss.attackCooldown = 3000 / phaseConfig.attackCooldown

        console.log(`[BossAI] Phase changed to ${boss.phase}`)

        // フェーズ2突入時のセリフ
        if (boss.phase === 2 && !boss.phase2SpeechShown && config.speeches.phase2) {
          speechBubble.show(boss, config.speeches.phase2, 1500)
          boss.phase2SpeechShown = true
        }
      }
      break
    }
  }

  // 低HP時のセリフ
  if (boss.hp < 5 && !boss.lowHpSpeechShown && config.speeches.lowHp) {
    speechBubble.show(boss, config.speeches.lowHp, 1500)
    boss.lowHpSpeechShown = true
  }
}

/**
 * 次の攻撃を選択
 */
function selectNextAttack(boss: Boss, time: number) {
  const config = boss.config
  const currentPhaseConfig = config.phases.find(p => p.phase === boss.phase)

  if (!currentPhaseConfig || currentPhaseConfig.patterns.length === 0) {
    return
  }

  // ランダムに攻撃を選択
  const patterns = currentPhaseConfig.patterns
  const randomIndex = Phaser.Math.Between(0, patterns.length - 1)
  boss.currentAttackId = patterns[randomIndex]
  boss.state = 'attacking'
  boss.attackStartTime = time

  console.log(`[BossAI] Selected attack: ${boss.currentAttackId}`)
}

/**
 * 汎用攻撃実行エンジン
 */
function executeAttack(
  scene: Phaser.Scene,
  boss: Boss,
  attackId: string,
  player: Phaser.GameObjects.Sprite,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  cutinSystem: CutinSystem,
  speechBubble: BossSpeechBubble,
  time: number
) {
  const attackConfig = boss.config.attacks.find(a => a.id === attackId)
  if (!attackConfig) {
    console.warn(`[BossAI] Attack not found: ${attackId}`)
    boss.state = 'cooldown'
    boss.lastAttackTime = time
    boss.currentAttackId = null
    return
  }

  // 攻撃タイプごとに処理を分岐
  switch (attackConfig.type) {
    case 'projectile_radial':
      executeRadialAttack(scene, boss, projectiles, audioBus, attackConfig, time)
      break
    case 'projectile_circle':
      executeCircleAttack(scene, boss, player, projectiles, audioBus, attackConfig, time)
      break
    case 'teleport_dash':
      executeTeleportDashAttack(scene, boss, player, audioBus, attackConfig, time)
      break
    case 'ultimate':
      executeUltimateAttack(scene, boss, player, projectiles, audioBus, cutinSystem, speechBubble, attackConfig, time)
      break
  }
}

/**
 * 放射攻撃
 */
function executeRadialAttack(
  scene: Phaser.Scene,
  boss: Boss,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  attackConfig: AttackConfig & { type: 'projectile_radial'; config: ProjectileRadialConfig },
  time: number
) {
  const cfg = attackConfig.config
  const elapsed = time - boss.attackStartTime

  // 予備動作
  if (elapsed < cfg.windupDuration) {
    if (boss.state === 'attacking' && elapsed < 100) {
      // 点滅エフェクト
      if (cfg.windupEffect === 'blink_red' || cfg.windupEffect === 'blink_yellow') {
        const color = cfg.windupEffect === 'blink_red' ? 0xff0000 : 0xffff00
        scene.tweens.add({
          targets: boss,
          alpha: { from: 1, to: 0.5 },
          duration: 200,
          yoyo: true,
          repeat: Math.floor(cfg.windupDuration / 400)
        })
      }
    }
    return
  }

  // 発射（1回のみ）
  if (boss.state === 'attacking') {
    if (attackConfig.se.fire) {
      audioBus.playSe(attackConfig.se.fire, { volume: 0.6 })
    }

    const angleStep = 360 / cfg.projectileCount
    for (let i = 0; i < cfg.projectileCount; i++) {
      const angle = (i * angleStep + cfg.angleOffset) * Math.PI / 180

      if (cfg.projectileType === 'arrow') {
        const projectile = fireArrowAngle(scene, projectiles, boss.x, boss.y, angle, cfg.projectileSpeed)
        projectile.setData('damage', cfg.damage)
      }
    }

    boss.state = 'cooldown'
    boss.lastAttackTime = time
    boss.currentAttackId = null
  }
}

/**
 * 円形配置攻撃
 */
function executeCircleAttack(
  scene: Phaser.Scene,
  boss: Boss,
  player: Phaser.GameObjects.Sprite,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  attackConfig: AttackConfig & { type: 'projectile_circle'; config: ProjectileCircleConfig },
  time: number
) {
  const cfg = attackConfig.config
  const elapsed = time - boss.attackStartTime

  // 配置フェーズ（最初の1フレームのみ）
  if (elapsed < 100 && boss.state === 'attacking') {
    if (attackConfig.se.setup) {
      audioBus.playSe(attackConfig.se.setup, { volume: 0.5 })
    }

    const orbs: Projectile[] = []
    const angleStep = 360 / cfg.projectileCount
    for (let i = 0; i < cfg.projectileCount; i++) {
      const angle = (i * angleStep) * Math.PI / 180
      const x = boss.x + Math.cos(angle) * cfg.radius
      const y = boss.y + Math.sin(angle) * cfg.radius

      const orb = fireOrbAt(scene, projectiles, x, y, player, 0)
      orb.setVelocity(0, 0) // 静止
      if (cfg.tint) {
        const tintValue = parseInt(cfg.tint, 16)
        orb.setTint(tintValue)
      }
      orb.setData('damage', cfg.damage)
      orb.setData('circleOrb', true)
      orbs.push(orb)
    }

    // 待機後に発射
    scene.time.delayedCall(cfg.waitDuration, () => {
      if (attackConfig.se.fire) {
        audioBus.playSe(attackConfig.se.fire, { volume: 0.6 })
      }

      orbs.forEach(orb => {
        if (orb.active) {
          orb.clearTint()
          const angle = Phaser.Math.Angle.Between(orb.x, orb.y, player.x, player.y)
          orb.setVelocity(Math.cos(angle) * cfg.projectileSpeed, Math.sin(angle) * cfg.projectileSpeed)
        }
      })
    })

    boss.state = 'cooldown'
    boss.lastAttackTime = time + cfg.waitDuration
    boss.currentAttackId = null
  }
}

/**
 * テレポート突進攻撃
 */
function executeTeleportDashAttack(
  scene: Phaser.Scene,
  boss: Boss,
  player: Phaser.GameObjects.Sprite,
  audioBus: AudioBus,
  attackConfig: AttackConfig & { type: 'teleport_dash'; config: TeleportDashConfig },
  time: number
) {
  const cfg = attackConfig.config
  const elapsed = time - boss.attackStartTime

  // フェードアウト
  if (elapsed < cfg.fadeOutDuration && boss.state === 'attacking') {
    if (attackConfig.se.teleport) {
      audioBus.playSe(attackConfig.se.teleport, { volume: 0.5 })
    }

    scene.tweens.add({
      targets: boss,
      alpha: 0,
      duration: cfg.fadeOutDuration,
      onComplete: () => {
        // テレポート
        const angle = Phaser.Math.Between(0, 360) * Math.PI / 180
        const distance = cfg.teleportDistance
        const newX = player.x + Math.cos(angle) * distance
        const newY = player.y + Math.sin(angle) * distance
        boss.setPosition(newX, newY)

        // フェードイン
        scene.tweens.add({
          targets: boss,
          alpha: 1,
          duration: cfg.fadeInDuration,
          onComplete: () => {
            // 溜め→突進
            scene.time.delayedCall(cfg.windupDuration, () => {
              if (attackConfig.se.dash) {
                audioBus.playSe(attackConfig.se.dash, { volume: 0.7 })
              }

              const dashAngle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y)
              boss.setVelocity(Math.cos(dashAngle) * cfg.dashSpeed, Math.sin(dashAngle) * cfg.dashSpeed)
              boss.setData('dashDamage', cfg.damage)

              // 突進終了
              scene.time.delayedCall(cfg.dashDuration, () => {
                boss.setVelocity(0, 0)
                boss.setData('dashDamage', 0)
              })
            })
          }
        })
      }
    })

    boss.state = 'cooldown'
    boss.lastAttackTime = time + cfg.fadeOutDuration + cfg.fadeInDuration + cfg.windupDuration + cfg.dashDuration
    boss.currentAttackId = null
  }
}

/**
 * 必殺技攻撃
 */
function executeUltimateAttack(
  scene: Phaser.Scene,
  boss: Boss,
  player: Phaser.GameObjects.Sprite,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  cutinSystem: CutinSystem,
  speechBubble: BossSpeechBubble,
  attackConfig: AttackConfig & { type: 'ultimate' },
  time: number
) {
  const cfg = attackConfig.config as UltimateConfig
  const elapsed = time - boss.attackStartTime

  // カットイン表示（最初の1フレームのみ）
  if (elapsed < 100 && boss.state === 'attacking') {
    boss.state = 'cutin'

    // カットイン
    if (attackConfig.cutin && attackConfig.cutin.enabled) {
      const cutinImage = boss.config.cutin.image
      cutinSystem.show(cutinImage, attackConfig.cutin.skillName, attackConfig.cutin.duration, () => {
        // カットイン終了後、セリフ表示
        if (attackConfig.speech) {
          speechBubble.show(boss, attackConfig.speech.text, attackConfig.speech.duration, attackConfig.speech.color, () => {
            // セリフ終了後、攻撃実行
            executeUltimateFire(scene, boss, player, projectiles, audioBus, cfg, attackConfig)
          })
        } else {
          executeUltimateFire(scene, boss, player, projectiles, audioBus, cfg, attackConfig)
        }
      })
    }

    boss.lastAttackTime = time + (attackConfig.cutin?.duration || 0) + (attackConfig.speech?.duration || 0) + 2000
    boss.currentAttackId = null
  }
}

/**
 * 必殺技の弾発射処理
 */
function executeUltimateFire(
  scene: Phaser.Scene,
  boss: Boss,
  player: Phaser.GameObjects.Sprite,
  projectiles: Phaser.Physics.Arcade.Group,
  audioBus: AudioBus,
  cfg: UltimateConfig,
  attackConfig: AttackConfig
) {
  // 画面演出
  if (attackConfig.type === 'ultimate' && attackConfig.cameraEffects) {
    const effects = attackConfig.cameraEffects

    // 暗転
    if (effects.darken && effects.darken.enabled) {
      const overlay = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, effects.darken.alpha)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(100)

      scene.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: effects.darken.duration,
        delay: 200,
        onComplete: () => overlay.destroy()
      })
    }

    // フラッシュ
    if (effects.flash && effects.flash.enabled) {
      const [r, g, b] = effects.flash.color
      scene.cameras.main.flash(effects.flash.duration, r, g, b)
    }
  }

  // BGM音量ダウン
  if (attackConfig.type === 'ultimate' && attackConfig.bgmControl) {
    const originalVolume = audioBus.getVolume()
    audioBus.setVolume(attackConfig.bgmControl.volumeDown)

    scene.time.delayedCall(attackConfig.bgmControl.duration, () => {
      audioBus.setVolume(originalVolume)
    })
  }

  // SE再生
  if (attackConfig.se.ultimate) {
    audioBus.playSe(attackConfig.se.ultimate, { volume: 0.9 })
  }

  // 螺旋弾発射
  for (let i = 0; i < cfg.projectileCount; i++) {
    const angle = (i * cfg.spiralAngleStep) * Math.PI / 180
    const radius = cfg.spiralRadiusStart + (i * cfg.spiralRadiusStep)

    scene.time.delayedCall(i * cfg.spawnInterval, () => {
      const x = boss.x + Math.cos(angle) * radius
      const y = boss.y + Math.sin(angle) * radius
      const orb = fireOrbAt(scene, projectiles, x, y, player, cfg.projectileSpeed)
      orb.setData('damage', cfg.damage)

      if (cfg.tint) {
        const tintValue = parseInt(cfg.tint, 16)
        orb.setTint(tintValue)
      }
    })
  }

  boss.state = 'cooldown'
}
