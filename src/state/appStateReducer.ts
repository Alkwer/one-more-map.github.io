import type { ChartData, Board } from '../types'
import { emptyBoard, emptyBorders } from '../types'
import type { AppState } from '../state/appState'
import {
  prepareStateForPersistence,
  prepareStateMetadataMutation,
  type StatePersistenceSnapshot,
} from '../logic/stateCodec'
import { chartAdditionResult } from '../logic/chartCapacity'

export type AppStateAction =
  | { type: 'replace'; state: AppState }
  | { type: 'patch'; patch: Partial<AppState> }
  | { type: 'mods/set-disabled'; ids: string[]; disabled: boolean }
  | { type: 'charts/add'; charts: ChartData[] }
  | { type: 'charts/remove'; uid: string }
  | { type: 'charts/clear' }
  | { type: 'charts/update'; chart: ChartData }
  | { type: 'charts/toggle-preserved'; uid: string }
  | { type: 'board/place'; cell: number; chartUid: string }
  | { type: 'board/swap'; first: number; second: number }
  | { type: 'board/remove'; cell: number }
  | { type: 'board/rotate'; cell: number }
  | { type: 'board/apply'; board: Board }
  | { type: 'borders/set'; segment: number; id: string | null }
  | { type: 'voyage/finish'; keptUids: string[]; boardUids: (string | null)[] }

export interface VoyageFinishSummary {
  consumed: number
  kept: number
}

export interface PersistableAppState {
  state: AppState
  mutationError: string | null
  persistence?: StatePersistenceSnapshot
}

/** Reject UI mutations that would create a state which cannot be exported and restored. */
export function persistableAppStateReducer(
  current: PersistableAppState,
  action: AppStateAction,
): PersistableAppState {
  const next = appStateReducer(current.state, action)
  if (action.type !== 'replace' && next === current.state && current.persistence) {
    return { ...current, mutationError: null }
  }
  const prepared =
    current.persistence && action.type !== 'replace'
      ? prepareStateMetadataMutation(current.state, next, current.persistence.budget)
      : prepareStateForPersistence(next)
  if (!prepared.ok) {
    return {
      ...current,
      mutationError: `Change was not applied because it could not be saved: ${prepared.message}`,
    }
  }
  return { state: next, mutationError: null, persistence: prepared.persistence }
}

export function summarizeVoyageFinish(
  state: AppState,
  keptUids: ReadonlySet<string>,
  boardUids: readonly (string | null)[],
): VoyageFinishSummary {
  const onBoard = new Set(boardUids.filter((uid): uid is string => uid !== null))
  let consumed = 0
  let kept = 0

  for (const chart of state.pool) {
    if (!onBoard.has(chart.uid)) continue
    if (keptUids.has(chart.uid)) kept++
    else consumed++
  }

  return { consumed, kept }
}

export function appStateReducer(state: AppState, action: AppStateAction): AppState {
  switch (action.type) {
    case 'replace':
      return action.state
    case 'patch':
      return { ...state, ...action.patch }
    case 'mods/set-disabled': {
      const disabledMods = new Set(state.disabledMods)
      for (const id of action.ids) {
        if (action.disabled) disabledMods.add(id)
        else disabledMods.delete(id)
      }
      return { ...state, disabledMods: [...disabledMods] }
    }
    case 'charts/add': {
      const { added } = chartAdditionResult(state.pool.length, action.charts.length)
      if (added === 0) return state
      return { ...state, pool: [...state.pool, ...action.charts.slice(0, added)] }
    }
    case 'charts/remove':
      return {
        ...state,
        pool: state.pool.filter((chart) => chart.uid !== action.uid),
        board: state.board.map((placement) =>
          placement?.chartUid === action.uid ? null : placement,
        ),
      }
    case 'charts/clear':
      return { ...state, pool: [], board: emptyBoard() }
    case 'charts/update':
      return {
        ...state,
        pool: state.pool.map((chart) => (chart.uid === action.chart.uid ? action.chart : chart)),
      }
    case 'charts/toggle-preserved':
      return {
        ...state,
        pool: state.pool.map((chart) =>
          chart.uid === action.uid ? { ...chart, preserved: !chart.preserved } : chart,
        ),
      }
    case 'board/place': {
      const board = state.board.map((placement) =>
        placement?.chartUid === action.chartUid ? null : placement,
      )
      board[action.cell] = { chartUid: action.chartUid, rotation: 0 }
      return { ...state, board }
    }
    case 'board/swap': {
      const board = [...state.board]
      const first = board[action.first]
      board[action.first] = board[action.second]
      board[action.second] = first
      return { ...state, board }
    }
    case 'board/remove': {
      const board = [...state.board]
      board[action.cell] = null
      return { ...state, board }
    }
    case 'board/rotate': {
      const board = [...state.board]
      const placement = board[action.cell]
      if (placement) {
        board[action.cell] = { ...placement, rotation: (placement.rotation + 1) % 4 }
      }
      return { ...state, board }
    }
    case 'board/apply':
      return {
        ...state,
        board: action.board.map((placement) => (placement ? { ...placement } : null)),
      }
    case 'borders/set': {
      const borders = [...state.borders]
      borders[action.segment] = action.id
      return { ...state, borders }
    }
    case 'voyage/finish': {
      const keptUids = new Set(action.keptUids)
      const onBoard = new Set(action.boardUids.filter((uid): uid is string => uid !== null))
      const pool = state.pool
        .filter((chart) => !onBoard.has(chart.uid) || keptUids.has(chart.uid))
        .map((chart) => (keptUids.has(chart.uid) ? { ...chart, preserved: false } : chart))
      return {
        ...state,
        pool,
        board: emptyBoard(),
        borders: emptyBorders(),
        borderRerollsUsed: 0,
      }
    }
  }
}
