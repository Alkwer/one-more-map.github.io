import type { StrategyEvaluationOptions, StrategyInventoryResult } from './strategySuggestions'
import type { SolverOptions, SolverResult } from './solver'
import type { Borders, ChartData, Weights } from '../types'

export type SolverChartDto = Pick<
  ChartData,
  'uid' | 'name' | 'edges' | 'areaType' | 'modIds' | 'rewards' | 'shapeResolved'
>

/**
 * Keep structured-clone traffic limited to the chart fields consumed by the
 * solver and strategy inventory. In particular, imported source text and UI
 * state must never cross the worker boundary.
 */
export const toSolverChartDto = (chart: ChartData): SolverChartDto => ({
  uid: chart.uid,
  name: chart.name,
  edges: [...chart.edges],
  areaType: chart.areaType,
  modIds: [...chart.modIds],
  rewards: chart.rewards?.map((reward) => ({ ...reward })),
  shapeResolved: chart.shapeResolved,
})

/** Restore the storage-only required field after the DTO crosses the worker boundary. */
export const hydrateSolverChartDto = (chart: SolverChartDto): ChartData => ({
  ...chart,
  level: 0,
})

export type SerializedStrategyEvaluationOptions = Omit<
  StrategyEvaluationOptions,
  'disabledMods'
> & {
  disabledMods: string[]
}

export type SerializedSolverOptions = Omit<SolverOptions, 'disabledMods'> & {
  disabledMods: string[]
}

export interface StrategyInventoryWorkerPayload {
  pool: SolverChartDto[]
  borders: Borders
  options: SerializedStrategyEvaluationOptions
  limit?: number
}

export interface SolveWorkerPayload {
  pool: SolverChartDto[]
  borders: Borders
  weights: Weights
  options: SerializedSolverOptions
}

export type SolverWorkerJob =
  | {
      type: 'strategy-inventory'
      payload: StrategyInventoryWorkerPayload
    }
  | {
      type: 'solve'
      payload: SolveWorkerPayload
    }

export type SolverWorkerRequest = SolverWorkerJob & {
  requestId: number
}

export type SolverWorkerResponse =
  | {
      type: 'strategy-inventory-result'
      requestId: number
      result: StrategyInventoryResult
    }
  | {
      type: 'solve-result'
      requestId: number
      result: SolverResult[]
    }
  | {
      type: 'error'
      requestId: number
      message: string
    }
