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
  MIN_FALLBACK_RECOMMENDATION_FIT,
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
  recommendationTier: StrategyRecommendationTier | null
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
    recommendationTier: null as StrategyRecommendationTier | null,
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
      // Contextual fit boosts a fitting candidate above weak tiers. Below the
      // fit line, fixed tiers keep a weak fallback behind a ready specialized
      // strategy; a fitting Alc & Go can still beat a weak specialization.
      const aFitsCurrentBorders =
        input.enteredBorders === 12 ? hasFit(a, MIN_FALLBACK_RECOMMENDATION_FIT) : null
      const bFitsCurrentBorders =
        input.enteredBorders === 12 ? hasFit(b, MIN_FALLBACK_RECOMMENDATION_FIT) : null
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
        recommendationTier: divine.recommendationTier,
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
      recommendationTier: divine.recommendationTier,
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
      recommendationTier: bestInventory.recommendationTier,
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
      recommendationTier: bestReady.recommendationTier,
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
      recommendationTier: bestReady.recommendationTier,
      fit: null,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
      rollForecast: bestReady.rollForecast,
    }
  }

  const meetsContextFitLine = hasFit(bestReady, decisionFitLine)
  const canUseRelativeModelKeep =
    bestReady.recommendationTier !== 'fallback' ||
    hasFit(bestReady, MIN_FALLBACK_RECOMMENDATION_FIT)
  const meetsModelKeepLine =
    canUseRelativeModelKeep &&
    bestReady.rollForecast !== null &&
    keepModelPercentileLine !== null &&
    bestReady.rollForecast.currentPercentile >= keepModelPercentileLine
  const specializedAlternative =
    bestReady.recommendationTier === 'fallback'
      ? (ranked.find(
          (candidate) =>
            candidate.ready &&
            candidate.requiredBorderStatus !== 'missing' &&
            candidate.recommendationTier === 'specialized',
        ) ?? null)
      : null
  const fallbackMinimumReason =
    bestReady.recommendationTier === 'fallback' &&
    !hasFit(bestReady, MIN_FALLBACK_RECOMMENDATION_FIT)
      ? ` ${bestReady.strategyName} is below the ${Math.round(
          MIN_FALLBACK_RECOMMENDATION_FIT * 100,
        )}% minimum for fallback preference, so a relative model percentile cannot promote it to PLAY or SWITCH.`
      : ''

  if (meetsContextFitLine || meetsModelKeepLine) {
    const alreadyActive = input.activeStrategyId === bestReady.strategyId
    const isFallback = bestReady.recommendationTier === 'fallback'
    const selectionReason = isFallback
      ? `${bestReady.strategyName} is the recommended fallback after combining all ${input.availableCharts} imported charts with the current border roll; it is not the only runnable strategy.`
      : `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll.`
    const specializedAlternativeReason = specializedAlternative
      ? ` ${specializedAlternative.strategyName} is also runnable and is the strongest specialized alternative at ${percent(
          specializedAlternative.fit,
        )}, but it remains below the ${Math.round(
          decisionFitLine * 100,
        )}% contextual decision line.`
      : isFallback
        ? ` No ready specialized strategy reaches the ${Math.round(
            decisionFitLine * 100,
          )}% contextual decision line.`
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
      label: isFallback
        ? alreadyActive
          ? `PLAY FALLBACK: ${bestReady.strategyName}`
          : `SWITCH TO FALLBACK: ${bestReady.strategyName}`
        : alreadyActive
          ? `PLAY: ${bestReady.strategyName}`
          : `SWITCH TO: ${bestReady.strategyName}`,
      reason: `${selectionReason} The best layout found reaches ${percent(bestReady.fit)}${
        meetsContextFitLine
          ? `, meeting the ${Math.round(decisionFitLine * 100)}% contextual decision line.`
          : ', below the contextual decision line.'
      }${specializedAlternativeReason}${modeledReason}`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      recommendationTier: bestReady.recommendationTier,
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
      )}, below the ${linePercent}% contextual decision line while the next roll remains inside the 3k/6k default guardrail.${fallbackMinimumReason}${modeledReason} This is experimental guidance, not Sulphur expected value.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      recommendationTier: bestReady.recommendationTier,
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
    )}; this is not a quality endorsement.${fallbackMinimumReason}${modeledReason} ${costReason}`,
    strategyId: bestReady.strategyId,
    strategyName: bestReady.strategyName,
    recommendationTier: bestReady.recommendationTier,
    fit: bestReady.fit,
    missing: [],
    action: null,
    rollForecast: bestReady.rollForecast,
  }
}
