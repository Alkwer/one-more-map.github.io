import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  clampRerollsUsed,
  DEFAULT_MAX_REROLL_COST,
  KEEP_FIT_LINES,
  KEEP_MODEL_PERCENTILE_LINES,
  REROLL_COSTS,
  sulphurSpentAfter,
} from '../src/logic/rerollAdvice'
import { decodeShare } from '../src/logic/share'

describe('reroll advice regressions', () => {
  it('keeps the cost curve, thresholds, and clamping', () => {
    assert.deepEqual(REROLL_COSTS, [3_000, 6_000, 12_000, 24_000, 48_000])
    assert.deepEqual(KEEP_FIT_LINES, [0.6, 0.5, 0.5, 0.5, 0.5])
    assert.deepEqual(KEEP_MODEL_PERCENTILE_LINES, [0.6, 0.5, 0.5, 0.5, 0.5])
    assert.equal(DEFAULT_MAX_REROLL_COST, 6_000)
    assert.equal(sulphurSpentAfter(3), 21_000)
    assert.equal(sulphurSpentAfter(5), 93_000)
    assert.equal(clampRerollsUsed(-2), 0)
    assert.equal(clampRerollsUsed(9), 5)
  })

  it('revives shared reroll counts into the supported range', () => {
    // Older shared states did not have the counter; malformed/newer values are
    // safely revived into the supported range.
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
    const missing = decodeShare(encode({}))
    const excessive = decodeShare(encode({ borderRerollsUsed: 99 }))
    assert.equal(missing.ok && missing.state.borderRerollsUsed, 0)
    assert.equal(excessive.ok && excessive.state.borderRerollsUsed, 5)
  })
})
