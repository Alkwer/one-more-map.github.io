import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { ChartData } from '../src/types'
import { appraiseBorders } from '../src/logic/borderAppraisal'
import { BORDER_ROLL_MODEL } from '../src/logic/borderRollModel'

const options = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
}

const chart = (uid: string, modIds: string[] = []): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [false, false, false, false],
  modIds,
})

describe('border appraisal regressions', () => {
  it('scores marginal contribution and contextual fit', () => {
    // A single 50% currency border contributes 5 points at weight 10. The best
    // known currency tier contributes 10, so the slot-level contextual fit is 50%.
    const c = chart('one')
    const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
    const borders = ['b-curr-1', ...Array(11).fill(null)]
    const result = appraiseBorders(
      board,
      borders,
      new Map([[c.uid, c]]),
      { 'border:curr': 10 },
      options,
    )

    assert.equal(result.score, 5)
    assert.equal(result.segments[0].bestModId, 'b-curr-3')
    assert.equal(result.segments[0].bestContribution, 10)
    assert.equal(result.segments[0].fit, 0.5)
    assert.equal(result.status, 'incomplete')
  })

  it('appraises magnitude through the touched chart', () => {
    // Magnitude borders are appraised through their interaction with the touched
    // chart, even though the border itself has no direct ModEffect entries.
    const c = chart('magnitude', ['cm-quant-20'])
    const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
    const borders = ['b-mag-1', ...Array(11).fill(null)]
    const result = appraiseBorders(
      board,
      borders,
      new Map([[c.uid, c]]),
      { 'self:quant': 5 },
      options,
    )

    assert.ok(Math.abs(result.segments[0].contribution - 0.4) < 1e-9)
    assert.equal(result.segments[0].bestModId, 'b-mag-3')
    assert.ok(Math.abs(result.segments[0].fit - 0.5) < 1e-9)
  })

  it('classifies a complete strong contextual fit', () => {
    // A complete board with the middle currency tier in every slot is a 75% fit
    // against the known top tier. This is a contextual "strong fit", not roll EV.
    const charts = Array.from({ length: 9 }, (_, i) => chart(String(i)))
    const board = charts.map((c) => ({ chartUid: c.uid, rotation: 0 }))
    const borders = Array(12).fill('b-curr-2')
    const result = appraiseBorders(
      board,
      borders,
      new Map(charts.map((c) => [c.uid, c])),
      { 'border:curr': 10 },
      options,
    )

    assert.equal(result.score, 90)
    assert.equal(result.ceiling, 120)
    assert.equal(result.fit, 0.75)
    assert.equal(result.status, 'excellent')
    assert.equal(result.activeSegments, 12)
    assert.equal(result.attentionSegments, 0)
  })

  it('surfaces an unscored modifier as needing attention', () => {
    // A selected modifier that has no weight is surfaced as needing attention.
    const c = chart('zero')
    const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
    const borders = ['b-scarab-1', ...Array(11).fill(null)]
    const result = appraiseBorders(board, borders, new Map([[c.uid, c]]), {}, options)

    assert.equal(result.segments[0].issue, 'unscored')
    assert.equal(result.attentionSegments, 1)
  })

  it('compares a concrete layout with posterior-predictive paid rerolls', () => {
    const charts = Array.from({ length: 9 }, (_, index) => chart(String(index)))
    const board = charts.map((entry) => ({ chartUid: entry.uid, rotation: 0 }))
    const borders = Array(12).fill('b-curr-1')
    const result = appraiseBorders(
      board,
      borders,
      new Map(charts.map((entry) => [entry.uid, entry])),
      { 'border:curr': 10 },
      options,
      BORDER_ROLL_MODEL,
    )

    assert.equal(result.rollForecast?.modelVersion, 1)
    assert.equal(result.rollForecast?.sampleCount, BORDER_ROLL_MODEL.sampleCount)
    assert.ok((result.rollForecast?.currentPercentile ?? -1) >= 0)
    assert.ok((result.rollForecast?.currentPercentile ?? 2) <= 1)
    assert.ok((result.rollForecast?.chanceNextRollBeatsCurrent ?? -1) >= 0)
    assert.ok((result.rollForecast?.chanceNextRollBeatsCurrent ?? 2) <= 1)
  })
})
