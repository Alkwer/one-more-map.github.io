import assert from 'node:assert/strict'
import { bench, describe } from 'vitest'
import { DEFAULT_WEIGHTS } from '../src/logic/rewards'
import { solve } from '../src/logic/solver'
import { evaluateStrategyInventory } from '../src/logic/strategySuggestions'
import { createPerformanceScenario, PERFORMANCE_SEED } from './performance-fixture'

const { pool, charts, borders, commonOptions } = createPerformanceScenario()

function signature(value: unknown) {
  return JSON.stringify(value)
}

function deterministicBenchmark(name: string, callback: () => unknown) {
  let expected: string | undefined
  bench(
    name,
    () => {
      const result = callback()
      const current = signature(result)
      if (expected === undefined) expected = current
      else assert.equal(current, expected, `${name} changed between seeded runs`)
    },
    {
      iterations: 3,
      time: 0,
      warmupIterations: 1,
      warmupTime: 0,
    },
  )
}

describe(`deterministic ${pool.length}-chart solver performance`, () => {
  deterministicBenchmark('Strategy inventory', () =>
    evaluateStrategyInventory(borders, charts, pool, commonOptions),
  )

  deterministicBenchmark('Interactive solve', () =>
    solve(pool, borders, DEFAULT_WEIGHTS, {
      ...commonOptions,
      topK: 5,
      seed: PERFORMANCE_SEED,
    }),
  )
})
