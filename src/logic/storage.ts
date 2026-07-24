import type { Board, Borders, ChartData, ConnectivityMode, Weights } from '../types'
import { DEFAULT_WEIGHTS, emptyBoard, emptyBorders } from '../types'

export interface AppState {
  pool: ChartData[]
  board: Board
  borders: Borders
  weights: Weights
  mode: ConnectivityMode
  allowRotation: boolean
}

export const defaultState = (): AppState => ({
  pool: [],
  board: emptyBoard(),
  borders: emptyBorders(),
  weights: { ...DEFAULT_WEIGHTS },
  mode: 'connected',
  allowRotation: false,
})

const LS_KEY = 'allflame-voyage-solver'

export function saveLocal(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* storage full / unavailable — ignore */
  }
}

export function loadLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return revive(JSON.parse(raw))
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
    return revive(JSON.parse(json))
  } catch {
    return null
  }
}

function revive(obj: unknown): AppState {
  const d = defaultState()
  if (typeof obj !== 'object' || obj === null) return d
  const o = obj as Partial<AppState>
  return {
    pool: Array.isArray(o.pool) ? o.pool : d.pool,
    board: Array.isArray(o.board) && o.board.length === 9 ? o.board : d.board,
    borders: Array.isArray(o.borders) && o.borders.length === 12 ? o.borders : d.borders,
    weights: { ...d.weights, ...(o.weights ?? {}) },
    mode: o.mode === 'any' || o.mode === 'strict' ? o.mode : 'connected',
    allowRotation: !!o.allowRotation,
  }
}
