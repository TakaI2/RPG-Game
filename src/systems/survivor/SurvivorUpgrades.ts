import { UPGRADE_VALUES, UPGRADES, type UpgradeDef, type UpgradeId } from './SurvivorConfig'

/**
 * サバイバーモードの強化レベルと、レベルから求める戦闘数値。
 * Lv0 は強化なし（従来の数値）。
 */

export interface UpgradeStatus {
  id: UpgradeId
  label: string
  color: number
  level: number
  max: number
}

export interface SurvivorUpgrades {
  level(id: UpgradeId): number
  isMaxed(id: UpgradeId): boolean
  /** Lv+1。上限なら false */
  levelUp(id: UpgradeId): boolean
  /** 上限でない強化から等確率で1つ。全部上限なら null */
  pickRandom(): UpgradeId | null
  def(id: UpgradeId): UpgradeDef
  all(): UpgradeStatus[]
  meleeRadius(): number
  meleeDamage(): number
  meleeCooldown(): number
  bladeCount(): number
  bladeDamage(): number
  burstDamage(): number
  burstRange(): number
  reset(): void
}

const valueAt = (values: readonly number[], level: number): number =>
  values[Math.min(Math.max(level, 0), values.length - 1)]

export function createSurvivorUpgrades(): SurvivorUpgrades {
  const levels = new Map<UpgradeId, number>()

  const level = (id: UpgradeId): number => levels.get(id) ?? 0
  const def = (id: UpgradeId): UpgradeDef => {
    const d = UPGRADES.find(u => u.id === id)
    if (!d) throw new Error(`Unknown upgrade: ${id}`)
    return d
  }
  const isMaxed = (id: UpgradeId): boolean => level(id) >= def(id).max

  return {
    level,
    isMaxed,
    levelUp: (id) => {
      if (isMaxed(id)) return false
      levels.set(id, level(id) + 1)
      return true
    },
    pickRandom: () => {
      const pool = UPGRADES.filter(u => !isMaxed(u.id))
      if (pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)].id
    },
    def,
    all: () => UPGRADES.map(u => ({ id: u.id, label: u.label, color: u.color, level: level(u.id), max: u.max })),
    meleeRadius: () => valueAt(UPGRADE_VALUES.meleeRadius, level('slashRange')),
    meleeDamage: () => valueAt(UPGRADE_VALUES.meleeDamage, level('slashPower')),
    meleeCooldown: () => valueAt(UPGRADE_VALUES.meleeCooldown, level('slashPower')),
    bladeCount: () => valueAt(UPGRADE_VALUES.bladeCount, level('boomerang')),
    bladeDamage: () => valueAt(UPGRADE_VALUES.bladeDamage, level('boomerang')),
    burstDamage: () => valueAt(UPGRADE_VALUES.burstDamage, level('flamePower')),
    burstRange: () => valueAt(UPGRADE_VALUES.burstRange, level('flameRange')),
    reset: () => { levels.clear() },
  }
}
