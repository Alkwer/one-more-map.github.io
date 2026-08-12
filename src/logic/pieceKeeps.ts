// "Keep X of this chart type" model: each strategy recommends piece types
// (from its requirements); the user tunes how many of each to bank. The bank
// holds the BEST X matching charts for their strategy - everything beyond the
// keep count is an ordinary spendable chart.

import {
  MEATFISH_FUEL,
  SPEEDRUN_CENTER_MODS,
  STRATEGIES,
  STRATEGY_RESERVATION_OPTIONS,
  type StrategyReservationId,
  type StrategyReservationPreferences,
} from '../data/strategies'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import type { ChartData, Stat } from '../types'

export interface PieceType {
  /** stable key: strategyId + matcher fingerprint */
  key: string
  strategyId: string
  strategyName: string
  /** granular protection toggles that can gate charts in this family */
  reservationIds: StrategyReservationId[]
  label: string
  modIds?: string[]
  areaTypes?: string[]
  /** primary imported reward stat for ranking within this family */
  rankRewardStat?: Stat
  /** the strategy's own requirement count */
  recommended: number
  /** what we bank when the user hasn't set a count */
  defaultKeep: number
  /** false when an earlier type already banks this family (one knob per
   *  family); the type still counts for "this strategy wants these charts" */
  banks: boolean
}

/** claim priority: jackpot boards first, so shared pieces bank for them */
const STRATEGY_ORDER = [
  'divine-border-rares',
  'cutedog-divine-boxes',
  'milky-meatfish',
  'anchorfield-fishing',
  'milky-speedrun',
]

const RESERVATIONS_OF: Record<string, StrategyReservationId[]> = {
  'divine-border-rares': [
    'genericStrongboxes',
    'starfish',
    'globalRares',
    'adjacentRares',
    'seaPillars',
  ],
  'cutedog-divine-boxes': [
    'genericStrongboxes',
    'divinerStrongboxes',
    'arcanistStrongboxes',
    'operativeStrongboxes',
    'globalRares',
    'pelagicAbyss',
  ],
  'milky-meatfish': ['starfish', 'seaPillars', 'meatfish'],
  'anchorfield-fishing': [],
  'milky-speedrun': [
    'divinerStrongboxes',
    'arcanistStrongboxes',
    'operativeStrongboxes',
    'messages',
  ],
}

const ALL_RESERVATION_IDS = STRATEGY_RESERVATION_OPTIONS.map(({ id }) => id)

const matchesReservation = (
  chart: Pick<ChartData, 'modIds' | 'name' | 'areaType'>,
  id: StrategyReservationId,
): boolean => {
  const has = (...ids: string[]) => chart.modIds.some((modId) => ids.includes(modId))
  switch (id) {
    case 'genericStrongboxes':
      return has('adj-box-1', 'adj-box-2', 'adj-box-3')
    case 'divinerStrongboxes':
      return has('adj-divbox-1', 'adj-divbox-2')
    case 'arcanistStrongboxes':
      return has('adj-arcbox-1', 'adj-arcbox-2')
    case 'operativeStrongboxes':
      return has('adj-opbox-1', 'adj-opbox-2')
    case 'messages':
      return has('adj-msg-1', 'adj-msg-2')
    case 'starfish':
      return has('adj-star-1', 'adj-star-2')
    case 'globalRares':
      return has('voy-rare')
    case 'adjacentRares':
      return has('adj-rare-1', 'adj-rare-2')
    case 'seaPillars':
      return chart.areaType === 'sea-pillars' || chart.name.toLowerCase().includes('pillar')
    case 'pelagicAbyss':
      return chart.areaType === 'pelagic-abyss' || chart.name.toLowerCase().includes('pelagic')
    case 'meatfish':
      return has(
        'adj-pantheon',
        'adj-lantern',
        'voy-possess',
        'voy-fracture',
        'voy-noequip',
        'adj-wisps-1',
        'adj-wisps-2',
      )
  }
}

const reservationsForModifierType = (modIds: string[]) =>
  ALL_RESERVATION_IDS.filter((id) => matchesReservation({ modIds, name: '' }, id))

const protectionEnabled = (
  chart: ChartData,
  piece: PieceType,
  prefs: StrategyReservationPreferences,
) => {
  if (piece.reservationIds.length === 0) return true
  const matchingReservations = piece.reservationIds.filter((id) => matchesReservation(chart, id))
  if (matchingReservations.length === 0) return piece.key.startsWith('custom:')
  return matchingReservations.some((id) => prefs[id])
}

