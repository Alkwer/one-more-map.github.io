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

  it('keeps canonical strategy inventory requirement-safe', () => {
    const { pool, charts, borders, commonOptions } = createPerformanceScenario()
    const inventory = evaluateStrategyInventory(borders, charts, pool, commonOptions)

    assert.deepEqual(
      inventory.evaluations.map((entry) => entry.strategy.id),
      [
        'alc-and-go',
        'milky-meatfish',
        'divine-border-rares',
        'cutedog-divine-boxes',
        'milky-ethereal',
        'milky-speedrun',
      ],
    )
    const alcAndGo = inventory.evaluations[0]
    assert.ok(alcAndGo.potentialScore > 0)

    for (const evaluation of inventory.evaluations.filter(
      (entry) => entry.strategy.requirements?.length,
    )) {
      assert.equal(evaluation.readiness.ready, false)
      assert.equal(evaluation.potentialScore, 0)
      assert.equal(evaluation.potentialLaunchable, false)
      assert.equal(evaluation.potentialFullyReachable, false)
    }
  })
})
