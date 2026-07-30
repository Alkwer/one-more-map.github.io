import type { BorderAppraisalStatus } from './borderAppraisal'

export const REROLL_COSTS = [3_000, 6_000, 12_000, 24_000, 48_000] as const

/**
 * Contextual-fit keep lines for each next-cost step. A cheap early reroll asks
 * more of the current board; an expensive late reroll lowers the keep line.
 * These are intentionally visible heuristic thresholds, not probability/EV.
 */
export const KEEP_FIT_LINES = [0.6, 0.5, 0.4, 0.3, 0.2] as const

export type RerollRecommendation = 'needs-data' | 'keep' | 'reroll' | 'stop'

export interface RerollAdviceInput {
  fit: number | null
  status: BorderAppraisalStatus
  placedCharts: number
  enteredBorders: number
  rerollsUsed: number
  divineJackpot: boolean
}

export interface RerollAdvice {
  recommendation: RerollRecommendation
  label: string
  reason: string
  rerollsUsed: number
  remainingRerolls: number
  spent: number
  nextCost: number | null
  keepFitLine: number | null
  fit: number | null
}

export const clampRerollsUsed = (value: number): number =>
  Math.max(0, Math.min(REROLL_COSTS.length, Math.floor(Number.isFinite(value) ? value : 0)))

export const sulphurSpentAfter = (rerollsUsed: number): number =>
  REROLL_COSTS.slice(0, clampRerollsUsed(rerollsUsed)).reduce(
    (sum, cost) => sum + cost,
    0,
  )

export function adviseReroll(input: RerollAdviceInput): RerollAdvice {
  const rerollsUsed = clampRerollsUsed(input.rerollsUsed)
  const nextCost = REROLL_COSTS[rerollsUsed] ?? null
  const keepFitLine = KEEP_FIT_LINES[rerollsUsed] ?? null
  const base = {
    rerollsUsed,
    remainingRerolls: REROLL_COSTS.length - rerollsUsed,
    spent: sulphurSpentAfter(rerollsUsed),
    nextCost,
    keepFitLine,
    fit: input.fit,
  }

  if (input.divineJackpot) {
    return {
      ...base,
      recommendation: 'keep',
      label: 'KEEP — DIVINE JACKPOT',
      reason:
        'A +1 Divine Orb border is present. Preserve this roll and build Divine Border Rares around it.',
    }
  }

  if (input.placedCharts < 9 || input.enteredBorders < 12 || input.status === 'incomplete') {
    return {
      ...base,
      recommendation: 'needs-data',
      label: 'COMPLETE THE BOARD',
      reason: `Need ${9 - Math.min(9, input.placedCharts)} more chart${
        input.placedCharts === 8 ? '' : 's'
      } and ${12 - Math.min(12, input.enteredBorders)} more border${
        input.enteredBorders === 11 ? '' : 's'
      } for a contextual decision.`,
    }
  }

  if (input.fit === null || input.status === 'unscored' || input.status === 'empty') {
    return {
      ...base,
      recommendation: 'needs-data',
      label: 'NO WEIGHTED SIGNAL',
      reason:
        'The current reward weights give these borders no comparable value. Adjust weights or choose a strategy first.',
    }
  }

  if (nextCost === null || keepFitLine === null) {
    return {
      ...base,
      recommendation: 'stop',
      label: 'STOP — REROLL CAP REACHED',
      reason:
        'Five paid rerolls are already recorded. Run this board or start a new Voyage cycle.',
    }
  }

  const fitPercent = Math.round(input.fit * 100)
  const linePercent = Math.round(keepFitLine * 100)

  if (input.fit >= keepFitLine) {
    return {
      ...base,
      recommendation: 'keep',
      label: 'KEEP THIS ROLL',
      reason: `${fitPercent}% contextual fit meets the ${linePercent}% keep line at a ${nextCost.toLocaleString('en-US')} Sulphur next cost.`,
    }
  }

  if (nextCost <= 12_000) {
    return {
      ...base,
      recommendation: 'reroll',
      label: 'CONSIDER REROLL',
      reason: `${fitPercent}% contextual fit is below the ${linePercent}% early-roll keep line; the next attempt costs ${nextCost.toLocaleString('en-US')} Sulphur.`,
    }
  }

  return {
    ...base,
    recommendation: 'stop',
    label: 'STOP REROLLING',
    reason: `${fitPercent}% contextual fit is below the ${linePercent}% keep line, but another attempt costs ${nextCost.toLocaleString('en-US')} Sulphur. The heuristic favours running this board instead of chasing a better roll.`,
  }
}
