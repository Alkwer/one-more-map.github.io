export const REROLL_COSTS = [3_000, 6_000, 12_000, 24_000, 48_000] as const

/** Community-informed default guardrail, not a claim about optimal EV. */
export const DEFAULT_MAX_REROLL_COST = 6_000

/**
 * Contextual-fit keep lines for each next-cost step. The first cheap reroll
 * asks more of the current board; later steps retain the absolute 50% play
 * floor. These are visible heuristic thresholds, not probability/EV.
 */
export const KEEP_FIT_LINES = [0.6, 0.5, 0.5, 0.5, 0.5] as const

export const clampRerollsUsed = (value: number): number =>
  Math.max(0, Math.min(REROLL_COSTS.length, Math.floor(Number.isFinite(value) ? value : 0)))

export const sulphurSpentAfter = (rerollsUsed: number): number =>
  REROLL_COSTS.slice(0, clampRerollsUsed(rerollsUsed)).reduce((sum, cost) => sum + cost, 0)
