// Border reroll advisor: is the current set of 12 border rolls worth keeping,
// or is a reroll (Dead Man's Sulphur) expected to do better?
//
// Model: each of the 12 segments is an independent uniform draw from the
// border-mod pool (we have no datamined weights - the UI says so). The value
// of a set is the weight-scaled sum of its rolls; the advisor places the
// current set on the distribution of random sets via a normal approximation.

import { BORDER_MODS, borderModById } from '../data/mods'
import { borderRewardKey } from './rewards'
import type { StrategyDef } from '../data/strategies'
import type { Borders, Weights } from '../types'

export interface BorderAdvice {
  /** how many of the 12 segments have a border entered */
  filled: number
  /** weighted value of the entered borders */
  currentValue: number
  /** expected value of the same number of random rolls */
  meanValue: number
  /** where the current set sits among random sets, 0-100 */
  percentile: number
  verdict: 'jackpot' | 'keep' | 'coinflip' | 'reroll'
  jackpot: {
    label: string
    present: boolean
    /** chance at least one of 12 random segments rolls it, percent */
    chancePct: number
  }
}

/** weighted worth of one border mod (units only matter relative to each other) */
function modValue(id: string, weights: Weights): number {
  const mod = borderModById.get(id)
  if (!mod) return 0
  const w = weights[borderRewardKey(mod)] ?? 0
  return mod.effects.reduce((sum, e) => sum + w * e.percent, 0)
}

/** standard normal CDF (Abramowitz & Stegun 7.1.26 via erf) */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

export function adviseBorders(
  borders: Borders,
  weights: Weights,
  activeStrategy: StrategyDef | null,
): BorderAdvice {
  const entered = borders.filter((b): b is string => !!b)
  const filled = entered.length
  const currentValue = entered.reduce((sum, id) => sum + modValue(id, weights), 0)

  // distribution of a single uniform roll under these weights
  const values = BORDER_MODS.map((m) => modValue(m.id, weights))
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length

  const meanValue = filled * mean
  const sd = Math.sqrt(Math.max(variance * filled, 1e-9))
  const percentile = filled === 0 ? 50 : normalCdf((currentValue - meanValue) / sd) * 100

  // the roll the active strategy hinges on; the Divine border is the
  // mechanic's jackpot and worth tracking even in manual mode
  const target = activeStrategy?.requiresBorderId ?? {
    id: 'b-divine',
    label: '+1 Divine Orb per Rare border',
  }
  const present = borders.includes(target.id)
  const chancePct = (1 - Math.pow(1 - 1 / BORDER_MODS.length, 12)) * 100

  const verdict: BorderAdvice['verdict'] = present
    ? 'jackpot'
    : percentile >= 60
      ? 'keep'
      : percentile >= 40
        ? 'coinflip'
        : 'reroll'

  return {
    filled,
    currentValue,
    meanValue,
    percentile,
    verdict,
    jackpot: { label: target.label, present, chancePct },
  }
}
