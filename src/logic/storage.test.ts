import { describe, expect, it } from 'vitest'
import { defaultStrategyReservations } from '../data/strategies'
import { decodeShare, defaultState, encodeShare } from './storage'

const encodeRawState = (value: unknown): string =>
  btoa(unescape(encodeURIComponent(JSON.stringify(value))))

describe('strategy reservation persistence', () => {
  it('enables every protection by default', () => {
    expect(defaultState().strategyReservations).toEqual(defaultStrategyReservations())
  })

  it('round-trips independent protection choices through shared state', () => {
    const state = defaultState()
    state.strategyReservations = {
      divine: true,
      meatfish: false,
      ethereal: true,
    }

    expect(decodeShare(encodeShare(state))?.strategyReservations).toEqual(
      state.strategyReservations,
    )
  })

  it('loads legacy shared state with backward-compatible defaults', () => {
    const legacyState: Record<string, unknown> = { ...defaultState() }
    delete legacyState.strategyReservations

    expect(decodeShare(encodeRawState(legacyState))?.strategyReservations).toEqual(
      defaultStrategyReservations(),
    )
  })
})
