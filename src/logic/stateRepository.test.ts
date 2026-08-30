import { describe, expect, it, vi } from 'vitest'
import { defaultState } from '../state/appState'
import { decodeStateJson, serializeState, STATE_VERSION } from './stateCodec'
import { createStateRepository, LOCAL_STATE_KEY, type StateStorage } from './stateRepository'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(LOCAL_STATE_KEY, initial)
  const storage: StateStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
  return { storage, values, repository: createStateRepository(storage) }
}

describe('injected state repository', () => {
  it('round-trips state through independent storage instances without browser globals', () => {
    const first = memoryStorage()
    const second = memoryStorage()
    expect(first.repository.loadLocalState()).toEqual({ status: 'empty' })
    expect(first.repository.saveLocal(defaultState())).toEqual({ ok: true })
    expect(first.repository.loadLocalState()).toEqual({ status: 'ready', state: defaultState() })
    expect(second.repository.loadLocalState()).toEqual({ status: 'empty' })
  })

  it('quarantines the exact invalid input and reuses its backup without replacing it', () => {
    const raw = '{damaged state'
    const { repository, values } = memoryStorage(raw)
    const recovery = repository.loadLocalState()
    expect(recovery.status).toBe('recovery')
    if (recovery.status !== 'recovery') throw new Error('Expected recovery')
    expect(recovery.backupKey).not.toBeNull()
    expect(values.get(recovery.backupKey!)).toBe(raw)
    expect(values.get(LOCAL_STATE_KEY)).toBe(raw)
    expect(repository.loadLocalState()).toEqual(recovery)
    expect(values.size).toBe(2)
  })

  it('proposes pure migrations but keeps the original payload until explicitly saved', () => {
    const raw = JSON.stringify({ ...defaultState(), v: STATE_VERSION - 1 })
    const decoded = decodeStateJson(raw)
    expect(decoded.ok).toBe(true)
    const { repository, values } = memoryStorage(raw)
    expect(repository.loadLocalState()).toMatchObject({
      status: 'recovery',
      code: 'migration',
      proposedState: defaultState(),
      raw,
    })
    expect(values.get(LOCAL_STATE_KEY)).toBe(raw)
    expect(decodeStateJson(serializeState(defaultState()))).toEqual({
      ok: true,
      state: defaultState(),
      warnings: [],
    })
  })

  it('reports quota, unavailable storage, and failed write verification through the port', () => {
    const getItem = vi.fn(() => null)
    const quota = createStateRepository({
      getItem,
      setItem: () => {
        throw { name: 'QuotaExceededError' }
      },
    })
    expect(quota.saveLocal(defaultState())).toMatchObject({ ok: false, code: 'quota' })
    expect(getItem).not.toHaveBeenCalled()
    const blocked = createStateRepository({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(blocked.saveLocal(defaultState())).toMatchObject({ ok: false, code: 'unavailable' })
    expect(blocked.loadLocalState()).toEqual({ status: 'empty' })
    expect(blocked.quarantineLocalState('original')).toBeNull()
    const droppedWrite = createStateRepository({ getItem, setItem: () => {} })
    expect(droppedWrite.saveLocal(defaultState())).toMatchObject({
      ok: false,
      code: 'verification',
    })
  })
})
