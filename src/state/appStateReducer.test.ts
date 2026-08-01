import { describe, expect, it } from 'vitest'
import { defaultState, type AppState } from '../logic/storage'
import type { ChartData } from '../types'
import { appStateReducer, summarizeVoyageFinish } from './appStateReducer'

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: uid,
  level: 83,
  edges: [true, true, true, true],
  modIds: [],
  shape: 'Crossing',
  shapeResolved: true,
  ...overrides,
})

const stateWithCharts = (): AppState => ({
  ...defaultState(),
  pool: [chart('a'), chart('b'), chart('c')],
})

describe('appStateReducer', () => {
  it('places each chart once, swaps cells, rotates, and removes placements', () => {
    let state = stateWithCharts()
    state = appStateReducer(state, { type: 'board/place', cell: 0, chartUid: 'a' })
    state = appStateReducer(state, { type: 'board/place', cell: 1, chartUid: 'b' })
    state = appStateReducer(state, { type: 'board/place', cell: 8, chartUid: 'a' })

    expect(state.board[0]).toBeNull()
    expect(state.board[8]).toEqual({ chartUid: 'a', rotation: 0 })

    state = appStateReducer(state, { type: 'board/swap', first: 1, second: 8 })
    state = appStateReducer(state, { type: 'board/rotate', cell: 1 })
    expect(state.board[1]).toEqual({ chartUid: 'a', rotation: 1 })
    expect(state.board[8]).toEqual({ chartUid: 'b', rotation: 0 })

    state = appStateReducer(state, { type: 'board/remove', cell: 8 })
    expect(state.board[8]).toBeNull()
  })

  it('removes a chart from both the library and board while clear keeps preferences', () => {
    let state = stateWithCharts()
    state = {
      ...state,
      borders: ['b-divine', ...Array(11).fill(null)],
      board: [{ chartUid: 'b', rotation: 0 }, ...Array(8).fill(null)],
    }

    state = appStateReducer(state, { type: 'charts/remove', uid: 'b' })
    expect(state.pool.map(({ uid }) => uid)).toEqual(['a', 'c'])
    expect(state.board[0]).toBeNull()

    state = appStateReducer(state, { type: 'charts/clear' })
    expect(state.pool).toEqual([])
    expect(state.board).toEqual(Array(9).fill(null))
    expect(state.borders[0]).toBe('b-divine')
  })

  it('updates modifiers, borders, charts, and complete state explicitly', () => {
    let state = stateWithCharts()
    state = appStateReducer(state, { type: 'patch', patch: { mode: 'any' } })
    state = appStateReducer(state, { type: 'charts/add', charts: [chart('d')] })
    state = appStateReducer(state, {
      type: 'mods/set-disabled',
      ids: ['one', 'two'],
      disabled: true,
    })
    state = appStateReducer(state, {
      type: 'mods/set-disabled',
      ids: ['one'],
      disabled: false,
    })
    state = appStateReducer(state, { type: 'borders/set', segment: 3, id: 'b-divine' })
    state = appStateReducer(state, {
      type: 'charts/update',
      chart: { ...state.pool[0], name: 'Updated' },
    })
    state = appStateReducer(state, { type: 'charts/toggle-preserved', uid: 'a' })

    expect(state.mode).toBe('any')
    expect(state.pool.map(({ uid }) => uid)).toEqual(['a', 'b', 'c', 'd'])
    expect(state.disabledMods).toEqual(['two'])
    expect(state.borders[3]).toBe('b-divine')
    expect(state.pool[0]).toMatchObject({ name: 'Updated', preserved: true })

    const board = [{ chartUid: 'a', rotation: 2 }, ...Array(8).fill(null)]
    state = appStateReducer(state, { type: 'board/apply', board })
    board[0]!.rotation = 3
    expect(state.board[0]).toEqual({ chartUid: 'a', rotation: 2 })

    const replacement = { ...defaultState(), strategyId: 'replacement' }
    expect(appStateReducer(state, { type: 'replace', state: replacement })).toBe(replacement)
  })

  it('finishes a voyage without touching library charts that were not on the board', () => {
    const state: AppState = {
      ...stateWithCharts(),
      pool: [chart('a'), chart('b', { preserved: true }), chart('c')],
      board: [
        { chartUid: 'a', rotation: 0 },
        { chartUid: 'b', rotation: 2 },
        ...Array(7).fill(null),
      ],
      borderRerollsUsed: 4,
    }
    const kept = new Set(['b'])

    expect(summarizeVoyageFinish(state, kept)).toEqual({ consumed: 1, kept: 1 })
    const finished = appStateReducer(state, {
      type: 'voyage/finish',
      keptUids: [...kept],
    })

    expect(finished.pool.map(({ uid }) => uid)).toEqual(['b', 'c'])
    expect(finished.pool[0].preserved).toBe(false)
    expect(finished.board).toEqual(Array(9).fill(null))
    expect(finished.borderRerollsUsed).toBe(0)
  })
})
