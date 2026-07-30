import type { AdjacencyMode } from './scoring'
import type { Board, Borders, ChartData, ConnectivityMode, Weights } from '../types'
import { emptyBoard, emptyBorders } from '../types'
import { chartShapeForEdges, isChartShapeResolved } from './chartShapes'
import { DEFAULT_WEIGHTS } from './rewards'

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
  borderRerollsUsed: 0,
})

const LS_KEY = 'allflame-voyage-solver'
/** bump only when chart/board data (mod ids) changes incompatibly */
const STATE_VERSION = 3 // v3: full datamined mod pools

export function saveLocal(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...state, v: STATE_VERSION }))
  } catch {
    /* storage full / unavailable - ignore */
  }
}

export function loadLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const revived = reviveState(parsed)
    if (parsed?.v !== STATE_VERSION) {
      // mod data model changed: keep the user's preferences (weights, disabled
      // mods, settings) but reset the transient board that references mod ids.
      return { ...revived, pool: [], board: emptyBoard(), borders: emptyBorders() }
    }
    return revived
  } catch {
    return null
  }
}

/** Share state via URL hash (base64 JSON). */
export function encodeShare(state: AppState): string {
  const json = JSON.stringify(state)
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeShare(hash: string): AppState | null {
  try {
    const json = decodeURIComponent(escape(atob(hash)))
    return reviveState(JSON.parse(json))
  } catch {
    return null
  }
}

export function reviveState(obj: unknown): AppState {
  const d = defaultState()
  if (typeof obj !== 'object' || obj === null) return d
  const o = obj as Partial<AppState>
  const pool = (Array.isArray(o.pool)
    ? o.pool.filter(
        (chart): chart is ChartData => typeof chart === 'object' && chart !== null,
      )
    : d.pool
  ).map((chart) => {
    const shape = chartShapeForEdges(chart.edges)
    return shape && chart.shapeResolved !== false ? { ...chart, shape } : chart
  })
  const resolvedUids = new Set(
    pool.filter(isChartShapeResolved).map((chart) => chart.uid),
  )
  const boardCandidate =
    Array.isArray(o.board) && o.board.length === 9 ? o.board : d.board
  const board = boardCandidate.map((placement) =>
    placement &&
    typeof placement.chartUid === 'string' &&
    resolvedUids.has(placement.chartUid)
      ? placement
      : null,
  ) as Board
  return {
    pool,
    board,
    borders: Array.isArray(o.borders) && o.borders.length === 12 ? o.borders : d.borders,
    weights: { ...d.weights, ...(o.weights ?? {}) },
    // 'connected' was the old pre-launch guess (reachability); the confirmed
    // rule is connector-matching, so anything that isn't 'any' maps to 'strict'
    mode: o.mode === 'any' ? 'any' : 'strict',
    allowRotation: !!o.allowRotation,
    adjacencyMode: o.adjacencyMode === 'connected' ? 'connected' : 'physical',
    adjacentAffectsSelf: !!o.adjacentAffectsSelf,
    disabledMods: Array.isArray(o.disabledMods)
      ? o.disabledMods.filter((x): x is string => typeof x === 'string')
      : d.disabledMods,
    strategyId: typeof o.strategyId === 'string' ? o.strategyId : null,
    borderRerollsUsed:
      typeof o.borderRerollsUsed === 'number'
        ? Math.max(0, Math.min(5, Math.floor(o.borderRerollsUsed)))
        : d.borderRerollsUsed,
  }
}
