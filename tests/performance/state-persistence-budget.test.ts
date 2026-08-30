import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { createNearLimitState } from '../../benchmarks/state-persistence-fixture'
import { prepareStateForPersistence } from '../../src/logic/stateCodec'
import { createStateRepository } from '../../src/logic/stateRepository'
import {
  persistableAppStateReducer,
  type AppStateAction,
  type PersistableAppState,
} from '../../src/state/appStateReducer'

const REFERENCE_TARGET_MS = 8
const CI_TOLERANCE = 1.25
const SAMPLE_COUNT = 11

function medianDuration(callback: () => void): number {
  for (let warmup = 0; warmup < 3; warmup++) callback()
  const samples = Array.from({ length: SAMPLE_COUNT }, () => {
    const start = performance.now()
    callback()
    return performance.now() - start
  })
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

describe('state mutation and autosave CPU budget', () => {
  it.each<AppStateAction>([
    { type: 'board/rotate', cell: 0 },
    { type: 'charts/toggle-preserved', uid: 'budget-0' },
  ])('keeps $type and verified autosave below the near-limit budget', (action) => {
    const state = createNearLimitState()
    const prepared = prepareStateForPersistence(state)
    assert.ok(prepared.ok)
    const current: PersistableAppState = {
      state,
      mutationError: null,
      persistence: prepared.persistence,
    }
    const values = new Map<string, string>()
    const repository = createStateRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
    })
    const medianMs = medianDuration(() => {
      const next = persistableAppStateReducer(current, action)
      assert.equal(next.mutationError, null)
      const payload = next.persistence?.payload
      const saved = payload
        ? repository.savePreparedLocal(payload)
        : repository.saveLocal(next.state)
      assert.ok(saved.ok)
    })
    const budgetMs = REFERENCE_TARGET_MS * CI_TOLERANCE
    console.info(
      `${action.type} + autosave: median ${medianMs.toFixed(2)} ms (CI budget ${budgetMs} ms)`,
    )
    assert.ok(
      medianMs <= budgetMs,
      `${action.type} + autosave exceeded ${budgetMs} ms: ${medianMs.toFixed(2)} ms`,
    )
  })
})
