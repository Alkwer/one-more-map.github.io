import type { BorderAppraisal } from './borderAppraisal'
import {
  KEEP_FIT_LINES,
  REROLL_COSTS,
  clampRerollsUsed,
  sulphurSpentAfter,
} from './rerollAdvice'
import type { StrategySuggestion } from './strategySuggestions'

export const ABSOLUTE_PLAYABLE_FIT = 0.5
export const STRATEGY_SWITCH_DELTA = 0.1

export type VoyageDecisionKind =
  | 'needs-data'
  | 'play'
  | 'switch'
  | 'wait'
  | 'reroll'
  | 'stop'

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
}

export interface VoyageDecisionInput {
  evaluations: StrategySuggestion[]
  activeStrategyId: string | null
  activeAppraisal: BorderAppraisal
  rerollsUsed: number
}

interface DecisionCandidate {
  strategyId: string | null
  strategyName: string
  fit: number | null
  ready: boolean
  missing: string[]
  rankScore: number
  jackpot: boolean
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
})

const compareCandidates = (a: DecisionCandidate, b: DecisionCandidate) =>
  (b.fit ?? -1) - (a.fit ?? -1) || b.rankScore - a.rankScore

const hasFit = (candidate: DecisionCandidate, line: number) =>
  candidate.fit !== null && candidate.fit >= line

