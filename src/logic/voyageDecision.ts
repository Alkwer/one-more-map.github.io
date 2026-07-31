import { KEEP_FIT_LINES, REROLL_COSTS, clampRerollsUsed, sulphurSpentAfter } from './rerollAdvice'
import type { RequiredBorderStatus, StrategySuggestion } from './strategySuggestions'

export const ABSOLUTE_PLAYABLE_FIT = 0.5

export type VoyageDecisionKind = 'needs-data' | 'play' | 'switch' | 'wait' | 'reroll' | 'stop'

export interface VoyageDecisionAction {
  kind: 'select-strategy'
  label: string
  strategyId: string
}

export interface VoyageDecision {
  kind: VoyageDecisionKind
  label: string
  reason: string
  strategyId: string | null
  strategyName: string | null
  fit: number | null
  missing: string[]
  action: VoyageDecisionAction | null
  rerollsUsed: number
  remainingRerolls: number
  spent: number
  nextCost: number | null
  keepFitLine: number | null
  decisionFitLine: number
  preserveRoll: boolean
}

export interface VoyageDecisionInput {
  /** Inventory-ranked evaluations; their order must not depend on the manual board. */
  evaluations: StrategySuggestion[]
  activeStrategyId: string | null
  availableCharts: number
  enteredBorders: number
  rerollsUsed: number
}

interface DecisionCandidate {
  strategyId: string
  strategyName: string
  fit: number | null
  ready: boolean
  missing: string[]
  rankScore: number
  jackpot: boolean
  requiredBorderStatus: RequiredBorderStatus
}

const percent = (fit: number | null) =>
  fit === null ? 'no measurable fit' : `${Math.round(fit * 100)}% fit`

const sulphur = (value: number) => value.toLocaleString('en-US')

const candidateFrom = (evaluation: StrategySuggestion): DecisionCandidate => ({
  strategyId: evaluation.strategy.id,
  strategyName: evaluation.strategy.name,
  fit: evaluation.fit,
  ready: evaluation.readiness.ready,
  missing: evaluation.readiness.missing,
  rankScore: evaluation.rankScore,
  jackpot: evaluation.jackpot,
  requiredBorderStatus: evaluation.requiredBorderStatus ?? 'not-required',
})

const actionFor = (
  activeStrategyId: string | null,
  candidate: DecisionCandidate,
): VoyageDecisionAction | null =>
  activeStrategyId === candidate.strategyId
    ? null
    : {
        kind: 'select-strategy',
        label: `Activate ${candidate.strategyName}`,
        strategyId: candidate.strategyId,
      }

const hasFit = (candidate: DecisionCandidate, line: number) =>
  candidate.fit !== null && candidate.fit >= line

