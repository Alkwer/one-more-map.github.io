import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  BORDER_ROLL_MODEL,
  buildBorrowedPaidRerollModel,
  buildBorderRollModel,
  chanceModAppearsOnBoard,
  estimateModBoardChance,
  forecastBorderRoll,
  sampleBorderRoll,
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
    assert.ok(model.probabilitiesBySlot[0].a > model.probabilitiesBySlot[0].b)
    assert.ok(
      Math.abs(
        Object.values(model.probabilitiesBySlot[0]).reduce((sum, value) => sum + value, 0) - 1,
      ) < 1e-12,
    )
  })

  it('keeps data-backed reward families in their physical slots', () => {
    const general = 'general'
    const board = Array(12).fill(general)
    board[1] = 'b-chaos'
    board[4] = 'b-rarity-1'
    board[7] = 'b-scarab-1'
    board[10] = 'b-exp-1'
    const model = buildBorderRollModel(
      dataset([{ sequenceId: 'one', generation: 'paid-reroll', borderModIds: board }]),
      [general, 'b-chaos', 'b-divine', 'b-rarity-1', 'b-scarab-1', 'b-exp-1'],
      'paid-reroll',
    )

    assert.ok(model.probabilitiesBySlot[1]['b-divine'] > 0)
    assert.equal(model.probabilitiesBySlot[0]['b-divine'], 0)
    assert.equal(model.probabilitiesBySlot[4]['b-divine'], 0)
    assert.deepEqual(estimateModBoardChance(model, 'b-divine')?.eligibleSlots, [1])
    assert.equal(
      chanceModAppearsOnBoard(model, 'b-divine'),
      model.probabilitiesBySlot[1]['b-divine'],
    )
  })

  it('separates prior-only chances from estimates backed by observed hits', () => {
    const board = Array(12).fill('general')
    board[1] = 'b-chaos'
    const model = buildBorderRollModel(
      dataset([{ sequenceId: 'one', generation: 'paid-reroll', borderModIds: board }]),
      ['general', 'b-chaos', 'b-divine'],
      'paid-reroll',
    )

    assert.deepEqual(estimateModBoardChance(model, 'b-divine'), {
      chance: model.probabilitiesBySlot[1]['b-divine'],
      evidence: 'prior-only',
      observations: 0,
      borrowedObservations: 0,
      eligibleSlots: [1],
    })
    assert.equal(estimateModBoardChance(model, 'b-chaos')?.evidence, 'observed')
    assert.equal(estimateModBoardChance(model, 'b-chaos')?.observations, 1)
  })

  it('widens a fixed-slot hypothesis when new observations contradict it', () => {
    const board = Array(12).fill('general')
    board[0] = 'b-chaos'
    const model = buildBorderRollModel(
      dataset([{ sequenceId: 'one', generation: 'paid-reroll', borderModIds: board }]),
      ['general', 'b-chaos'],
      'paid-reroll',
    )

    assert.deepEqual(estimateModBoardChance(model, 'b-chaos')?.eligibleSlots, [0, 1])
    assert.ok(model.probabilitiesBySlot[0]['b-chaos'] > 0)
    assert.ok(model.probabilitiesBySlot[1]['b-chaos'] > 0)
  })

  it('scores a layout against the posterior for each matching physical slot', () => {
    const model = buildBorderRollModel(
      dataset(
        Array.from({ length: 4 }, (_, index) => ({
          sequenceId: `sequence-${index}`,
          generation: 'paid-reroll' as const,
          borderModIds: ['top-mod', 'right-mod'],
        })),
      ),
      ['top-mod', 'right-mod'],
      'paid-reroll',
    )
    const aligned = forecastBorderRoll(
      model,
      [
        { 'top-mod': 1, 'right-mod': 0 },
        { 'top-mod': 0, 'right-mod': 1 },
      ],
      0,
      2,
      1_000,
    )!
    const swapped = forecastBorderRoll(
      model,
      [
        { 'top-mod': 0, 'right-mod': 1 },
        { 'top-mod': 1, 'right-mod': 0 },
      ],
      0,
      2,
      1_000,
    )!

    assert.ok(aligned.expectedScore > swapped.expectedScore)
    assert.ok(aligned.expectedFit > swapped.expectedFit)
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

    assert.ok(weak.chanceNextRollBeatsCurrent > 0.6)
    assert.ok(strong.currentPercentile > weak.currentPercentile)
    assert.equal(weak.modelStructure, 'slot-aware')
    assert.ok(weak.currentPercentileRange[0] <= weak.currentPercentileRange[1])
    assert.deepEqual(
      forecastBorderRoll(model, contributions, 1, 1, 2_000),
      forecastBorderRoll(model, contributions, 1, 1, 2_000),
    )
  })

  it('borrows natural boards for weights without inflating paid confidence', () => {
    const natural = Array(12).fill('natural-heavy')
    const paid = Array(12).fill('paid-only')
    const model = buildBorrowedPaidRerollModel(
      dataset([
        { sequenceId: 'natural-one', generation: 'natural', borderModIds: natural },
        { sequenceId: 'paid-one', generation: 'paid-reroll', borderModIds: paid },
      ]),
      ['natural-heavy', 'paid-only'],
    )

    assert.equal(model.trainingProfile, 'pooled-borrowed')
    assert.equal(model.sampleCount, 1)
    assert.equal(model.trainingSampleCount, 2)
    assert.equal(model.sequenceCount, 1)
    assert.equal(model.confidence, 'low')
    assert.equal(model.borrowedNaturalBoardCount, 1)
    assert.equal(model.naturalBorrowWeight, 0.5)
    assert.equal(estimateModBoardChance(model, 'natural-heavy')?.evidence, 'borrowed')
  })

  it('draws experimental boards from the physical slot distributions', () => {
    const board = Array(12).fill('general')
    board[1] = 'b-chaos'
    const model = buildBorderRollModel(
      dataset([{ sequenceId: 'one', generation: 'paid-reroll', borderModIds: board }]),
      ['general', 'b-chaos'],
      'paid-reroll',
    )
    const sampled = sampleBorderRoll(model, () => 0.999999)

    assert.equal(sampled.length, 12)
    assert.equal(sampled.filter((id) => id === 'b-chaos').length, 1)
    assert.equal(sampled[1], 'b-chaos')
  })

  it('builds the shipped paid-reroll model directly from the canonical dataset', () => {
    assert.equal(BORDER_ROLL_MODEL.version, 3)
    assert.equal(BORDER_ROLL_MODEL.profile, 'paid-reroll')
    assert.ok(BORDER_ROLL_MODEL.sampleCount > 0)
    assert.equal(BORDER_ROLL_MODEL.sampleCount, BORDER_ROLL_MODEL.paidRerollBoardCount)
    assert.equal(
      BORDER_ROLL_MODEL.trainingSampleCount,
      BORDER_ROLL_MODEL.sampleCount + BORDER_ROLL_MODEL.borrowedNaturalBoardCount,
    )
    assert.equal(BORDER_ROLL_MODEL.slotCount, BORDER_ROLL_MODEL.sampleCount * 12)
    assert.ok(BORDER_ROLL_MODEL.sequenceCount > 0)
    assert.ok(BORDER_ROLL_MODEL.sequenceCount <= BORDER_ROLL_MODEL.sampleCount)
    assert.ok(['low', 'medium', 'high'].includes(BORDER_ROLL_MODEL.confidence))

    const divineBoardChance = chanceModAppearsOnBoard(BORDER_ROLL_MODEL, 'b-divine')!
    assert.ok(divineBoardChance > 0)
    assert.ok(divineBoardChance < 1)
    assert.equal(BORDER_ROLL_MODEL.probabilitiesBySlot[1]['b-divine'] > 0, true)
    assert.equal(
      BORDER_ROLL_MODEL.probabilitiesBySlot.filter((slot) => slot['b-divine'] > 0).length,
      1,
    )
    const divineEstimate = estimateModBoardChance(BORDER_ROLL_MODEL, 'b-divine')!
    assert.equal(divineEstimate.chance, divineBoardChance)
    assert.equal(
      divineEstimate.evidence,
      divineEstimate.observations === 0 ? 'prior-only' : 'observed',
    )
  })
})
