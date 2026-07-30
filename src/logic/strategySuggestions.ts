import { borderModById } from '../data/mods'
import { STRATEGIES, type StrategyDef } from '../data/strategies'
import type {
  Board,
  Borders,
  ChartData,
  ConnectivityMode,
  Weights,
} from '../types'
import { borderTouches, emptyBorders } from '../types'
import {
  appraiseBorders,
  type BorderAppraisal,
  type BorderAppraisalStatus,
} from './borderAppraisal'
import { borderRewardKey } from './rewards'
import { scoreBoard, type ScoreOptions } from './scoring'
import { solve } from './solver'

const EPSILON = 1e-9
const POTENTIAL_SEARCH_RESTARTS = 12
const POTENTIAL_SEARCH_ITERATIONS = 900
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export type SuggestionConfidence = 'low' | 'medium' | 'high'

export interface StrategyEvaluationOptions extends ScoreOptions {
  mode: ConnectivityMode
  allowRotation: boolean
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
  eligibleCharts: number
  jackpot: boolean
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

function countMatchingCharts(
  requirement: NonNullable<StrategyDef['requirements']>[number],
  pool: ChartData[],
): number {
  return pool.filter(
    (chart) =>
      (requirement.modIds &&
        chart.modIds.some((id) => requirement.modIds!.includes(id))) ||
      (requirement.nameMatch &&
        chart.name.toLowerCase().includes(requirement.nameMatch.toLowerCase())),
  ).length
}

export function strategyReadiness(
  strategy: StrategyDef,
  pool: ChartData[],
  borders: Borders,
): StrategyReadiness {
  let have = 0
  let need = 0
  const missing: string[] = []
  const requirements: StrategyRequirementReadiness[] = []

  for (const requirement of strategy.requirements ?? []) {
    const count = countMatchingCharts(requirement, pool)
    have += Math.min(count, requirement.count)
    need += requirement.count
    requirements.push({
      label: requirement.label,
      have: count,
      need: requirement.count,
      missing: Math.max(0, requirement.count - count),
    })
    if (count < requirement.count) {
      missing.push(`${requirement.count - count}× ${requirement.label}`)
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

function eligiblePoolFor(strategy: StrategyDef, pool: ChartData[]): ChartData[] {
  const reserveModIds = strategy.reserveModIds
  const reserveNames = strategy.reserveNames
  return pool.filter(
    (chart) =>
      !(reserveModIds?.length &&
        chart.modIds.some((id) => reserveModIds.includes(id))) &&
      !(reserveNames?.length &&
        reserveNames.some((name) =>
          chart.name.toLowerCase().includes(name.toLowerCase()),
        )),
  )
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
  return mod.effects.reduce(
    (sum, effect) => sum + (effect.percent / 100) * weight,
    0,
  )
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
      contribution =
        scoreBoard(board, isolated, charts, weights, opts).total - base
    }

    return [{ segment, modId, contribution }]
  })
}

function uniqueTopBorderLabels(
  contributions: { modId: string; contribution: number }[],
): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const entry of [...contributions].sort(
    (a, b) => b.contribution - a.contribution,
  )) {
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
  if (
    fit !== null &&
    (status === 'strong' || status === 'excellent')
  ) {
    return 'high'
  }
  if (fit !== null && status === 'mixed') return 'medium'
  return 'low'
}

