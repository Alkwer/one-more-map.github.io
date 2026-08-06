import {
  DEFAULT_MAX_REROLL_COST,
  KEEP_FIT_LINES,
  KEEP_MODEL_PERCENTILE_LINES,
  REROLL_COSTS,
  clampRerollsUsed,
  sulphurSpentAfter,
} from './rerollAdvice'
import {
  contextualStrategyRecommendationPriority,
  type StrategyRecommendationTier,
} from '../data/strategies'
import {
  ABSOLUTE_STRATEGY_FIT,
  type RequiredBorderStatus,
  type StrategySuggestion,
} from './strategySuggestions'
import type { BorderRollForecast } from './borderRollModel'

export const ABSOLUTE_PLAYABLE_FIT = ABSOLUTE_STRATEGY_FIT

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
  keepModelPercentileLine: number | null
  decisionFitLine: number
  preserveRoll: boolean
  rollForecast: BorderRollForecast | null
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
  recommendationTier: StrategyRecommendationTier
  jackpot: boolean
  divineJackpot: boolean
  requiredBorderStatus: RequiredBorderStatus
  rollForecast: BorderRollForecast | null
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
  recommendationTier: evaluation.strategy.recommendationTier ?? 'specialized',
  jackpot: evaluation.jackpot,
  divineJackpot:
    evaluation.divineJackpot ??
    (evaluation.jackpot &&
      (evaluation.strategy.requiresBorderId?.id === 'b-divine' ||
        evaluation.strategy.id === 'divine-border-rares' ||
        evaluation.strategy.id === 'cutedog-divine-boxes')),
  requiredBorderStatus: evaluation.requiredBorderStatus ?? 'not-required',
  rollForecast: evaluation.potentialAppraisal?.rollForecast ?? null,
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
  const keepModelPercentileLine = KEEP_MODEL_PERCENTILE_LINES[rerollsUsed] ?? null
  const decisionFitLine = Math.max(ABSOLUTE_PLAYABLE_FIT, keepFitLine ?? ABSOLUTE_PLAYABLE_FIT)
  const base = {
    rerollsUsed,
    remainingRerolls: REROLL_COSTS.length - rerollsUsed,
    spent: sulphurSpentAfter(rerollsUsed),
    nextCost,
    keepFitLine,
    keepModelPercentileLine,
    decisionFitLine,
    preserveRoll: false,
    rollForecast: null,
  }

  const ranked = input.evaluations.map(candidateFrom).sort((a, b) => {
    const aMissingRequiredBorder = a.requiredBorderStatus === 'missing'
    const bMissingRequiredBorder = b.requiredBorderStatus === 'missing'
    if (aMissingRequiredBorder !== bMissingRequiredBorder) {
      return aMissingRequiredBorder ? 1 : -1
    }
    if (a.ready !== b.ready) return a.ready ? -1 : 1
    if (a.ready && b.ready) {
      // A higher-tier strategy wins only when its current borders are actually
      // playable. This lets a well-matched Alc & Go board beat a possible but
      // poorly supported Strongbox/Meatfish board.
      const aFitsCurrentBorders = input.enteredBorders === 12 ? hasFit(a, decisionFitLine) : null
      const bFitsCurrentBorders = input.enteredBorders === 12 ? hasFit(b, decisionFitLine) : null
      const priorityDifference =
        contextualStrategyRecommendationPriority(b, bFitsCurrentBorders) -
        contextualStrategyRecommendationPriority(a, aFitsCurrentBorders)
      if (priorityDifference !== 0) return priorityDifference
    }
    return b.rankScore - a.rankScore
  })

  // A Divine border remains the single exception that can be acted on before
  // every border is entered. Never lose it to an ordinary reroll prompt.
  const divineCandidates = ranked.filter((candidate) => candidate.divineJackpot)
  const divine =
    divineCandidates.find((candidate) => candidate.ready) ?? divineCandidates[0] ?? null
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
        rollForecast: divine.rollForecast,
      }
    }

    const alreadyActive = input.activeStrategyId === divine.strategyId
    return {
      ...base,
      kind: alreadyActive ? 'play' : 'switch',
      label: alreadyActive ? `PLAY: ${divine.strategyName}` : `SWITCH TO: ${divine.strategyName}`,
      reason: `A +1 Divine Orb border is present. ${divine.strategyName} is the best ready Divine variant for the ${input.availableCharts} imported charts. Preserve the roll and build its border-aware layout.`,
      strategyId: divine.strategyId,
      strategyName: divine.strategyName,
      fit: divine.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, divine),
      preserveRoll: true,
      rollForecast: divine.rollForecast,
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
      rollForecast: bestInventory?.rollForecast ?? null,
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
      rollForecast: bestInventory.rollForecast,
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
      rollForecast: bestReady.rollForecast,
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
      rollForecast: bestReady.rollForecast,
    }
  }

  const meetsContextFitLine = hasFit(bestReady, decisionFitLine)
  const meetsModelKeepLine =
    bestReady.rollForecast !== null &&
    keepModelPercentileLine !== null &&
    bestReady.rollForecast.currentPercentile >= keepModelPercentileLine

  if (meetsContextFitLine || meetsModelKeepLine) {
    const alreadyActive = input.activeStrategyId === bestReady.strategyId
    const fallbackReason =
      bestReady.recommendationTier === 'fallback'
        ? meetsContextFitLine
          ? ` No ready specialized strategy reaches the ${Math.round(
              decisionFitLine * 100,
            )}% contextual decision line, so the fitting fallback is preferred.`
          : ` No ready specialized strategy reaches the contextual decision line; Alc & Go remains the fallback candidate.`
        : ''
    const modeledReason = meetsModelKeepLine
      ? ` The experimental v${bestReady.rollForecast!.modelVersion} model ranks this board at the ${Math.round(
          bestReady.rollForecast!.currentPercentile * 100,
        )}th percentile of paid rerolls, meeting the ${Math.round(
          keepModelPercentileLine! * 100,
        )}th-percentile keep line (${bestReady.rollForecast!.modelConfidence} confidence).`
      : bestReady.rollForecast
        ? ` The model ranks it at the ${Math.round(
            bestReady.rollForecast.currentPercentile * 100,
          )}th percentile (${bestReady.rollForecast.modelConfidence} confidence).`
        : ''
    return {
      ...base,
      kind: alreadyActive ? 'play' : 'switch',
      label: alreadyActive
        ? `PLAY: ${bestReady.strategyName}`
        : `SWITCH TO: ${bestReady.strategyName}`,
      reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll. The best layout found reaches ${percent(
        bestReady.fit,
      )}${
        meetsContextFitLine
          ? `, meeting the ${Math.round(decisionFitLine * 100)}% contextual decision line.`
          : ', below the contextual decision line.'
      }${fallbackReason}${modeledReason}`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: bestReady.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
      rollForecast: bestReady.rollForecast,
    }
  }

  const linePercent = Math.round(decisionFitLine * 100)
  if (nextCost !== null && nextCost <= DEFAULT_MAX_REROLL_COST) {
    const modeledReason = bestReady.rollForecast
      ? ` The experimental model places this board at the ${Math.round(
          bestReady.rollForecast.currentPercentile * 100,
        )}th percentile and estimates a ${Math.round(
          bestReady.rollForecast.chanceNextRollBeatsCurrent * 100,
        )}% chance that a paid reroll scores higher (${bestReady.rollForecast.modelConfidence} confidence).`
      : ' Border probabilities are not available for this layout.'
    return {
      ...base,
      kind: 'reroll',
      label: `CONSIDER REROLL — next costs ${sulphur(nextCost)} Sulphur`,
      reason: `After combining all ${input.availableCharts} imported charts with the current border roll, the best ready strategy is ${bestReady.strategyName}. The best layout found reaches ${percent(
        bestReady.fit,
      )}, below the ${linePercent}% contextual decision line while the next roll remains inside the 3k/6k default guardrail.${modeledReason} This is experimental guidance, not Sulphur expected value.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      fit: bestReady.fit,
      missing: [],
      action: null,
      rollForecast: bestReady.rollForecast,
    }
  }

  const costReason =
    nextCost === null
      ? 'No further configured reroll remains.'
      : `Another attempt costs ${sulphur(nextCost)} Sulphur.`
  const modeledReason = bestReady.rollForecast
    ? ` The current board is at the ${Math.round(
        bestReady.rollForecast.currentPercentile * 100,
      )}th modeled percentile, with a ${Math.round(
        bestReady.rollForecast.chanceNextRollBeatsCurrent * 100,
      )}% estimated chance that a paid reroll scores higher.`
    : ''
  return {
    ...base,
    kind: 'stop',
    label: 'STOP REROLLING — KEEP THE CURRENT BOARD',
    reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll, but the best layout found reaches only ${percent(
      bestReady.fit,
    )}; this is not a quality endorsement.${modeledReason} ${costReason}`,
    strategyId: bestReady.strategyId,
    strategyName: bestReady.strategyName,
    fit: bestReady.fit,
    missing: [],
    action: null,
    rollForecast: bestReady.rollForecast,
  }
}