function buildPieceTypes(): PieceType[] {
  const out: PieceType[] = []
  // a later type whose matcher is a SUBSET of an earlier banking type must not
  // double-bank the same family (e.g. both Divine strats want increased-rares
  // charts) - one keep knob per family, sized for the HUNGRIEST strategy.
  // The later type still exists so its strategy "wants" those charts and may
  // spend the shared bank.
  const familyOwner = (p: { modIds?: string[]; areaTypes?: string[] }) =>
    out.find(
      (q) =>
        q.banks &&
        (!p.modIds || (q.modIds && p.modIds.every((id) => q.modIds!.includes(id)))) &&
        (!p.areaTypes || (q.areaTypes && p.areaTypes.every((a) => q.areaTypes!.includes(a)))),
    )
  for (const sid of STRATEGY_ORDER) {
    const s = STRATEGIES.find((x) => x.id === sid)!
    const sources = s.bankTypes
      ? s.bankTypes.map((bankType) => ({
          label: bankType.label,
          modIds: bankType.modIds,
          areaTypes: bankType.areaTypes,
          rankRewardStat: bankType.rankRewardStat,
          count: bankType.keep,
          keep: bankType.keep,
        }))
      : (s.requirements ?? []).map((requirement) => ({
          label: requirement.label,
          modIds: requirement.modIds,
          areaTypes: requirement.areaTypes,
          rankRewardStat: undefined,
          count: requirement.count,
          keep: requirement.modIds?.includes('voy-rare')
            ? requirement.count + 1
            : requirement.count,
        }))
    for (const source of sources) {
      const owner = familyOwner(source)
      if (owner) {
        owner.recommended = Math.max(owner.recommended, source.count)
        owner.defaultKeep = Math.max(owner.defaultKeep, source.keep)
      }
      const fingerprint = (source.modIds ?? source.areaTypes ?? []).join('|')
      out.push({
        key: `${s.id}:${fingerprint}`,
        strategyId: s.id,
        strategyName: s.name,
        reservationIds: RESERVATIONS_OF[s.id] ?? [],
        label: source.label,
        modIds: source.modIds,
        areaTypes: source.areaTypes,
        rankRewardStat: source.rankRewardStat,
        recommended: source.count,
        defaultKeep: source.keep,
        banks: !owner,
      })
    }
    if (s.id === 'milky-meatfish') {
      const fractures = { modIds: [...MEATFISH_FUEL] }
      const owner = familyOwner(fractures)
      out.push({
        key: `${s.id}:fracture`,
        strategyId: s.id,
        strategyName: s.name,
        reservationIds: ['meatfish'],
        label: 'Rare Fracture chart',
        modIds: fractures.modIds,
        recommended: 1,
        defaultKeep: 1,
        banks: !owner,
      })
    }
    if (s.id === 'milky-speedrun') {
      const centres = { modIds: [...SPEEDRUN_CENTER_MODS] }
      const owner = familyOwner(centres)
      if (owner) {
        owner.recommended = Math.max(owner.recommended, 2)
        owner.defaultKeep = Math.max(owner.defaultKeep, 2)
      }
      out.push({
        key: `${s.id}:centres`,
        strategyId: s.id,
        strategyName: s.name,
        reservationIds: RESERVATIONS_OF[s.id],
        label: 'Centre chart (Diviner’s / Operative’s / Message)',
        modIds: centres.modIds,
        recommended: 2,
        defaultKeep: 2,
        banks: !owner,
      })
    }
  }
  return out
}

export const PIECE_TYPES: PieceType[] = buildPieceTypes()

export function matchesPiece(c: ChartData, p: PieceType): boolean {
  return (
    (p.modIds?.some((id) => c.modIds.includes(id)) ?? false) ||
    (p.areaTypes && c.areaType ? p.areaTypes.includes(c.areaType) : false)
  )
}

/** best-first ranking inside a piece type: implicit tier, then rolls, then level */
const tierValue = (c: ChartData, p: PieceType) =>
  Math.max(
    0,
    ...c.modIds
      .filter((id) => p.modIds?.includes(id))
      .map((id) => voyageModById.get(id)?.effects[0]?.percent ?? 0),
  )
const rewardSum = (c: ChartData) => (c.rewards ?? []).reduce((s, e) => s + e.percent, 0)
const rewardStatValue = (c: ChartData, stat: Stat) =>
  (c.rewards ?? []).reduce((sum, reward) => sum + (reward.stat === stat ? reward.percent : 0), 0)

