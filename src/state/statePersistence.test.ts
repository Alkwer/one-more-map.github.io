import { describe, expect, it, vi } from 'vitest'
import { createNearLimitState } from '../../benchmarks/state-persistence-fixture'
import {
  MAX_STATE_FILE_BYTES,
  prepareStateForPersistence,
  serializeState,
} from '../logic/stateCodec'
import { createStateRepository, LOCAL_STATE_KEY } from '../logic/stateRepository'
import { defaultState, type AppState } from './appState'
import {
  persistableAppStateReducer,
  type AppStateAction,
  type PersistableAppState,
} from './appStateReducer'

function prepared(state: AppState): PersistableAppState {
  const result = prepareStateForPersistence(state)
  if (!result.ok) throw new Error(result.message)
  return { state, mutationError: null, persistence: result.persistence }
}

function repository() {
  const values = new Map<string, string>()
  return {
    values,
    ...createStateRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
    }),
  }
}

describe('state mutation persistence', () => {
  it('checks metadata without serializing library text and maintains exact chained budgets', () => {
    let current = prepared(createNearLimitState(1_000))
    const actions: AppStateAction[] = [
      { type: 'board/rotate', cell: 0 },
      { type: 'board/swap', first: 0, second: 8 },
      { type: 'board/place', cell: 1, chartUid: current.state.pool[1].uid },
      { type: 'patch', patch: { pieceKeeps: { '한글\n"\\🧭': 2 }, allowRotation: false } },
      { type: 'mods/set-disabled', ids: ['cm-rarity-50'], disabled: true },
      { type: 'board/remove', cell: 8 },
    ]
    for (const action of actions) {
      const stringify = vi.spyOn(JSON, 'stringify')
      const next = persistableAppStateReducer(current, action)
      expect(next.mutationError).toBeNull()
      expect(next.persistence?.payload).toBeUndefined()
      expect(stringify.mock.calls.every(([value]) => !value?.pool?.length)).toBe(true)
      stringify.mockRestore()

      const full = prepared(next.state)
      expect(next.persistence?.budget).toEqual(full.persistence?.budget)
      current = next
    }
    const saved = repository()
    expect(saved.saveLocal(current.state)).toEqual({ ok: true })
    expect(saved.loadLocal()).toEqual(current.state)
  })

  it('rejects metadata growth at the character and UTF-8 limits without losing the prior certificate', () => {
    const current = prepared(createNearLimitState(64))
    expect(current.persistence?.budget.exportedBytes).toBe(MAX_STATE_FILE_BYTES - 64)
    for (const [key, error] of [
      ['a'.repeat(80), 'character limit'],
      ['🧭'.repeat(20), '2 MiB file limit'],
    ]) {
      const next = persistableAppStateReducer(current, {
        type: 'patch',
        patch: { pieceKeeps: { [key]: 1 } },
      })
      expect(next.state).toBe(current.state)
      expect(next.persistence).toBe(current.persistence)
      expect(next.mutationError).toMatch(/exceeds the .* limit/)
      expect(next.mutationError).toContain(error)
    }
  })

  it('rejects invalid board references, indices, duplicate placements, and invalid settings on the cheap path', () => {
    const current = prepared(createNearLimitState())
    const actions: AppStateAction[] = [
      { type: 'board/place', cell: 0, chartUid: 'missing' },
      { type: 'board/place', cell: 9, chartUid: current.state.pool[1].uid },
      { type: 'board/apply', board: Array(9).fill(current.state.board[0]) },
      { type: 'patch', patch: { weights: { unexpected: 1 } } },
      { type: 'borders/set', segment: 0, id: 'unknown' },
    ]
    for (const action of actions) {
      const next = persistableAppStateReducer(current, action)
      expect(next.state).toBe(current.state)
      expect(next.mutationError).not.toBeNull()
    }
  })

  it('serializes changed chart data once and reuses immutable validated bytes for autosave', () => {
    const current = prepared(createNearLimitState())
    const stringify = vi.spyOn(JSON, 'stringify')
    const next = persistableAppStateReducer(current, {
      type: 'charts/toggle-preserved',
      uid: current.state.pool[0].uid,
    })
    expect(next.mutationError).toBeNull()
    expect(stringify).toHaveBeenCalledTimes(2)
    const payload = next.persistence?.payload
    expect(payload).toBeDefined()
    expect(Object.isFrozen(payload)).toBe(true)
    const saved = repository()
    expect(saved.savePreparedLocal(payload!)).toEqual({ ok: true })
    expect(stringify).toHaveBeenCalledTimes(2)
    stringify.mockRestore()
    expect(saved.values.get(LOCAL_STATE_KEY)).toBe(payload!.compact)
    expect(saved.loadLocal()).toEqual(next.state)
  })

  it('fully validates replacements and arbitrary save/export calls even after an earlier certificate', () => {
    const state = defaultState()
    const current = prepared(state)
    const malformed = { ...state, weights: { bad: 1 } }
    expect(persistableAppStateReducer(current, { type: 'replace', state: malformed }).state).toBe(
      state,
    )
    const saved = repository()
    state.disabledMods = ['missing-modifier']
    expect(
      persistableAppStateReducer(current, { type: 'replace', state }).mutationError,
    ).not.toBeNull()
    expect(saved.saveLocal(state)).toMatchObject({ ok: false, code: 'serialization' })
    expect(() => serializeState(state)).toThrow(/recovery/)
    expect(saved.values.size).toBe(0)
    // Previously certified bytes cannot be changed by mutating their original input object.
    expect(saved.savePreparedLocal(current.persistence!.payload!)).toEqual({ ok: true })
    expect(saved.loadLocal()).toEqual(defaultState())
  })
})
