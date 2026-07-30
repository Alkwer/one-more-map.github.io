import type { StrategyEvaluationOptions, StrategyInventoryResult } from './strategySuggestions'
import type { SolverOptions, SolverResult } from './solver'
import type { Borders, ChartData, Weights } from '../types'

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
  pool: ChartData[]
  borders: Borders
  options: SerializedStrategyEvaluationOptions
  limit?: number
}

export interface SolveWorkerPayload {
  pool: ChartData[]
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
