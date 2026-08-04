import { borderModById } from '../data/mods'
import {
  STRATEGIES,
  type StrategyDef,
  type StrategyReservationPreferences,
} from '../data/strategies'
import type { Board, Borders, ChartData, ConnectivityMode, Weights } from '../types'
import { borderTouches, emptyBorders } from '../types'
import {
  appraiseBorders,
  type BorderAppraisal,
  type BorderAppraisalStatus,
} from './borderAppraisal'
import { borderRewardKey } from './rewards'
import { selectSolverEligibleCharts } from './chartShapes'
import { scoreBoard, type ScoreOptions } from './scoring'
import { solve } from './solver'
import { selectStrategySolvePool } from './solverPoolSelection'
import { allocateStrategyRequirements } from './strategyRequirements'
import { BORDER_ROLL_MODEL, chanceModAppearsOnBoard } from './borderRollModel'

const EPSILON = 1e-9
const POTENTIAL_SEARCH_RESTARTS = 12
const POTENTIAL_SEARCH_ITERATIONS = 900
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export type SuggestionConfidence = 'low' | 'medium' | 'high'
export type RequiredBorderStatus = 'not-required' | 'unknown' | 'met' | 'missing'

export interface StrategyEvaluationOptions extends ScoreOptions {
  mode: ConnectivityMode
  allowRotation: boolean
  strategyReservations?: StrategyReservationPreferences
  pieceKeeps?: Record<string, number>
}

export interface StrategyReadiness {
  ready: boolean
  have: number
  need: number
  ratio: number
  missing: string[]
  requirements: StrategyRequirementReadiness[]
}

export interface StrategyRequirementReadiness {
  label: string
  have: number
  need: number
  missing: number
}

export interface StrategyInventorySuggestion {
  strategy: StrategyDef
  rankScore: number
  confidence: SuggestionConfidence
  /** Fit of the current border roll on the best layout found in the library. */
  fit: number | null
  status: BorderAppraisalStatus
  potentialAppraisal: BorderAppraisal
  potentialBoard: Board
  potentialScore: number
  /** whether the game accepts the best-found board */
  potentialLaunchable: boolean
  /** whether every chart on the best-found board can be reached from the start */
  potentialFullyReachable: boolean
  /** Library-only potential, normalized against the strongest evaluated strategy. */
  libraryFit: number
  /** Absolute fit of the entered border roll for the best layout found. */
  borderFit: number
  /** Combined charts + borders score used to rank runnable strategies. */
  combinedFit: number
  /** Expected border fit of a paid reroll under the experimental probability model. */
  modeledBorderFit: number | null
  /** Smoothed chance that a mandatory border appears at least once on a 12-slot board. */
  requiredBorderChance: number | null
  eligibleCharts: number
  jackpot: boolean
  /** A +1 Divine border is present for a strategy explicitly built around it. */
  divineJackpot: boolean
  /** Whether the strategy's mandatory border is present on the completed current roll. */
  requiredBorderStatus: RequiredBorderStatus
  borderScore: number
  matchingBorders: number
  harmfulBorders: number
  enteredBorders: number
  readiness: StrategyReadiness
  reasons: string[]
}

export interface StrategySuggestion extends StrategyInventorySuggestion {
  /** Current manually arranged board, retained only as a diagnostic. */
  appraisal: BorderAppraisal
  currentFit: number | null
  currentStatus: BorderAppraisalStatus
}

export interface StrategyInventoryResult {
  suggestions: StrategyInventorySuggestion[]
  evaluations: StrategyInventorySuggestion[]
  enteredBorders: number
  availableCharts: number
  hasEvidence: boolean
}

export interface StrategySuggestionResult {
  /** Top combined chart-library and border-roll matches shown in the panel. */
  suggestions: StrategySuggestion[]
  /** Every strategy evaluation, used by the canonical Voyage decision. */
  evaluations: StrategySuggestion[]
  enteredBorders: number
  availableCharts: number
  placedCharts: number
  hasEvidence: boolean
}

