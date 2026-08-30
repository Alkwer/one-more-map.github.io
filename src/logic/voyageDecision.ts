import { formatNumber } from '../i18n/locale'
import {
  DEFAULT_MAX_REROLL_COST,
  KEEP_MODEL_PERCENTILE_LINES,
  REROLL_COSTS,
  clampRerollsUsed,
  sulphurSpentAfter,
} from './rerollAdvice'
import {
  MIN_FALLBACK_RECOMMENDATION_PERCENTILE,
  rollAwareStrategyRecommendationPriority,
  type StrategyRecommendationTier,
} from '../data/strategies'
import type {
  RequiredBorderStatus,
  StrategyLayoutStatus,
  StrategySuggestion,
} from './strategySuggestions'
import type { BorderRollForecast } from './borderRollModel'

export type VoyageDecisionKind = 'needs-data' | 'play' | 'switch' | 'wait' | 'reroll' | 'stop'
export type VoyageDecisionBasis =
  | 'insufficient-data'
  | 'divine-exception'
  | 'missing-requirements'
  | 'layout-uncertainty'
  | 'modeled-percentile'
  | 'model-uncertainty'
  | 'no-modeled-upside'
  | 'cost-guardrail'

export interface VoyageDecisionAction {
  kind: 'select-strategy'
  label: string
  strategyId: string
}

export interface VoyageDecision {
  kind: VoyageDecisionKind
  /** Machine-readable reason for audits and future recommendation telemetry. */
  decisionBasis: VoyageDecisionBasis
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
  keepModelPercentileLine: number | null
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
  layoutStatus: StrategyLayoutStatus
}

const percent = (fit: number | null) =>
  fit === null ? 'no measurable ratio' : `${Math.round(fit * 100)}%`

const sulphur = (value: number) => formatNumber(value)

const candidateFrom = (evaluation: StrategySuggestion): DecisionCandidate => {
  const layoutStatus =
    evaluation.layoutStatus ?? (evaluation.readiness.ready ? 'found' : 'not-evaluated')
  return {
    strategyId: evaluation.strategy.id,
    strategyName: evaluation.strategy.name,
    fit: evaluation.fit,
    ready: evaluation.readiness.ready && layoutStatus === 'found',
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
    layoutStatus,
  }
}

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

const robustPercentile = (candidate: DecisionCandidate): number | null =>
  candidate.rollForecast?.currentPercentileRange[0] ?? null

const robustlyMeetsPercentile = (candidate: DecisionCandidate, line: number): boolean => {
  const percentile = robustPercentile(candidate)
  return percentile !== null && percentile >= line
}

const ordinal = (value: number): string => {
  const integer = Math.round(value)
  const remainder100 = integer % 100
  const suffix =
    remainder100 >= 11 && remainder100 <= 13
      ? 'th'
      : integer % 10 === 1
        ? 'st'
        : integer % 10 === 2
          ? 'nd'
          : integer % 10 === 3
            ? 'rd'
            : 'th'
  return `${integer}${suffix}`
}

const percentileLabel = (value: number): string => `${ordinal(value * 100)} percentile`

const percentileRangeLabel = (range: readonly [number, number]): string =>
  `${Math.round(range[0] * 100)}–${Math.round(range[1] * 100)} percentile`

const improvementChanceLabel = (chance: number): string => {
  if (chance <= 0) return '0%'
  if (chance < 0.01) return '<1%'
  return `${Math.round(chance * 100)}%`
}

