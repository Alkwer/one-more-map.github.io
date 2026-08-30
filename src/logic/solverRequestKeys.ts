import type { AppState } from './storage'
import type { StrategyEvaluationOptions } from './strategySuggestions'
import {
  defaultStrategyReservations,
  resolveStrategyLayout,
  strategyById,
} from '../data/strategies'
import type { Borders, ChartData, Weights } from '../types'

const normalizedRewards = (chart: ChartData) =>
  chart.rewards
    ?.map(({ stat, percent }) => [stat, percent] as const)
    .sort(([aStat, aPercent], [bStat, bPercent]) =>
      aStat === bStat ? aPercent - bPercent : aStat.localeCompare(bStat),
    ) ?? []

const normalizedChart = (chart: ChartData, includePreserved: boolean) => ({
  uid: chart.uid,
  name: chart.name.toLowerCase(),
  level: chart.level,
  edges: chart.edges,
  areaType: chart.areaType ?? null,
  modIds: [...chart.modIds].sort(),
  rewards: normalizedRewards(chart),
  ...(includePreserved ? { preserved: !!chart.preserved } : {}),
})

const normalizedDisabledMods = (disabledMods: Iterable<string>) => [...new Set(disabledMods)].sort()

const normalizedWeights = (weights: Weights) =>
  Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))

const normalizedLayoutChoice = (layoutChoice: Readonly<Record<string, string>> = {}) =>
  Object.entries(layoutChoice).sort(([a], [b]) => a.localeCompare(b))

export function createStrategyInventoryKey(
  pool: ChartData[],
  borders: Borders,
  options: StrategyEvaluationOptions,
  limit = 3,
): string {
  return JSON.stringify({
    pool: pool.map((chart) => normalizedChart(chart, false)),
    borders,
    mode: options.mode,
    allowRotation: options.allowRotation,
    adjacencyMode: options.adjacencyMode,
    adjacentAffectsSelf: options.adjacentAffectsSelf,
    disabledMods: normalizedDisabledMods(options.disabledMods ?? []),
    strategyReservations: options.strategyReservations ?? defaultStrategyReservations(),
    pieceKeeps: options.pieceKeeps ?? {},
    layoutChoice: normalizedLayoutChoice(options.layoutChoice),
    limit,
  })
}

type SolverStateKeyInput = Pick<
  AppState,
  | 'pool'
  | 'borders'
  | 'mode'
  | 'allowRotation'
  | 'adjacencyMode'
  | 'adjacentAffectsSelf'
  | 'disabledMods'
  | 'strategyReservations'
> &
  Partial<Pick<AppState, 'board' | 'pieceKeeps' | 'layoutChoice'>>

export function createSolverStateKey(
  state: SolverStateKeyInput,
  weights: Weights,
  activeStrategyId: string | null,
  kind: 'solve' | 'filler' = 'solve',
): string {
  const strategy = activeStrategyId ? strategyById.get(activeStrategyId) : undefined
  return JSON.stringify({
    kind,
    pool: state.pool.map((chart) => normalizedChart(chart, true)),
    board: state.board ?? [],
    borders: state.borders,
    weights: normalizedWeights(weights),
    mode: state.mode,
    allowRotation: state.allowRotation,
    adjacencyMode: state.adjacencyMode,
    adjacentAffectsSelf: state.adjacentAffectsSelf,
    disabledMods: normalizedDisabledMods(state.disabledMods),
    strategyReservations: state.strategyReservations,
    pieceKeeps: state.pieceKeeps ?? {},
    strategyLayout:
      kind === 'solve' && strategy
        ? (resolveStrategyLayout(strategy, state.layoutChoice) ?? null)
        : null,
    activeStrategyId,
  })
}