function addRunnableRequirements(
  readiness: StrategyReadiness,
  eligibleCharts: number,
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
  const enteredBorders = borders.filter(Boolean).length
  const hasNoEquipment = pool.some((chart) =>
    chart.modIds.includes('voy-noequip'),
  )
  const hasDivineBorder =
    borders.includes('b-divine') && !opts.disabledMods?.has('b-divine')

  const rawEvaluations = STRATEGIES.map((strategy) => {
    const eligiblePool = eligiblePoolFor(strategy, pool)
    const potential =
      solve(eligiblePool, borders, strategy.weights, {
        ...opts,
        topK: 1,
        strategyRules: strategy.rules,
        strategyLayout: strategy.layout,
        strategyLayoutPenalty: strategy.layoutPenalty,
        forceHeuristic: true,
        searchRestarts: POTENTIAL_SEARCH_RESTARTS,
        searchIterations: POTENTIAL_SEARCH_ITERATIONS,
        seed: stableSeed(strategy.id),
      })[0] ?? null
    const potentialBoard =
      potential?.board ?? (Array(9).fill(null) as Board)
    const readiness = addRunnableRequirements(
      strategyReadiness(strategy, pool, borders),
      eligiblePool.length,
      potential?.valid ?? false,
    )
    const potentialAppraisal = appraiseBorders(
      potentialBoard,
      borders,
      charts,
      strategy.weights,
      opts,
    )
    const contributions = borderContributions(
      potentialBoard,
      borders,
      charts,
      strategy.weights,
      opts,
    )
    const borderScore = contributions.reduce(
      (sum, entry) => sum + entry.contribution,
      0,
    )
    const matchingBorders = contributions.filter(
      (entry) => entry.contribution > EPSILON,
    ).length
    const harmfulBorders = contributions.filter(
      (entry) => entry.contribution < -EPSILON,
    ).length
    const weightScale = Math.max(
      1,
      Object.values(strategy.weights).reduce(
        (sum, weight) => sum + Math.max(0, weight),
        0,
      ),
    )
    const rollAffinity = Math.max(0, borderScore) / weightScale
    const libraryScore = scoreBoard(
      potentialBoard,
      emptyBorders(),
      charts,
      strategy.weights,
      opts,
    ).total
    const libraryAffinity =
      Math.max(0, libraryScore) / weightScale
    const divineJackpot =
      hasDivineBorder && strategy.id === 'divine-border-rares'
    const equipmentJackpot =
      hasNoEquipment && strategy.id === 'milky-meatfish'
    const jackpot = divineJackpot || equipmentJackpot

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

    const borderLabels = uniqueTopBorderLabels(contributions)
    if (borderLabels.length > 0) {
      reasons.push(
        `${matchingBorders}/${enteredBorders} entered borders support the best layout found, led by ${borderLabels.join(
          ' and ',
        )}.`,
      )
    } else if (enteredBorders > 0) {
      reasons.push(
        'The current border roll has little direct support for this strategy.',
      )
    }

    if (readiness.need === 0 && readiness.ready) {
      reasons.push('No special chart pieces are required.')
    } else if (readiness.ready) {
      reasons.push(
        `All ${readiness.need} declared chart/border requirements are available.`,
      )
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
      confidence: confidenceFor(
        jackpot,
        potentialAppraisal.fit,
        potentialAppraisal.status,
      ),
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
      eligibleCharts: eligiblePool.length,
      jackpot,
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
  const borderWeight = 0.5 * Math.min(1, enteredBorders / 12)
  const libraryWeight = 1 - borderWeight

  const evaluations: StrategyInventorySuggestion[] = rawEvaluations.map(
    (raw) => {
      const {
        libraryAffinity,
        rollAffinity,
        equipmentJackpot,
        ...evaluation
      } = raw
      const libraryFit = clamp01(libraryAffinity / maxLibraryAffinity)
      const borderFit = clamp01(
        raw.potentialAppraisal.fit ??
          rollAffinity / maxRollAffinity,
      )
      const combinedFit =
        libraryFit * libraryWeight + borderFit * borderWeight
      const rankScore = raw.readiness.ready
        ? combinedFit
        : raw.readiness.ratio * 0.5 +
          combinedFit * 0.4 +
          (equipmentJackpot ? 0.1 : 0)

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
          )}% borders).`,
          ...raw.reasons,
        ],
      }
    },
  )

  evaluations.sort((a, b) => {
    const aDivine =
      a.strategy.id === 'divine-border-rares' && a.jackpot
    const bDivine =
      b.strategy.id === 'divine-border-rares' && b.jackpot
    if (aDivine !== bDivine) return aDivine ? -1 : 1
    if (a.readiness.ready !== b.readiness.ready) {
      return a.readiness.ready ? -1 : 1
    }
    return b.rankScore - a.rankScore
  })

  return {
    suggestions: evaluations.slice(0, Math.max(0, limit)),
    evaluations,
    enteredBorders,
    availableCharts: pool.length,
    hasEvidence: enteredBorders > 0 || pool.length > 0,
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
  const attach = (
    suggestion: StrategyInventorySuggestion,
  ): StrategySuggestion => {
    const appraisal = appraiseBorders(
      board,
      borders,
      charts,
      suggestion.strategy.weights,
      opts,
    )
    return {
      ...suggestion,
      appraisal,
      currentFit: appraisal.fit,
      currentStatus: appraisal.status,
    }
  }
  const byId = new Map(
    inventory.evaluations.map((suggestion) => [
      suggestion.strategy.id,
      attach(suggestion),
    ]),
  )
  const evaluations = inventory.evaluations.map(
    (suggestion) => byId.get(suggestion.strategy.id)!,
  )

  return {
    suggestions: inventory.suggestions.map(
      (suggestion) => byId.get(suggestion.strategy.id)!,
    ),
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
  const inventory = evaluateStrategyInventory(
    borders,
    charts,
    pool,
    opts,
    limit,
  )
  return evaluateCurrentBoardStrategies(
    inventory,
    board,
    borders,
    charts,
    opts,
  )
}
