// Per-reward weighting model. Every distinct implicit/border reward gets its own
// weight (instead of collapsing many rewards onto 17 broad stats), grouped by
// scope for the sliders. Keys and labels are derived from the mod ids/short
// labels so this stays in sync with the pool automatically.

import { BORDER_MODS, VOYAGE_MODS } from '../data/mods'
import type { BorderModDef, ModEffect, Stat, VoyageModDef } from '../types'
import { STAT_LABELS } from '../types'

export type RewardGroup = 'voyage' | 'adjacent' | 'self' | 'border'

export const GROUP_LABEL: Record<RewardGroup, string> = {
  voyage: 'Whole voyage',
  adjacent: 'Adjacent areas',
  self: 'This area (chart)',
  border: 'Border rolls',
}
export const GROUP_ORDER: RewardGroup[] = ['voyage', 'adjacent', 'self', 'border']

// prior per-stat priorities, used only to seed sensible per-reward defaults
const STAT_PRIORITY: Record<Stat, number> = {
  currency: 10,
  gold: 3,
  scarabs: 6,
  divcards: 6,
  essences: 4,
  spirits: 3,
  wisps: 5,
  rares: 4,
  magicmonsters: 2,
  sulphur: 4,
  packsize: 3,
  quantity: 5,
  rarity: 1,
  uniques: 3,
  treasure: 4,
  exp: 2,
  preserve: 3,
}

const familyOf = (id: string): string => id.replace(/^(adj|voy|cm|b)-/, '').replace(/-\d+$/, '')
const groupOfScope = (scope: string): RewardGroup =>
  scope === 'global' ? 'voyage' : scope === 'adjacent' ? 'adjacent' : 'self'

/** weight key for a chart implicit / map mod (scoped so adjacent vs voyage rares differ) */
export const voyageRewardKey = (m: VoyageModDef): string =>
  `${groupOfScope(m.scope)}:${familyOf(m.id)}`
/** weight key for a border roll */
export const borderRewardKey = (m: BorderModDef): string => `border:${familyOf(m.id)}`

const CHART_REWARD_FAMILY: Record<Stat, string> = {
  currency: 'currency',
  gold: 'gold',
  scarabs: 'scarabs',
  divcards: 'divcards',
  essences: 'essences',
  spirits: 'spirits',
  wisps: 'wisps',
  rares: 'rares',
  magicmonsters: 'magic',
  sulphur: 'sulph',
  packsize: 'pack',
  quantity: 'quant',
  rarity: 'rarity',
  uniques: 'uniques',
  treasure: 'treasure',
  exp: 'exp',
  preserve: 'preserve',
}

/** Header reward stats currently recognised by the chart text importer. */
export const CHART_REWARD_STATS: Stat[] = [
  'quantity',
  'rarity',
  'sulphur',
  'packsize',
  'scarabs',
  'currency',
]

const CHART_REWARD_MODIFIER_IDS = new Map<Stat, string[]>()
for (const modifier of VOYAGE_MODS) {
  if (modifier.scope !== 'self') continue
  for (const effect of modifier.effects) {
    const ids = CHART_REWARD_MODIFIER_IDS.get(effect.stat) ?? []
    if (!ids.includes(modifier.id)) ids.push(modifier.id)
    CHART_REWARD_MODIFIER_IDS.set(effect.stat, ids)
  }
}

export const chartRewardModifierIds = (stat: Stat): readonly string[] =>
  CHART_REWARD_MODIFIER_IDS.get(stat) ?? []

/** Imported headers aggregate away their source tier. Treat that aggregate as
 * disabled only when every known self-mod tier for the stat is disabled. */
export const importedChartRewardDisabled = (
  stat: Stat,
  disabledMods: ReadonlySet<string>,
): boolean => {
  const modifierIds = chartRewardModifierIds(stat)
  return modifierIds.length > 0 && modifierIds.every((id) => disabledMods.has(id))
}

/** weight key for an imported, self-scope chart header reward */
export const chartRewardKey = (stat: Stat): string => `self:${CHART_REWARD_FAMILY[stat]}`

const primaryStat = (effects: ModEffect[]): Stat | null => effects[0]?.stat ?? null

// strip leading counts ("+8-10 ", "10% ") to turn a tier's short label into a
// reward-family label
const cleanLabel = (s: string): string => s.replace(/^\+?\d+(\s*[-–]\s*\d+)?%?\s*/, '').trim()

export interface RewardType {
  key: string
  label: string
  group: RewardGroup
  default: number
}

function buildRewardTypes(): RewardType[] {
  const map = new Map<string, RewardType>()
  const add = (key: string, group: RewardGroup, label: string, stat: Stat | null) => {
    if (map.has(key) || !label) return
    map.set(key, { key, group, label, default: stat ? STAT_PRIORITY[stat] : 0 })
  }
  for (const stat of CHART_REWARD_STATS) {
    add(chartRewardKey(stat), 'self', STAT_LABELS[stat], stat)
  }
  for (const m of VOYAGE_MODS) {
    if (!m.effects.length) continue // flavour-only mods can't be weighted
    const stat = primaryStat(m.effects)
    const label = m.short ? cleanLabel(m.short) : stat ? STAT_LABELS[stat] : m.text
    add(voyageRewardKey(m), groupOfScope(m.scope), label, stat)
  }
  for (const m of BORDER_MODS) {
    if (!m.effects.length) continue
    const stat = primaryStat(m.effects)
    const label = m.short ? cleanLabel(m.short) : stat ? STAT_LABELS[stat] : m.text
    add(borderRewardKey(m), 'border', label, stat)
  }
  return [...map.values()]
}

export const REWARD_TYPES: RewardType[] = buildRewardTypes()

export const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  REWARD_TYPES.map((r) => [r.key, r.default]),
)
