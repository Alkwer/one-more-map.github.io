import type { AdjacencyMode } from '../logic/scoring'
import {
  defaultStrategyReservations,
  type StrategyReservationPreferences,
} from '../data/strategies'
import type { Board, Borders, ChartData, ConnectivityMode, Weights } from '../types'
import { emptyBoard, emptyBorders } from '../types'
import { DEFAULT_WEIGHTS } from '../logic/rewards'

export interface AppState {
  pool: ChartData[]
  board: Board
  borders: Borders
  weights: Weights
  mode: ConnectivityMode
  allowRotation: boolean
  adjacencyMode: AdjacencyMode
  adjacentAffectsSelf: boolean
  /** mod ids the user has switched off; they contribute nothing to any scoring */
  disabledMods: string[]
  /** active curated strategy id (overrides weights + shapes the solver) or null */
  strategyId: string | null
  /** chart types excluded from low-investment strategy solve pools */
  strategyReservations: StrategyReservationPreferences
  /** per-piece-type counts kept in reserve for curated strategies */
  pieceKeeps: Record<string, number>
  /** chosen layout variant per strategy id (missing = the strategy default) */
  layoutChoice: Record<string, string>
  /** paid border rerolls recorded for the current Voyage board (0–5 assumed cap) */
  borderRerollsUsed: number
}

export const defaultState = (): AppState => ({
  pool: [],
  board: emptyBoard(),
  borders: emptyBorders(),
  weights: { ...DEFAULT_WEIGHTS },
  mode: 'strict', // confirmed rule: adjacent connectors must match, all 9 filled
  allowRotation: true, // rotation confirmed in game
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: [],
  strategyId: null,
  strategyReservations: defaultStrategyReservations(),
  pieceKeeps: {},
  layoutChoice: {},
  borderRerollsUsed: 0,
})
