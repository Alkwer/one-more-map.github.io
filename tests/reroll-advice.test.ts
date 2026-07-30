import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  clampRerollsUsed,
  KEEP_FIT_LINES,
  REROLL_COSTS,
  sulphurSpentAfter,
} from '../src/logic/rerollAdvice'
import { decodeShare } from '../src/logic/storage'

describe('reroll advice regressions', () => {
  it('keeps the cost curve, thresholds, and clamping', () => {
    assert.deepEqual(REROLL_COSTS, [3_000, 6_000, 12_000, 24_000, 48_000])
    assert.deepEqual(KEEP_FIT_LINES, [0.6, 0.5, 0.4, 0.3, 0.2])
    assert.equal(sulphurSpentAfter(3), 21_000)
    assert.equal(sulphurSpentAfter(5), 93_000)
    assert.equal(clampRerollsUsed(-2), 0)
    assert.equal(clampRerollsUsed(9), 5)
  })

  it('revives shared reroll counts into the supported range', () => {
    // Older shared states did not have the counter; malformed/newer values are
    // safely revived into the supported range.
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
    assert.equal(decodeShare(encode({}))?.borderRerollsUsed, 0)
    assert.equal(decodeShare(encode({ borderRerollsUsed: 99 }))?.borderRerollsUsed, 5)
  })
})
