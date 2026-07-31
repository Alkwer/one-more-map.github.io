import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { createPerformanceScenario, PERFORMANCE_SEED } from '../../benchmarks/performance-fixture'
import { DEFAULT_WEIGHTS } from '../../src/logic/rewards'
import { solve } from '../../src/logic/solver'
import { evaluateStrategyInventory } from '../../src/logic/strategySuggestions'

const SAMPLE_COUNT = 5
const CI_TOLERANCE = 1.25
const REFERENCE_TARGET_MS = {
  strategyInventory: 1_000,
  interactiveSolve: 2_000,
}

function medianDuration(callback: () => unknown): number {
  callback() // warm up module and JIT paths before collecting samples
  const samples: number[] = []
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const start = performance.now()
    callback()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

function assertWithinBudget(name: string, medianMs: number, targetMs: number) {
  const budgetMs = targetMs * CI_TOLERANCE
  console.info(`${name}: median ${medianMs.toFixed(2)} ms (CI budget ${budgetMs} ms)`)
  assert.ok(
    medianMs <= budgetMs,
    `${name} median ${medianMs.toFixed(2)} ms exceeded the ${budgetMs} ms CI budget`,
  )
}

describe('solver performance budget', () => {
  it('keeps strategy inventory within the noise-tolerant CI budget', () => {
    const { pool, charts, borders, commonOptions } = createPerformanceScenario()
    const medianMs = medianDuration(() =>
      evaluateStrategyInventory(borders, charts, pool, commonOptions),
    )
    assertWithinBudget('Strategy inventory', medianMs, REFERENCE_TARGET_MS.strategyInventory)
  }, 30_000)

  it('keeps interactive solve within the noise-tolerant CI budget', () => {
    const { pool, borders, commonOptions } = createPerformanceScenario()
    const medianMs = medianDuration(() =>
      solve(pool, borders, DEFAULT_WEIGHTS, {
        ...commonOptions,
        topK: 5,
        seed: PERFORMANCE_SEED,
      }),
    )
    assertWithinBudget('Interactive solve', medianMs, REFERENCE_TARGET_MS.interactiveSolve)
  }, 30_000)
})