export function decideVoyage(input: VoyageDecisionInput): VoyageDecision {
  const rerollsUsed = clampRerollsUsed(input.rerollsUsed)
  const nextCost = REROLL_COSTS[rerollsUsed] ?? null
  const keepModelPercentileLine = KEEP_MODEL_PERCENTILE_LINES[rerollsUsed] ?? null
  const base = {
    rerollsUsed,
    remainingRerolls: REROLL_COSTS.length - rerollsUsed,
    spent: sulphurSpentAfter(rerollsUsed),
    nextCost,
    keepModelPercentileLine,
    recommendationTier: null as StrategyRecommendationTier | null,
    decisionBasis: 'insufficient-data' as VoyageDecisionBasis,
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
      // Compare each candidate with achievable rolls for that same strategy.
      // Without a complete modeled comparison, retain the fixed policy tiers.
      const aHasStrongCurrentRoll =
        input.enteredBorders === 12
          ? robustlyMeetsPercentile(a, MIN_FALLBACK_RECOMMENDATION_PERCENTILE)
          : null
      const bHasStrongCurrentRoll =
        input.enteredBorders === 12
          ? robustlyMeetsPercentile(b, MIN_FALLBACK_RECOMMENDATION_PERCENTILE)
          : null
      const priorityDifference =
        rollAwareStrategyRecommendationPriority(b, bHasStrongCurrentRoll) -
        rollAwareStrategyRecommendationPriority(a, aHasStrongCurrentRoll)
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
        decisionBasis: 'divine-exception',
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
      decisionBasis: 'divine-exception',
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
      decisionBasis: 'insufficient-data',
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
    const inconclusiveLayout = ranked.find((candidate) => candidate.layoutStatus === 'unknown')
    if (inconclusiveLayout) {
      return {
        ...base,
        decisionBasis: 'layout-uncertainty',
        kind: 'wait',
        label: `WAIT — layout search inconclusive for ${inconclusiveLayout.strategyName}`,
        reason: `The bounded solver has not found a fully reachable layout for ${inconclusiveLayout.strategyName}. This is not proof that none exists, but PLAY and SWITCH require a found fully reachable board. Retry the search or change the chart pool before launching this Voyage.`,
        strategyId: inconclusiveLayout.strategyId,
        strategyName: inconclusiveLayout.strategyName,
        recommendationTier: inconclusiveLayout.recommendationTier,
        fit: inconclusiveLayout.fit,
        missing: inconclusiveLayout.missing,
        action: null,
        rollForecast: inconclusiveLayout.rollForecast,
      }
    }
    return {
      ...base,
      decisionBasis: 'missing-requirements',
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
      decisionBasis: 'insufficient-data',
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
      decisionBasis: 'insufficient-data',
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

  const decisionPercentileLine =
    keepModelPercentileLine ?? KEEP_MODEL_PERCENTILE_LINES[KEEP_MODEL_PERCENTILE_LINES.length - 1]
  const percentileRange = bestReady.rollForecast?.currentPercentileRange ?? null
  const meetsModelKeepLine =
    percentileRange !== null && percentileRange[0] >= decisionPercentileLine
  const missesModelKeepLine =
    percentileRange !== null && percentileRange[1] < decisionPercentileLine
  const specializedAlternative =
    bestReady.recommendationTier === 'fallback'
      ? (ranked.find(
          (candidate) =>
            candidate.ready &&
            candidate.requiredBorderStatus !== 'missing' &&
            candidate.recommendationTier === 'specialized',
        ) ?? null)
      : null
  const isFallback = bestReady.recommendationTier === 'fallback'
  const selectionReason = isFallback
    ? `${bestReady.strategyName} is the recommended fallback after combining all ${input.availableCharts} imported charts with the current border roll; it is not the only runnable strategy.`
    : `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll.`
  const specializedAlternativeReason = specializedAlternative
    ? specializedAlternative.rollForecast
      ? ` ${specializedAlternative.strategyName} is also runnable and is the strongest specialized alternative at the modeled ${percentileLabel(
          specializedAlternative.rollForecast.currentPercentile,
        )}.`
      : ` ${specializedAlternative.strategyName} is also runnable and is the strongest specialized alternative, but it has no modeled roll comparison.`
    : ''
  const playLabel = (alreadyActive: boolean, provisional = false) => {
    if (provisional) {
      return alreadyActive
        ? `PLAY FOR NOW: ${bestReady.strategyName}`
        : `SWITCH FOR NOW TO: ${bestReady.strategyName}`
    }
    if (isFallback) {
      return alreadyActive
        ? `PLAY FALLBACK: ${bestReady.strategyName}`
        : `SWITCH TO FALLBACK: ${bestReady.strategyName}`
    }
    return alreadyActive
      ? `PLAY: ${bestReady.strategyName}`
      : `SWITCH TO: ${bestReady.strategyName}`
  }

  if (meetsModelKeepLine) {
    const alreadyActive = input.activeStrategyId === bestReady.strategyId
    return {
      ...base,
      decisionBasis: 'modeled-percentile',
      kind: alreadyActive ? 'play' : 'switch',
      label: playLabel(alreadyActive),
      reason: `${selectionReason}${specializedAlternativeReason} The experimental v${bestReady.rollForecast!.modelVersion} model places this board at the ${percentileLabel(
        bestReady.rollForecast!.currentPercentile,
      )}; the full ${percentileRangeLabel(
        bestReady.rollForecast!.currentPercentileRange,
      )} prior range meets the ${percentileLabel(
        decisionPercentileLine,
      )} keep line (${bestReady.rollForecast!.modelConfidence} confidence). The ${percent(
        bestReady.fit,
      )} theoretical-ceiling ratio is diagnostic only and does not gate this decision.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      recommendationTier: bestReady.recommendationTier,
      fit: bestReady.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
      rollForecast: bestReady.rollForecast,
    }
  }

  if (!missesModelKeepLine) {
    const alreadyActive = input.activeStrategyId === bestReady.strategyId
    const uncertaintyReason = bestReady.rollForecast
      ? `The ${percentileRangeLabel(
          bestReady.rollForecast.currentPercentileRange,
        )} prior range crosses the ${percentileLabel(
          decisionPercentileLine,
        )} keep line (${bestReady.rollForecast.modelConfidence} confidence), so there is no robust signal to spend Sulphur on another roll.`
      : 'No modeled achievable-roll comparison is available for this layout, so the theoretical-ceiling ratio is not used to justify spending Sulphur.'
    return {
      ...base,
      decisionBasis: bestReady.rollForecast ? 'model-uncertainty' : 'insufficient-data',
      kind: alreadyActive ? 'play' : 'switch',
      label: playLabel(alreadyActive, true),
      reason: `${selectionReason}${specializedAlternativeReason} ${uncertaintyReason} Keep the current board for now. Its ${percent(
        bestReady.fit,
      )} theoretical-ceiling ratio remains a secondary diagnostic, not a keep/reroll threshold.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      recommendationTier: bestReady.recommendationTier,
      fit: bestReady.fit,
      missing: [],
      action: actionFor(input.activeStrategyId, bestReady),
      rollForecast: bestReady.rollForecast,
    }
  }

  const chanceNextRollBeatsCurrent = bestReady.rollForecast!.chanceNextRollBeatsCurrent
  if (chanceNextRollBeatsCurrent <= 0) {
    return {
      ...base,
      decisionBasis: 'no-modeled-upside',
      kind: 'stop',
      label: 'KEEP — NO PAID REROLL CAN IMPROVE THIS BOARD',
      reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll. The model gives a 0% chance that a paid reroll scores strictly higher. Ties do not justify spending Sulphur, so keep this board even though its tie-adjusted percentile is below the usual keep line.`,
      strategyId: bestReady.strategyId,
      strategyName: bestReady.strategyName,
      recommendationTier: bestReady.recommendationTier,
      fit: bestReady.fit,
      missing: [],
      action: null,
      rollForecast: bestReady.rollForecast,
    }
  }

  if (nextCost !== null && nextCost <= DEFAULT_MAX_REROLL_COST) {
    return {
      ...base,
      decisionBasis: 'modeled-percentile',
      kind: 'reroll',
      label: `CONSIDER REROLL — next costs ${sulphur(nextCost)} Sulphur`,
      reason: `After combining all ${input.availableCharts} imported charts with the current border roll, the best ready strategy is ${bestReady.strategyName}. Its full ${percentileRangeLabel(
        bestReady.rollForecast!.currentPercentileRange,
      )} prior range remains below the ${percentileLabel(
        decisionPercentileLine,
      )} keep line, and the model estimates a ${improvementChanceLabel(
        chanceNextRollBeatsCurrent,
      )} chance that a paid reroll scores higher (${bestReady.rollForecast!.modelConfidence} confidence). The next roll remains inside the 3k/6k default guardrail. The ${percent(
        bestReady.fit,
      )} theoretical-ceiling ratio is diagnostic only. This is experimental guidance, not Sulphur expected value.`,
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
  return {
    ...base,
    decisionBasis: 'cost-guardrail',
    kind: 'stop',
    label: 'STOP REROLLING — KEEP THE CURRENT BOARD',
    reason: `${bestReady.strategyName} is the best ready strategy after combining all ${input.availableCharts} imported charts with the current border roll. Its modeled ${percentileRangeLabel(
      bestReady.rollForecast!.currentPercentileRange,
    )} prior range is below the ${percentileLabel(
      decisionPercentileLine,
    )} keep line, but the Sulphur guardrail wins: ${costReason} Keep this board; the ${percent(
      bestReady.fit,
    )} theoretical-ceiling ratio is diagnostic only.`,
    strategyId: bestReady.strategyId,
    strategyName: bestReady.strategyName,
    recommendationTier: bestReady.recommendationTier,
    fit: bestReady.fit,
    missing: [],
    action: null,
    rollForecast: bestReady.rollForecast,
  }
}