export function strategyReadiness(
  strategy: StrategyDef,
  pool: ChartData[],
  borders: Borders,
  mode: ConnectivityMode = 'strict',
): StrategyReadiness {
  let have = 0
  let need = 0
  const missing: string[] = []
  const requirements: StrategyRequirementReadiness[] = []

  const eligiblePool = selectSolverEligibleCharts(pool, mode)
  const allocation = allocateStrategyRequirements(
    strategy.requirements ?? [],
    eligiblePool,
    borders,
  )
  for (const entry of allocation.allocations) {
    const count = entry.chartUids.length
    have += count
    need += entry.required
    requirements.push({
      label: entry.requirement.label,
      have: count,
      need: entry.required,
      missing: entry.missing,
    })
    if (entry.missing > 0) {
      missing.push(`${entry.missing}× ${entry.requirement.label}`)
    }
  }

  if (strategy.requiresBorderId) {
    need += 1
    const hasBorder = borders.includes(strategy.requiresBorderId.id)
    if (hasBorder) have += 1
    else missing.push(strategy.requiresBorderId.label)
    requirements.push({
      label: strategy.requiresBorderId.label,
      have: hasBorder ? 1 : 0,
      need: 1,
      missing: hasBorder ? 0 : 1,
    })
  }

  return {
    ready: missing.length === 0,
    have,
    need,
    ratio: need === 0 ? 1 : have / need,
    missing,
    requirements,
  }
}

