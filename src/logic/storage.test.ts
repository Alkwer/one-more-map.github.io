import { describe, expect, it } from 'vitest'
import type { ChartData } from '../types'
import { defaultState, reviveState } from './storage'

const chart = (overrides: Partial<ChartData> = {}): ChartData => ({
  uid: 'chart-1',
  name: 'Stored Chart',
  level: 83,
  edges: [true, false, true, false],
  modIds: [],
  ...overrides,
})

describe('reviveState chart shapes', () => {
  it('keeps unresolved charts in the library but removes them from the board', () => {
    const state = defaultState()
    const unresolved = chart({
      edges: [false, false, false, false],
      shapeResolved: false,
      shapeInput: 'Spiral',
    })
    state.pool = [unresolved]
    state.board[0] = { chartUid: unresolved.uid, rotation: 0 }

    const revived = reviveState(state)

    expect(revived.pool).toEqual([unresolved])
    expect(revived.board).toEqual(Array(9).fill(null))
  })

  it('repairs stale canonical shape labels from valid stored edges', () => {
    const state = defaultState()
    const stored = chart({ shape: 'Corner' })
    state.pool = [stored]
    state.board[0] = { chartUid: stored.uid, rotation: 0 }

    const revived = reviveState(state)

    expect(revived.pool[0].shape).toBe('Straight')
    expect(revived.board[0]).toEqual({ chartUid: stored.uid, rotation: 0 })
  })
})
