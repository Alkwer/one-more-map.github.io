import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { createPerformanceScenario, PERFORMANCE_SEED } from '../benchmarks/performance-fixture'
import { DEFAULT_WEIGHTS } from '../src/logic/rewards'
import { solve } from '../src/logic/solver'
import { evaluateStrategyInventory } from '../src/logic/strategySuggestions'

const QUALITY_EPSILON = 1e-9

describe('25-chart solver quality budget', () => {
  it('does not regress the known interactive result quality', () => {
    const { pool, borders, commonOptions } = createPerformanceScenario()
    const results = solve(pool, borders, DEFAULT_WEIGHTS, {
      ...commonOptions,
      topK: 5,
      seed: PERFORMANCE_SEED,
    })

    assert.equal(results.length, 5)
    assert.equal(new Set(results.map((result) => JSON.stringify(result.board))).size, 5)
    assert.ok(results.every((result) => result.valid && result.launchable && result.fullyReachable))
    assert.ok(results[0].score >= 145.68 - QUALITY_EPSILON)
    assert.ok(results[0].reward >= 144.48 - QUALITY_EPSILON)
    assert.ok(results[4].score >= 144 - QUALITY_EPSILON)
  })

  it('does not regress known strategy inventory quality or ranking', () => {
    const { pool, charts, borders, commonOptions } = createPerformanceScenario()
    const inventory = evaluateStrategyInventory(borders, charts, pool, commonOptions)

    assert.deepEqual(
      inventory.evaluations.map((entry) => entry.strategy.id),
      [
        'milky-meatfish',
        'divine-border-rares',
        'alc-and-go',
        'milky-ethereal',
        'cutedog-divine-boxes',
        'milky-speedrun',
      ],
    )
    const qualityFloor = new Map([
      ['milky-meatfish', 298.88],
      ['divine-border-rares', 200.4],
      ['milky-ethereal', 12.28],
      ['cutedog-divine-boxes', 34.62],
    ])
    for (const evaluation of inventory.evaluations) {
      const minimum = qualityFloor.get(evaluation.strategy.id)
      if (minimum === undefined) continue
      assert.ok(evaluation.potentialScore >= minimum - QUALITY_EPSILON)
      assert.equal(evaluation.potentialLaunchable, true)
      assert.equal(evaluation.potentialFullyReachable, true)
    }
  })
})
