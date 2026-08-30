import { defaultState, type AppState } from '../src/state/appState'
import {
  MAX_POOL_CHARTS,
  MAX_RAW_TEXT_LENGTH,
  MAX_STATE_FILE_BYTES,
  serializeState,
} from '../src/logic/stateCodec'

/** A maximum-count library whose readable UTF-8 export is exactly headroom bytes below 2 MiB. */
export function createNearLimitState(headroom = 128): AppState {
  const state: AppState = {
    ...defaultState(),
    pool: Array.from({ length: MAX_POOL_CHARTS }, (_, index) => ({
      uid: `budget-${index}`,
      name: `Chart ${index}`,
      level: 83,
      edges: [true, false, true, false],
      modIds: [],
      shape: 'Straight',
      rawText: '',
    })),
  }
  state.board[0] = { chartUid: state.pool[0].uid, rotation: 0 }
  let remaining =
    MAX_STATE_FILE_BYTES - headroom - new TextEncoder().encode(serializeState(state, 2)).byteLength
  for (const chart of state.pool) {
    const length = Math.min(MAX_RAW_TEXT_LENGTH, remaining)
    chart.rawText = 'r'.repeat(length)
    remaining -= length
  }
  if (remaining !== 0) throw new Error('Fixture does not have sufficient chart-text capacity')
  return state
}
