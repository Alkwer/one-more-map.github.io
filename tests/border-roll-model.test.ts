import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  BORDER_ROLL_MODEL,
  buildBorderRollModel,
  chanceModAppearsOnBoard,
  forecastBorderRoll,
  type BorderRollDatasetInput,
} from '../src/logic/borderRollModel'

const dataset = (samples: BorderRollDatasetInput['samples']): BorderRollDatasetInput => ({
  exportedAt: '2026-08-04T00:00:00.000Z',
  samples,
})

describe('experimental border roll model', () => {
  it('smooths observed frequencies without making unseen known mods impossible', () => {
    const model = buildBorderRollModel(
      dataset([
        {
          sequenceId: 'one',
          generation: 'natural',
          borderModIds: ['a', 'a', 'a', 'b'],
        },
      ]),
      ['a', 'b', 'c'],
    )

    assert.ok(model.probabilities.a > model.probabilities.b)
    assert.ok(model.probabilities.b > model.probabilities.c)
    assert.ok(model.probabilities.c > 0)
    assert.ok(
      Math.abs(Object.values(model.probabilities).reduce((sum, value) => sum + value, 0) - 1) <
        1e-12,
    )
  })

  it('produces deterministic posterior-predictive comparisons', () => {
    const model = buildBorderRollModel(
      dataset([
        {
          sequenceId: 'one',
          generation: 'natural',
          borderModIds: Array(11).fill('common').concat('rare'),
        },
      ]),
      ['common', 'rare'],
    )
    const contributions = [{ common: 1, rare: 0 }]
    const weak = forecastBorderRoll(model, contributions, 0, 1, 2_000)!
    const strong = forecastBorderRoll(model, contributions, 1, 1, 2_000)!

    assert.ok(weak.chanceNextRollBeatsCurrent > 0.75)
    assert.ok(strong.currentPercentile > weak.currentPercentile)
    assert.deepEqual(
      forecastBorderRoll(model, contributions, 1, 1, 2_000),
      forecastBorderRoll(model, contributions, 1, 1, 2_000),
    )
  })

  it('builds the shipped paid-reroll model directly from the canonical dataset', () => {
    assert.equal(BORDER_ROLL_MODEL.version, 1)
    assert.equal(BORDER_ROLL_MODEL.profile, 'paid-reroll')
    assert.ok(BORDER_ROLL_MODEL.sampleCount > 0)
    assert.equal(BORDER_ROLL_MODEL.sampleCount, BORDER_ROLL_MODEL.paidRerollBoardCount)
    assert.equal(BORDER_ROLL_MODEL.slotCount, BORDER_ROLL_MODEL.sampleCount * 12)
    assert.ok(BORDER_ROLL_MODEL.sequenceCount > 0)
    assert.ok(BORDER_ROLL_MODEL.sequenceCount <= BORDER_ROLL_MODEL.sampleCount)
    assert.ok(['low', 'medium', 'high'].includes(BORDER_ROLL_MODEL.confidence))

    const divineBoardChance = chanceModAppearsOnBoard(BORDER_ROLL_MODEL, 'b-divine')!
    assert.ok(divineBoardChance > 0)
    assert.ok(divineBoardChance < 1)
  })
})
