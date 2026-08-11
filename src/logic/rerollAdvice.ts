export const REROLL_COSTS = [3_000, 6_000, 12_000, 24_000, 48_000] as const

/** Community-informed default guardrail, not a claim about optimal EV. */
export const DEFAULT_MAX_REROLL_COST = 6_000

/**
 * Posterior-predictive keep lines on the achievable-roll percentile scale. A
 * cheap first reroll asks the current board to beat 60% of modeled paid
 * rerolls; later steps use the median. A decision is robust only when the full
 * prior-sensitivity range lies on one side of the applicable line. Sulphur is
 * still protected separately by DEFAULT_MAX_REROLL_COST.
 */
export const KEEP_MODEL_PERCENTILE_LINES = [0.6, 0.5, 0.5, 0.5, 0.5] as const

export const clampRerollsUsed = (value: number): number =>
  Math.max(0, Math.min(REROLL_COSTS.length, Math.floor(Number.isFinite(value) ? value : 0)))

export const sulphurSpentAfter = (rerollsUsed: number): number =>
  REROLL_COSTS.slice(0, clampRerollsUsed(rerollsUsed)).reduce((sum, cost) => sum + cost, 0)
