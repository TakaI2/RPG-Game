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
  coin: number         // 撃破時に落とすコインの額
  ranged?: SurvivorRangedConfig
}

export const ENEMY_KINDS: readonly SurvivorEnemyKind[] = [
  { id: 'ghoul',  texture: 'solder',   animPrefix: 'blob',  hp: 3,  speed: 95,  damage: 4, scale: 1,    weight: 10, minTime: 0, coin: 1 },
  { id: 'runner', texture: 'vamp2',    animPrefix: 'vamp2', hp: 2,  speed: 155, damage: 3, scale: 0.9,  weight: 6,  minTime: 20_000, coin: 1 },
  {
    id: 'witch', texture: 'succubus', animPrefix: 'mage', hp: 5, speed: 80, damage: 3, scale: 1, weight: 4, minTime: 40_000, coin: 3,
    ranged: { range: 360, interval: 2600, speed: 230, damage: 5, turnRate: 1.2, texture: 'orb' },
  },
  { id: 'brute',  texture: 'mage',     animPrefix: 'brute', hp: 15, speed: 60,  damage: 8, scale: 1.35, weight: 3,  minTime: 60_000, coin: 5 },
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

/** 半径・威力・間隔は強化レベルで決まる（UPGRADE_VALUES） */
export const MELEE = {
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
  // 射程・威力は強化レベルで決まる（UPGRADE_VALUES）
  bossDamage: 1,
  bossHitCool: 90,
  poolSize: 160,
  texture: 'magic_fire',
} as const

export const BOSS = {
  engageDistance: 650,
  /** 起動演出の位置: ボス(0)〜プレイヤー(1) の補間。起動距離は画面の半分より遠いため */
  engageFxToward: 0.6,
  hitSeCool: 120,
} as const

export const RESULT_DISPLAY_MS = 2200

// ── ドロップアイテムと強化 ──

/** MainScene の初期HP（100）と揃える */
export const PLAYER = {
  maxHp: 100,
} as const

export const DROP = {
  chance: 0.06,              // 通常撃破で回復/強化を落とす確率
  healShare: 0.4,            // そのうち回復の割合
  lowHpHealBoost: 0.6,       // HP0% のとき healShare に加算（HP割合に比例して減る）
  guaranteeFirst: 25,        // 最初の確定強化までの撃破数
  guaranteeStep: 10,         // 確定ごとに次の必要数を増やす量
  guaranteeMax: 80,          // 必要数の上限
  bossCoins: 40,             // ボス撃破でばらまくコイン枚数
  bossCoinValue: 5,
  bossCoinRadius: 160,
} as const

export const PICKUP = {
  magnetRadius: 120,
  magnetMeleeMargin: 40,     // 斬撃範囲が広がったら「斬撃半径＋これ」まで吸い寄せる
  vacuumStartSpeed: 300,     // ボス撃破時の一斉吸い寄せの初速
  pickupRadius: 26,
  magnetAccel: 2200,
  magnetMaxSpeed: 900,
  coinLifetime: 20_000,
  coinBlinkMs: 3000,
  maxCoins: 120,             // 超えたら最古のコインに額を合算
  coinScaleStep: 0.04,       // 合算1回ごとのコイン拡大量
  coinScaleMax: 1.8,
  popDistance: 28,
  popDuration: 260,
  healAmount: 25,
  bobAmplitude: 4,
  bobPeriod: 900,
  depth: 5,                  // 敵（6）の下
} as const

export type UpgradeId = 'slashRange' | 'slashPower' | 'boomerang' | 'flamePower' | 'flameRange'

export interface UpgradeDef {
  id: UpgradeId
  label: string
  color: number
  max: number
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'slashRange', label: '斬撃範囲',     color: 0x6ad8ff, max: 5 },
  { id: 'slashPower', label: '斬撃威力',     color: 0xf0f0ff, max: 5 },
  { id: 'boomerang',  label: 'ブーメラン刃', color: 0x9dff6a, max: 5 },
  { id: 'flamePower', label: '火炎威力',     color: 0xff7a1a, max: 5 },
  { id: 'flameRange', label: '火炎射程',     color: 0xffd23f, max: 5 },
]

/** Lv0〜Lv5 の値（Lv0 は強化なしの状態） */
export const UPGRADE_VALUES = {
  meleeRadius:   [105, 125, 145, 165, 185, 210],
  meleeDamage:   [3, 4, 5, 6, 8, 10],
  meleeCooldown: [520, 490, 460, 430, 400, 370],
  bladeCount:    [0, 1, 1, 2, 2, 3],
  bladeDamage:   [0, 3, 4, 4, 5, 6],
  burstDamage:   [2, 3, 4, 5, 6, 8],
  burstRange:    [520, 600, 680, 760, 840, 940],
} as const

export const BLADE = {
  interval: 1600,
  texture: 'magic_slash',
  outDistance: 300,
  outDuration: 420,
  returnSpeed: 700,
  returnCatchRadius: 30,     // プレイヤーにこの距離まで戻ったら消える
  maxReturnMs: 2000,
  hitRadius: 34,
  spinDegPerSec: 900,
  scale: 1.1,
  rehitCooldown: 250,
  bossDamageScale: 0.5,
  spreadDeg: 25,
  depth: 11,
} as const

export const SE = {
  slash: 'se_player_attack',
  hit: 'se_enemy_hit',
  kill: 'se_enemy_hit',
  gaugeFull: 'boss_belladonna_circle_setup',
  burstStart: 'se_beam',
  burstLoop: 'se_flame',
  bossEngage: 'boss_belladonna_teleport',
  killSeCool: 70,
  coin: 'se_beat',
  coinRate: 1.8,
  coinVolume: 0.25,
  coinSeCool: 60,
  heal: 'se_charm',
  upgrade: 'boss_belladonna_circle_setup',
  upgradeRate: 1.3,
  blade: 'se_player_attack',
  bladeRate: 1.6,
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
  coin: 0xffd23f,
  coinEdge: 0xb07a10,
  heal: 0xff5a7a,
} as const