function stableSeed(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function directBorderContribution(modId: string, weights: Weights): number {
  const mod = borderModById.get(modId)
  if (!mod) return 0
  const weight = weights[borderRewardKey(mod)] ?? 0
  return mod.effects.reduce((sum, effect) => sum + (effect.percent / 100) * weight, 0)
}

function borderContributions(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions,
): { segment: number; modId: string; contribution: number }[] {
  const noBorders = emptyBorders()
  const base = scoreBoard(board, noBorders, charts, weights, opts).total

  return borders.flatMap((modId, segment) => {
    if (!modId || opts.disabledMods?.has(modId)) return []

    let contribution = directBorderContribution(modId, weights)
    if (board[borderTouches(segment)]) {
      const isolated = emptyBorders()
      isolated[segment] = modId
      contribution = scoreBoard(board, isolated, charts, weights, opts).total - base
    }

    return [{ segment, modId, contribution }]
  })
}

function uniqueTopBorderLabels(contributions: { modId: string; contribution: number }[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const entry of [...contributions].sort((a, b) => b.contribution - a.contribution)) {
    if (entry.contribution <= EPSILON) break
    const mod = borderModById.get(entry.modId)
    const label = mod?.short ?? mod?.text
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
    if (labels.length === 2) break
  }
  return labels
}

function confidenceFor(
  jackpot: boolean,
  fit: number | null,
  status: BorderAppraisalStatus,
): SuggestionConfidence {
  if (jackpot) return 'high'
  if (fit !== null && (status === 'strong' || status === 'excellent')) {
    return 'high'
  }
  if (fit !== null && status === 'mixed') return 'medium'
  return 'low'
}

function addRunnableRequirements(
  readiness: StrategyReadiness,
  eligibleCharts: number,
  potentialFound: boolean,
  potentialValidForMode: boolean,
): StrategyReadiness {
  const missing = [...readiness.missing]
  const capacityRatio = Math.min(1, eligibleCharts / 9)
  const layoutRatio = eligibleCharts >= 9 && !potentialValidForMode ? 0.75 : 1
  if (eligibleCharts < 9) {
    missing.push(
      `${9 - eligibleCharts}× additional eligible chart${
        9 - eligibleCharts === 1 ? '' : 's'
      } for a full voyage`,
    )
  } else if (!potentialFound) {
    missing.push('a board containing every mandatory strategy piece in an allowed position')
  } else if (!potentialValidForMode) {
    missing.push('a fully reachable connector layout from the available chart shapes')
  }
  return {
    ...readiness,
    ready: missing.length === 0,
    ratio: readiness.ratio * capacityRatio * layoutRatio,
    missing,
  }
}

/**
 * Rank strategies from the complete imported chart library and current border
 * roll. The current manual board is deliberately absent from this function.
 */
export function evaluateStrategyInventory(
  borders: Borders,
  charts: Map<string, ChartData>,
  pool: ChartData[],
  opts: StrategyEvaluationOptions,
  limit = 3,
): StrategyInventoryResult {
  const solverEligiblePool = selectSolverEligibleCharts(pool, opts.mode)
  const enteredBorders = borders.filter(Boolean).length
  const hasNoEquipment = solverEligiblePool.some((chart) => chart.modIds.includes('voy-noequip'))
  const hasDivineBorder = borders.includes('b-divine') && !opts.disabledMods?.has('b-divine')

  const rawEvaluations = STRATEGIES.map((strategy) => {
    const eligiblePool = selectStrategySolvePool(
      solverEligiblePool,
      strategy,
      opts.strategyReservations,
      undefined,
      opts.pieceKeeps,
    ).solvePool
    const libraryReadiness = strategyReadiness(strategy, solverEligiblePool, borders, opts.mode)
    const potential = libraryReadiness.ready
      ? (solve(eligiblePool, borders, strategy.weights, {
          ...opts,
          topK: 1,
          strategyRules: strategy.rules,
          strategyRequirements: strategy.requirements,
          strategyLayout: strategy.layout,
          strategyLayoutPenalty: strategy.layoutPenalty,
          forceHeuristic: true,
          searchRestarts: POTENTIAL_SEARCH_RESTARTS,
          searchIterations: POTENTIAL_SEARCH_ITERATIONS,
          seed: stableSeed(strategy.id),
        })[0] ?? null)
      : null
    const potentialBoard = potential?.board ?? (Array(9).fill(null) as Board)
    const readiness = addRunnableRequirements(
      libraryReadiness,
      eligiblePool.length,
      potential !== null,
      potential?.valid ?? false,
    )
    const potentialAppraisal = appraiseBorders(
      potentialBoard,
      borders,
      charts,
      strategy.weights,
      opts,
      BORDER_ROLL_MODEL,
    )
    const contributions = borderContributions(
      potentialBoard,
      borders,
      charts,
      strategy.weights,
      opts,
    )
    const borderScore = contributions.reduce((sum, entry) => sum + entry.contribution, 0)
    const matchingBorders = contributions.filter((entry) => entry.contribution > EPSILON).length
    const harmfulBorders = contributions.filter((entry) => entry.contribution < -EPSILON).length
    const weightScale = Math.max(
      1,
      Object.values(strategy.weights).reduce((sum, weight) => sum + Math.max(0, weight), 0),
    )
    const rollAffinity = Math.max(0, borderScore) / weightScale
    const libraryScore = scoreBoard(
      potentialBoard,
      emptyBorders(),
      charts,
      strategy.weights,
      opts,
    ).total
    const libraryAffinity = Math.max(0, libraryScore) / weightScale
    const divineJackpot = hasDivineBorder && strategy.requiresBorderId?.id === 'b-divine'
    const equipmentJackpot = hasNoEquipment && strategy.id === 'milky-meatfish'
    const jackpot = divineJackpot || equipmentJackpot
    const requiredBorderStatus: RequiredBorderStatus = !strategy.requiresBorderId
      ? 'not-required'
      : borders.includes(strategy.requiresBorderId.id) &&
          !opts.disabledMods?.has(strategy.requiresBorderId.id)
        ? 'met'
        : enteredBorders < 12
          ? 'unknown'
          : 'missing'
    const requiredBorderChance = strategy.requiresBorderId
      ? chanceModAppearsOnBoard(BORDER_ROLL_MODEL, strategy.requiresBorderId.id)
      : null

    const reasons: string[] = [
      `Evaluated all ${eligiblePool.length} eligible imported charts; the best layout found is ${
        potential?.fullyReachable
          ? 'fully reachable'
          : potential?.launchable
            ? 'launchable but contains unreachable charts'
            : 'not connector-complete'
      }.`,
    ]
    if (divineJackpot) {
      reasons.push(
        'Divine-drop border detected — this build is designed to feed rare monsters into it.',
      )
    }
    if (equipmentJackpot) {
      reasons.push(
        'Your library contains a “Monsters cannot drop Equipment” chart, the key Meatfish multiplier.',
      )
    }
    if (requiredBorderStatus === 'missing') {
      reasons.push(
        `The completed current roll does not contain ${strategy.requiresBorderId!.label}; this strategy requires a border reroll. The experimental v${BORDER_ROLL_MODEL.version} model estimates a ${Math.round(
          (requiredBorderChance ?? 0) * 100,
        )}% chance to see it at least once on a paid reroll (${BORDER_ROLL_MODEL.confidence} confidence).`,
      )
    }

    if (potentialAppraisal.rollForecast) {
      reasons.push(
        `A paid reroll is modeled at ${Math.round(
          potentialAppraisal.rollForecast.expectedFit * 100,
        )}% contextual fit for this layout from ${BORDER_ROLL_MODEL.sampleCount} observed paid-reroll boards.`,
      )
    }

    const borderLabels = uniqueTopBorderLabels(contributions)
    if (borderLabels.length > 0) {
      reasons.push(
        `${matchingBorders}/${enteredBorders} entered borders support the best layout found, led by ${borderLabels.join(
          ' and ',
        )}.`,
      )
    } else if (enteredBorders > 0) {
      reasons.push('The current border roll has little direct support for this strategy.')
    }

    if (readiness.need === 0 && readiness.ready) {
      reasons.push('No special chart pieces are required.')
    } else if (readiness.ready) {
      reasons.push(`All ${readiness.need} declared chart/border requirements are available.`)
    } else {
      reasons.push(
        `Library readiness: ${readiness.have}/${readiness.need}; still missing ${readiness.missing
          .slice(0, 2)
          .join(', ')}${readiness.missing.length > 2 ? ', …' : ''}.`,
      )
    }

    return {
      strategy,
      rankScore: 0,
      confidence: confidenceFor(jackpot, potentialAppraisal.fit, potentialAppraisal.status),
      fit: potentialAppraisal.fit,
      status: potentialAppraisal.status,
      potentialAppraisal,
      potentialBoard,
      potentialScore: libraryScore,
      potentialLaunchable: potential?.launchable ?? false,
      potentialFullyReachable: potential?.fullyReachable ?? false,
      libraryFit: 0,
      borderFit: 0,
      combinedFit: 0,
      modeledBorderFit: potentialAppraisal.rollForecast?.expectedFit ?? null,
      requiredBorderChance,
      eligibleCharts: eligiblePool.length,
      jackpot,
      divineJackpot,
      requiredBorderStatus,
      borderScore,
      matchingBorders,
      harmfulBorders,
      enteredBorders,
      readiness,
      reasons,
      libraryAffinity,
      rollAffinity,
      equipmentJackpot,
    }
  })

  const maxLibraryAffinity = Math.max(
    EPSILON,
    ...rawEvaluations.map((evaluation) => evaluation.libraryAffinity),
  )
  const maxRollAffinity = Math.max(
    EPSILON,
    ...rawEvaluations.map((evaluation) => evaluation.rollAffinity),
  )
  const enteredBorderRatio = Math.min(1, enteredBorders / 12)
  const borderWeight = 0.5 * enteredBorderRatio
  const modeledBorderWeight = 0.15 * (1 - enteredBorderRatio)
  const libraryWeight = 1 - borderWeight - modeledBorderWeight

  const evaluations: StrategyInventorySuggestion[] = rawEvaluations.map((raw) => {
    const { libraryAffinity, rollAffinity, equipmentJackpot, ...evaluation } = raw
    const libraryFit = clamp01(libraryAffinity / maxLibraryAffinity)
    const borderFit = clamp01(raw.potentialAppraisal.fit ?? rollAffinity / maxRollAffinity)
    const modeledBorderFit = raw.modeledBorderFit ?? 0
    const combinedFit =
      libraryFit * libraryWeight + borderFit * borderWeight + modeledBorderFit * modeledBorderWeight
    const rankScore = raw.readiness.ready
      ? combinedFit
      : raw.readiness.ratio * 0.5 + combinedFit * 0.4 + (equipmentJackpot ? 0.1 : 0)

    return {
      ...evaluation,
      rankScore,
      libraryFit,
      borderFit,
      combinedFit,
      reasons: [
        `Combined match: ${Math.round(
          combinedFit * 100,
        )}% (${Math.round(libraryFit * 100)}% charts, ${Math.round(
          borderFit * 100,
        )}% current borders, ${Math.round(modeledBorderFit * 100)}% modeled paid reroll).`,
        ...raw.reasons,
      ],
    }
  })

  evaluations.sort((a, b) => {
    const aDivine = a.divineJackpot
    const bDivine = b.divineJackpot
    if (aDivine !== bDivine) return aDivine ? -1 : 1
    const aMissingRequiredBorder = a.requiredBorderStatus === 'missing'
    const bMissingRequiredBorder = b.requiredBorderStatus === 'missing'
    if (aMissingRequiredBorder !== bMissingRequiredBorder) {
      return aMissingRequiredBorder ? 1 : -1
    }
    if (a.readiness.ready !== b.readiness.ready) {
      return a.readiness.ready ? -1 : 1
    }
    return b.rankScore - a.rankScore
  })

  return {
    suggestions: evaluations.slice(0, Math.max(0, limit)),
    evaluations,
    enteredBorders,
    availableCharts: solverEligiblePool.length,
    hasEvidence: enteredBorders > 0 || solverEligiblePool.length > 0,
  }
}

/**
 * Attach diagnostics for the current manual board without changing inventory
 * ranking, best-found fit, or the canonical strategy recommendation.
 */
export function evaluateCurrentBoardStrategies(
  inventory: StrategyInventoryResult,
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  opts: ScoreOptions,
): StrategySuggestionResult {
  const attach = (suggestion: StrategyInventorySuggestion): StrategySuggestion => {
    const appraisal = appraiseBorders(board, borders, charts, suggestion.strategy.weights, opts)
    return {
      ...suggestion,
      appraisal,
      currentFit: appraisal.fit,
      currentStatus: appraisal.status,
    }
  }
  const byId = new Map(
    inventory.evaluations.map((suggestion) => [suggestion.strategy.id, attach(suggestion)]),
  )
  const evaluations = inventory.evaluations.map((suggestion) => byId.get(suggestion.strategy.id)!)

  return {
    suggestions: inventory.suggestions.map((suggestion) => byId.get(suggestion.strategy.id)!),
    evaluations,
    enteredBorders: inventory.enteredBorders,
    availableCharts: inventory.availableCharts,
    placedCharts: board.filter(Boolean).length,
    hasEvidence: inventory.hasEvidence,
  }
}

export function suggestStrategies(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  pool: ChartData[],
  opts: StrategyEvaluationOptions,
  limit = 3,
): StrategySuggestionResult {
  const inventory = evaluateStrategyInventory(borders, charts, pool, opts, limit)
  return evaluateCurrentBoardStrategies(inventory, board, borders, charts, opts)
}
