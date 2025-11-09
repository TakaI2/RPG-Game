import Phaser from 'phaser'

/**
 * ボスの攻撃パターンタイプ
 */
export type AttackType =
  | 'projectile_radial'      // 放射状に弾を発射
  | 'projectile_circle'      // 円形に配置して発射
  | 'teleport_dash'          // テレポート→突進
  | 'ultimate'               // 必殺技（カスタム）

/**
 * ボスの状態
 */
export type BossState =
  | 'idle'          // 待機
  | 'windup'        // 予備動作
  | 'attacking'     // 攻撃中
  | 'cooldown'      // クールダウン
  | 'cutin'         // カットイン中
  | 'defeated'      // 撃破済み

/**
 * ボスのフェーズ
 */
export type BossPhase = 1 | 2

/**
 * 効果音設定
 */
export type SeConfig = {
  windup?: string | null
  fire?: string | null
  setup?: string | null
  teleport?: string | null
  dash?: string | null
  ultimate?: string | null
}

/**
 * カットイン設定
 */
export type CutinConfig = {
  enabled: boolean
  skillName: string
  duration: number
}

/**
 * セリフ設定
 */
export type SpeechConfig = {
  text: string
  duration: number
  color?: string
}

/**
 * カメラエフェクト設定
 */
export type CameraEffectsConfig = {
  darken?: {
    enabled: boolean
    alpha: number
    duration: number
  }
  flash?: {
    enabled: boolean
    duration: number
    color: [number, number, number]
  }
}

/**
 * BGM制御設定
 */
export type BgmControlConfig = {
  volumeDown: number
  duration: number
}

/**
 * 放射状攻撃の設定
 */
export type ProjectileRadialConfig = {
  windupDuration: number
  windupEffect: 'blink_red' | 'blink_yellow' | 'none'
  projectileCount: number
  projectileType: 'arrow' | 'orb'
  projectileSpeed: number
  damage: number
  angleOffset: number
}

/**
 * 円形配置攻撃の設定
 */
export type ProjectileCircleConfig = {
  projectileCount: number
  projectileType: 'orb' | 'arrow'
  radius: number
  waitDuration: number
  projectileSpeed: number
  damage: number
  tint?: string
}

/**
 * テレポート突進攻撃の設定
 */
export type TeleportDashConfig = {
  fadeOutDuration: number
  fadeInDuration: number
  teleportDistance: number
  windupDuration: number
  dashSpeed: number
  dashDuration: number
  damage: number
}

/**
 * 必殺技の設定
 */
export type UltimateConfig = {
  projectileCount: number
  projectileType: 'orb'
  spiralAngleStep: number
  spiralRadiusStep: number
  spiralRadiusStart: number
  spawnInterval: number
  projectileSpeed: number
  damage: number
  tint?: string
}

/**
 * 攻撃設定の共通部分
 */
export type AttackConfigBase = {
  id: string
  name: string
  type: AttackType
  se: SeConfig
  speech?: SpeechConfig | null
}

/**
 * 各攻撃タイプごとの設定
 */
export type AttackConfig = AttackConfigBase & (
  | { type: 'projectile_radial'; config: ProjectileRadialConfig }
  | { type: 'projectile_circle'; config: ProjectileCircleConfig }
  | { type: 'teleport_dash'; config: TeleportDashConfig }
  | {
      type: 'ultimate'
      config: UltimateConfig
      cutin: CutinConfig
      cameraEffects?: CameraEffectsConfig
      bgmControl?: BgmControlConfig
    }
)

/**
 * フェーズ設定
 */
export type PhaseConfig = {
  phase: BossPhase
  hpRange: [number, number]  // [min, max]
  attackCooldown: number      // 攻撃間隔の倍率（1.0が標準）
  patterns: string[]          // 使用する攻撃IDのリスト
}

/**
 * スプライト設定
 */
export type SpriteConfig = {
  key: string
  tint?: string
}

/**
 * カットイン画像設定
 */
export type CutinImageConfig = {
  image: string
  position: 'left' | 'right'
}

/**
 * ステータス設定
 */
export type StatsConfig = {
  hp: number
  speed: number
  scale: number
  damage: number
}

/**
 * セリフ集
 */
export type SpeechesConfig = {
  intro?: string
  phase2?: string
  lowHp?: string
  defeat?: string
}

/**
 * ボス設定（JSONから読み込む）
 */
export type BossConfig = {
  id: string
  name: string
  stats: StatsConfig
  sprite: SpriteConfig
  cutin: CutinImageConfig
  phases: PhaseConfig[]
  attacks: AttackConfig[]
  speeches: SpeechesConfig
  se: {
    damage: string
    defeat: string
  }
}

/**
 * ボススプライト型
 */
export type Boss = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  enemyType: 'boss'
  name: string
  state: BossState
  phase: BossPhase
  hp: number
  maxHp: number
  speed: number

  // 設定データ
  config: BossConfig

  // 攻撃管理
  currentAttackId: string | null
  attackStartTime: number
  lastAttackTime: number
  attackCooldown: number

  // 必殺技管理
  ultimateReady: boolean
  lastUltimateTime: number
  ultimateCooldown: number

  // セリフ表示フラグ
  phase2SpeechShown: boolean
  lowHpSpeechShown: boolean

  // テレポート突進用
  dashDirection: Phaser.Math.Vector2 | null
}