export function decideVoyage(input: VoyageDecisionInput): VoyageDecision {
  const rerollsUsed = clampRerollsUsed(input.rerollsUsed)
  const nextCost = REROLL_COSTS[rerollsUsed] ?? null
  const keepFitLine = KEEP_FIT_LINES[rerollsUsed] ?? null
  const decisionFitLine = Math.max(
    ABSOLUTE_PLAYABLE_FIT,
    keepFitLine ?? ABSOLUTE_PLAYABLE_FIT,
  )
  const base = {
    rerollsUsed,
    remainingRerolls: REROLL_COSTS.length - rerollsUsed,
    spent: sulphurSpentAfter(rerollsUsed),
    nextCost,
    keepFitLine,
    decisionFitLine,
  }

  const curated = input.evaluations.map(candidateFrom)
  const activeCurated = input.activeStrategyId
    ? curated.find((candidate) => candidate.strategyId === input.activeStrategyId) ?? null
    : null
  const active: DecisionCandidate =
    activeCurated ?? {
      strategyId: null,
      strategyName: 'Manual weights',
      fit: input.activeAppraisal.fit,
      ready: true,
      missing: [],
      rankScore: Number.NEGATIVE_INFINITY,
      jackpot: false,
    }

  // A Divine border is the one result that remains actionable before the
  // board is complete. It must never be lost to an ordinary reroll decision.
  const divine = curated.find(
    (candidate) =>
      candidate.strategyId === 'divine-border-rares' && candidate.jackpot,
  )
  if (divine) {
    if (!divine.ready) {
      return {
        ...base,
        kind: 'wait',
        label: `WAIT — missing pieces for ${divine.strategyName}`,
        reason: `Preserve the Divine border. ${divine.strategyName} still needs ${divine.missing.join(
          ', ',
        )}.`,
        strategyId: divine.strategyId,
        strategyName: divine.strategyName,
        fit: divine.fit,
        missing: divine.missing,
        action: null,
      }
    }

    const alreadyActive = input.activeStrategyId === divine.strategyId
    return {
      ...base,
      kind: alreadyActive ? 'play' : 'switch',
      label: alreadyActive
        ? `PLAY: ${divine.strategyName}`
        : `SWITCH TO: ${divine.strategyName}`,
      reason:
        'A +1 Divine Orb border is present and every declared strategy requirement is available. Preserve the roll and build around it.',
      strategyId: divine.strategyId,
      strategyName: divine.strategyName,
      fit: divine.fit,
      missing: [],
      action: alreadyActive
        ? null
        : {
            kind: 'select-strategy',
            label: `Activate ${divine.strategyName}`,
            strategyId: divine.strategyId!,
          },
    }
  }

  if (
    input.activeAppraisal.placedCharts < 9 ||
    input.activeAppraisal.enteredBorders < 12
  ) {
    const chartsMissing = 9 - Math.min(9, input.activeAppraisal.placedCharts)
    const bordersMissing = 12 - Math.min(12, input.activeAppraisal.enteredBorders)
    return {
      ...base,
      kind: 'needs-data',
      label: 'COMPLETE THE BOARD',
      reason: `Need ${chartsMissing} more chart${chartsMissing === 1 ? '' : 's'} and ${bordersMissing} more border${bordersMissing === 1 ? '' : 's'} before issuing a play or reroll recommendation.`,
      strategyId: active.strategyId,
      strategyName: active.strategyName,
      fit: active.fit,
      missing: [],
      action: null,
    }
  }

  const availableContexts =
    active.strategyId === null ? [active, ...curated] : curated
  if (!availableContexts.some((candidate) => candidate.fit !== null)) {
    return {
      ...base,
      kind: 'needs-data',
      label: 'NO WEIGHTED SIGNAL',
      reason:
        'Neither the active context nor any curated strategy has a comparable weighted border value.',
      strategyId: active.strategyId,
      strategyName: active.strategyName,
      fit: null,
      missing: [],
      action: null,
    }
  }

  const playableAlternatives = curated
    .filter(
      (candidate) =>
        candidate.strategyId !== active.strategyId &&
        candidate.ready &&
        hasFit(candidate, decisionFitLine),
    )
    .sort(compareCandidates)
  const bestAlternative = playableAlternatives[0] ?? null
  const activePlayable = active.ready && hasFit(active, decisionFitLine)

  if (activePlayable) {
    const shouldSwitch =
      bestAlternative !== null &&
      bestAlternative.fit !== null &&
      active.fit !== null &&
      bestAlternative.fit >= active.fit + STRATEGY_SWITCH_DELTA
    if (shouldSwitch && bestAlternative) {
      return {
        ...base,
        kind: 'switch',
        label: `SWITCH TO: ${bestAlternative.strategyName}`,
        reason: `${bestAlternative.strategyName} is ready and reaches ${percent(
          bestAlternative.fit,
        )}, at least ${Math.round(STRATEGY_SWITCH_DELTA * 100)} points above ${active.strategyName}.`,
        strategyId: bestAlternative.strategyId,
        strategyName: bestAlternative.strategyName,
        fit: bestAlternative.fit,
        missing: [],
        action: {
          kind: 'select-strategy',
          label: `Activate ${bestAlternative.strategyName}`,
          strategyId: bestAlternative.strategyId!,
        },
      }
    }

    return {
      ...base,
      kind: 'play',
      label: `PLAY: ${active.strategyName}`,
      reason: `${active.strategyName} is ready and its ${percent(
        active.fit,
      )} meets the ${Math.round(decisionFitLine * 100)}% decision line.`,
      strategyId: active.strategyId,
      strategyName: active.strategyName,
      fit: active.fit,
      missing: [],
      action: null,
    }
  }

  if (bestAlternative) {
    return {
      ...base,
      kind: 'switch',
      label: `SWITCH TO: ${bestAlternative.strategyName}`,
      reason: `${active.strategyName} does not meet the decision line. ${bestAlternative.strategyName} is ready and reaches ${percent(
        bestAlternative.fit,
      )}.`,
      strategyId: bestAlternative.strategyId,
      strategyName: bestAlternative.strategyName,
      fit: bestAlternative.fit,
      missing: [],
      action: {
        kind: 'select-strategy',
        label: `Activate ${bestAlternative.strategyName}`,
        strategyId: bestAlternative.strategyId!,
      },
    }
  }

  const missingCandidate = curated
    .filter(
      (candidate) =>
        !candidate.ready && hasFit(candidate, decisionFitLine),
    )
    .sort(compareCandidates)[0]
  if (missingCandidate) {
    return {
      ...base,
      kind: 'wait',
      label: `WAIT — missing pieces for ${missingCandidate.strategyName}`,
      reason: `${missingCandidate.strategyName} reaches ${percent(
        missingCandidate.fit,
      )}, but cannot be played until you have ${missingCandidate.missing.join(', ')}.`,
      strategyId: missingCandidate.strategyId,
      strategyName: missingCandidate.strategyName,
      fit: missingCandidate.fit,
      missing: missingCandidate.missing,
      action: null,
    }
  }

  const bestReady = availableContexts
    .filter((candidate) => candidate.ready && candidate.fit !== null)
    .sort(compareCandidates)[0]
  const fit = bestReady?.fit ?? null
  const context = bestReady?.strategyName ?? active.strategyName
  const linePercent = Math.round(decisionFitLine * 100)

  if (nextCost !== null && nextCost <= 12_000) {
    return {
      ...base,
      kind: 'reroll',
      label: `REROLL — next costs ${sulphur(nextCost)} Sulphur`,
      reason: `The best ready option is ${context} at ${percent(
        fit,
      )}, below the ${linePercent}% decision line while another roll is still inexpensive.`,
      strategyId: bestReady?.strategyId ?? null,
      strategyName: context,
      fit,
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
    reason: `${context} is only the best available context at ${percent(
      fit,
    )}; this is not a quality endorsement. ${costReason}`,
    strategyId: bestReady?.strategyId ?? null,
    strategyName: context,
    fit,
    missing: [],
    action: null,
  }
}