/** Best-first ranking within one family. A designated stat is always primary;
 * ties use implicit tier, total rewards, level, then stable chart uid. */
const comparePieceCharts = (a: ChartData, b: ChartData, piece: PieceType) =>
  (piece.rankRewardStat
    ? rewardStatValue(b, piece.rankRewardStat) - rewardStatValue(a, piece.rankRewardStat)
    : 0) ||
  tierValue(b, piece) - tierValue(a, piece) ||
  rewardSum(b) - rewardSum(a) ||
  b.level - a.level ||
  a.uid.localeCompare(b.uid)

/** does this strategy have any recommended piece type matching the chart?
 *  (a banked chart stays spendable by every strategy that wants its type) */
export function strategyWantsChart(
  strategyId: string | undefined,
  c: ChartData,
  keeps?: Record<string, number>,
): boolean {
  if (!strategyId) return false
  const customTypes = keeps ? customPieceTypes(keeps) : []
  return [...PIECE_TYPES, ...customTypes].some(
    (p) => p.strategyId === strategyId && matchesPiece(c, p),
  )
}

/** Stable key for a user-added chart type. Multi-tier families join IDs with '+'. */
export const customKey = (strategyId: string, modIds: string[]) =>
  `custom:${strategyId}:${modIds.join('+')}`

const stripTier = (value: string) => value.replace(/^\+?\d+(\s*[-–]\s*\d+)?%?\s*/, '').trim()

export function customLabel(modIds: string[]): string {
  const modifier = voyageModById.get(modIds[0])
  if (!modifier) return modIds.join(' + ')
  if (modIds.length === 1) return modifier.short ?? modifier.text
  return `${stripTier(modifier.short ?? modifier.text)} (any tier)`
}

export interface CustomOption {
  value: string
  label: string
  modIds: string[]
  scope: 'adjacent' | 'voyage'
}

/** Every addable chart type, grouped into tier families. */
export const CUSTOM_OPTIONS: CustomOption[] = (() => {
  const families = new Map<string, string[]>()
  for (const modifier of VOYAGE_MODS) {
    if (modifier.scope === 'self') continue
    const family = `${modifier.scope}:${modifier.id
      .replace(/^(adj|voy)-/, '')
      .replace(/-\d+$/, '')}`
    families.set(family, [...(families.get(family) ?? []), modifier.id])
  }
  return [...families.entries()]
    .map(([family, modIds]) => ({
      value: modIds.join('+'),
      label: customLabel(modIds),
      modIds,
      scope: (family.startsWith('global') ? 'voyage' : 'adjacent') as 'adjacent' | 'voyage',
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
})()

/** User-added chart types reconstructed from custom keep keys. */
export function customPieceTypes(keeps: Record<string, number>): PieceType[] {
  const out: PieceType[] = []
  for (const key of Object.keys(keeps)) {
    if (!key.startsWith('custom:')) continue
    const [, strategyId, joined] = key.split(':')
    const strategy = STRATEGIES.find((candidate) => candidate.id === strategyId)
    const modIds = (joined ?? '').split('+').filter((id) => voyageModById.has(id))
    if (!strategy || modIds.length === 0) continue
    out.push({
      key,
      strategyId,
      strategyName: strategy.name,
      // Custom types follow every granular category they actually match. A
      // modifier outside the known categories remains explicitly protected.
      reservationIds: reservationsForModifierType(modIds),
      label: customLabel(modIds),
      modIds,
      recommended: 0,
      defaultKeep: 0,
      banks: true,
    })
  }
  return out
}

/** Which charts are banked, and for whom. Claim order follows strategy
 * priority, followed by user-added types. */
export function selectPieceBank(
  pool: ChartData[],
  keeps: Record<string, number>,
  prefs: StrategyReservationPreferences,
): Map<string, PieceType> {
  const bank = new Map<string, PieceType>()
  for (const p of [...PIECE_TYPES, ...customPieceTypes(keeps)]) {
    if (!p.banks) continue
    const keep = keeps[p.key] ?? p.defaultKeep
    if (keep <= 0) continue
    pool
      .filter((c) => !bank.has(c.uid) && matchesPiece(c, p) && protectionEnabled(c, p, prefs))
      .sort((a, b) => comparePieceCharts(a, b, p))
      .slice(0, keep)
      .forEach((c) => bank.set(c.uid, p))
  }
  return bank
}