export function decideVoyage(input: VoyageDecisionInput): VoyageDecision {
  const rerollsUsed = clampRerollsUsed(input.rerollsUsed)
  const nextCost = REROLL_COSTS[rerollsUsed] ?? null
  const keepFitLine = KEEP_FIT_LINES[rerollsUsed] ?? null
  const decisionFitLine = Math.max(ABSOLUTE_PLAYABLE_FIT, keepFitLine ?? ABSOLUTE_PLAYABLE_FIT)
  const base = {
    rerollsUsed,
    remainingRerolls: REROLL_COSTS.length - rerollsUsed,
    spent: sulphurSpentAfter(rerollsUsed),
    nextCost,
    keepFitLine,
    decisionFitLine,
    preserveRoll: false,
  }

  const ranked = input.evaluations.map(candidateFrom).sort((a, b) => {
    const aMissingRequiredBorder = a.requiredBorderStatus === 'missing'
    const bMissingRequiredBorder = b.requiredBorderStatus === 'missing'
    if (aMissingRequiredBorder !== bMissingRequiredBorder) {
      return aMissingRequiredBorder ? 1 : -1
    }
    return b.rankScore - a.rankScore
  })

  // A Divine border remains the single exception that can be acted on before
  // every border is entered. Never lose it to an ordinary reroll prompt.
  const divine = ranked.find(
    (candidate) => candidate.strategyId === 'divine-border-rares' && candidate.jackpot,
  )
  if (divine) {
    if (!divine.ready) {
      return {
        ...base,
        kind: 'wait',
        label: `WAIT — missing pieces for ${divine.strategyName}`,
        reason: `Preserve the Divine border. Across all ${input.availableCharts} imported charts, ${divine.strategyName} still needs ${divine.missing.join(
          ', ',
        )}.`,
        strategyId: divine.strategyId,
        strategyName: divine.strategyName,
        fit: divine.fit,
        missing: divine.missing,
        action: null,
        preserveRoll: true,
      }
    }

    const alreadyActive = input.activeStrategyId === divine.strategyId
    return {
      ...base,
      kind: alreadyActive ? 'play' : 'switch',
      label: alreadyActive ? `PLAY: ${divine.strategyName}` : `SWITCH TO: ${divine.strategyName}`,
      reason: `A +1 Divine Orb border is present and all required pieces are available across the ${input.availableCharts} imported charts. Preserve the roll and build the recommended layout.`,
      strategyId: divine.strategyId,
      strategyName: divine.strategyName,
      fit: divine.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, divine),
    }
  }

  const bestReady =
    ranked.find((candidate) => candidate.ready && candidate.requiredBorderStatus !== 'missing') ??
    null
  const bestInventory = bestReady ?? ranked[0] ?? null

  if (!bestInventory || input.availableCharts === 0) {
    return {
      ...base,
      kind: 'needs-data',
      label: 'IMPORT CHARTS',
      reason:
        'Import your available charts first. Strategy discovery evaluates the full library, not the manually arranged board.',
      strategyId: null,
      strategyName: null,
      fit: null,
      missing: [],
      action: null,
    }
  }

  if (!bestReady) {
    return {
      ...base,
      kind: 'wait',
      label: `WAIT — missing pieces for ${bestInventory.strategyName}`,
      reason: `${bestInventory.strategyName} is the strongest charts + border match, but none of the curated strategies is runnable from all ${input.availableCharts} imported charts yet. Still needed: ${bestInventory.missing.join(
        ', ',
      )}.`,
      strategyId: bestInventory.strategyId,
      strategyName: bestInventory.strategyName,
      fit: bestInventory.fit,
      missing: bestInventory.missing,
      action: null,
    }
  }

  if (input.enteredBorders < 12) {
    const bordersMissing = 12 - input.enteredBorders
    return {
      ...base,
      kind: 'needs-data',
      label: 'ENTER ALL BORDERS',
      reason: `${bestReady.strategyName} currently leads after combining all ${input.availableCharts} imported charts with the partial border roll. Enter ${bordersMissing} more border${
        bordersMissing === 1 ? '' : 's'
      } to complete the recommendation before issuing the play or reroll decision.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: bestReady.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
    }
  }

  if (bestReady.fit === null) {
    return {
      ...base,
      kind: 'needs-data',
      label: 'NO WEIGHTED ROLL SIGNAL',
      reason: `${bestReady.strategyName} is the best strategy after combining the chart library and border roll, but the roll has no comparable weighted value for the best layout found.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: null,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
    }
  }

  if (hasFit(bestReady, decisionFitLine)) {
    const alreadyActive = input.activeStrategyId === bestReady.strategyId
    return {
      ...base,
      kind: alreadyActive ? 'play' : 'switch',
      label: alreadyActive
        ? `PLAY: ${bestReady.strategyName}`
        : `SWITCH TO: ${bestReady.strategyName}`,
      reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll. The best layout found reaches ${percent(
        bestReady.fit,
      )}, meeting the ${Math.round(decisionFitLine * 100)}% decision line.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: bestReady.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
    }
  }

  const linePercent = Math.round(decisionFitLine * 100)
  if (nextCost !== null && nextCost <= 12_000) {
    return {
      ...base,
      kind: 'reroll',
      label: `REROLL — next costs ${sulphur(nextCost)} Sulphur`,
      reason: `After combining all ${input.availableCharts} imported charts with the current border roll, the best ready strategy is ${bestReady.strategyName}. The best layout found reaches ${percent(
        bestReady.fit,
      )}, below the ${linePercent}% decision line while another roll is still inexpensive.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: bestReady.fit,
      missing: [],
      action: null,
    }
  }

  const costReason =
    nextCost === null
      ? 'The five-reroll cap is already reached.'
      : `Another attempt costs ${sulphur(nextCost)} Sulphur.`
  return {
    ...base,
    kind: 'stop',
    label: "DON'T PAY FOR ANOTHER REROLL",
    reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll, but the best layout found reaches only ${percent(
      bestReady.fit,
    )}; this is not a quality endorsement. ${costReason}`,
    strategyId: bestReady.strategyId,
    strategyName: bestReady.strategyName,
    fit: bestReady.fit,
    missing: [],
    action: null,
  }
}
