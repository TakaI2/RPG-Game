/**
 * サバイバーモードの調整値。バランス調整はこのファイルだけを触ればよいようにまとめている。
 * 時間は ms、距離は px（ワールド座標）。
 */

export interface SurvivorRangedConfig {
  range: number        // この距離以内で停止して撃つ
  interval: number     // 発射間隔
  speed: number        // 弾速
  damage: number
  turnRate: number     // 追尾の強さ（既存 HomingOrb は 6.0）
  texture: string
}

export interface SurvivorEnemyKind {
  id: string
  texture: string      // スプライトシートのテクスチャキー
  animPrefix: string   // createEnemyAnimations のプレフィックス
  hp: number
  speed: number
  damage: number       // 接触ダメージ
  scale: number
  weight: number       // 出現の重み
  minTime: number      // この経過時間以降に出現
  ranged?: SurvivorRangedConfig
}

export const ENEMY_KINDS: readonly SurvivorEnemyKind[] = [
  { id: 'ghoul',  texture: 'solder',   animPrefix: 'blob',  hp: 3,  speed: 95,  damage: 4, scale: 1,    weight: 10, minTime: 0 },
  { id: 'runner', texture: 'vamp2',    animPrefix: 'vamp2', hp: 2,  speed: 155, damage: 3, scale: 0.9,  weight: 6,  minTime: 20_000 },
  {
    id: 'witch', texture: 'succubus', animPrefix: 'mage', hp: 5, speed: 80, damage: 3, scale: 1, weight: 4, minTime: 40_000,
    ranged: { range: 360, interval: 2600, speed: 230, damage: 5, turnRate: 1.2, texture: 'orb' },
  },
  { id: 'brute',  texture: 'mage',     animPrefix: 'brute', hp: 15, speed: 60,  damage: 8, scale: 1.35, weight: 3,  minTime: 60_000 },
]

export const SPAWN = {
  intervalStart: 900,
  intervalMin: 250,
  rampDuration: 180_000,      // この時間で intervalMin に到達
  extraPerTickEvery: 60_000,  // この時間ごとに1回の出現数 +1
  maxAlive: 70,
  distMin: 780,
  distMax: 920,
  retries: 8,
  recycleDistance: 1500,      // これ以上離れた敵は前方へ再配置
  poolSize: 90,
  // ボス戦中
  bossIntervalScale: 1.5,
  bossMaxAlive: 45,
  bossPhase2SummonInterval: 6000,
  bossPhase2SummonCount: 6,
  bossPhase2SummonRadius: 140,
} as const

export const ENEMY_AI = {
  knockbackSpeed: 280,
  knockbackDuration: 130,
  bodyWidth: 30,
  bodyHeight: 40,
} as const

export const MELEE = {
  radius: 105,
  cooldown: 520,
  damage: 3,
  bossDamage: 3,
  animLock: 260,              // hero-atk（4フレーム/14fps≒285ms）より少し短く
} as const

export const GAUGE = {
  max: 30,
  key: 'E',
} as const

export const BURST = {
  duration: 4000,
  interval: 35,
  streams: 4,
  spinDegPerSec: 300,
  speed: 560,
  range: 520,
  damage: 2,
  bossDamage: 1,
  bossHitCool: 90,
  poolSize: 160,
  texture: 'magic_fire',
} as const

export const BOSS = {
  engageDistance: 650,
  hitSeCool: 120,
} as const

export const RESULT_DISPLAY_MS = 2200

export const SE = {
  slash: 'se_player_attack',
  hit: 'se_enemy_hit',
  kill: 'se_enemy_hit',
  gaugeFull: 'boss_belladonna_circle_setup',
  burstStart: 'se_beam',
  burstLoop: 'se_flame',
  bossEngage: 'boss_belladonna_teleport',
  killSeCool: 70,
} as const

export const BGM = {
  boss: 'redmoon',
} as const

export const COLORS = {
  slash: 0xd8f4ff,
  slashCore: 0xffffff,
  spark: 0xfff2a8,
  blood: 0xc0103a,
  fire: 0xff7a1a,
  gaugeFill: 0xff7a1a,
  gaugeFull: 0xffd23f,
  gaugeBg: 0x1a0d0d,
  warning: 0xff2040,
} as const
