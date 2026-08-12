import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { Board, Borders, ChartData, ModEffect } from '../src/types'
import { appraiseBorders } from '../src/logic/borderAppraisal'
import { analyzeConnectivity } from '../src/logic/connectivity'
import { chartRewardKey, chartRewardModifierIds, DEFAULT_WEIGHTS } from '../src/logic/rewards'
import { prepareScoreTotal, scoreBoard, type ScoreOptions } from '../src/logic/scoring'
import { createPerformanceFixture } from '../benchmarks/performance-fixture'
import englishChart from '../src/logic/__fixtures__/charted.en.txt?raw'
import { parseChartText } from '../src/logic/parser'
import { chartValue } from '../src/logic/chartRanking'
import { updateImportedReward } from '../src/components/library/chartEditorRewards'

const options: ScoreOptions = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
}

const chart = (uid: string, modIds: string[] = [], rewards?: ModEffect[]): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [false, false, false, false],
  modIds,
  rewards,
})

const boardWith = (...entries: [number, ChartData][]): Board => {
  const board: Board = Array(9).fill(null)
  for (const [tile, entry] of entries) {
    board[tile] = { chartUid: entry.uid, rotation: 0 }
  }
  return board
}

const bordersWith = (segment: number, modId: string): Borders => {
  const borders: Borders = Array(12).fill(null)
  borders[segment] = modId
  return borders
}

const emptyBorders = (): Borders => Array(12).fill(null)
const assertClose = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)

describe('scoring regressions', () => {
  it('disables imported aggregate quantity consistently after editing', () => {
    const parsed = parseChartText(englishChart)
    assert.deepEqual(parsed.rejected, [])
    assert.equal(parsed.charts.length, 1)
    const imported = parsed.charts[0]
    const quantityIndex = imported.rewards!.findIndex((reward) => reward.stat === 'quantity')
    const edited = updateImportedReward(imported, quantityIndex, 30)
    const disabledMods = new Set(chartRewardModifierIds('quantity'))
    const disabledOptions = { ...options, disabledMods }
    const weights = { [chartRewardKey('quantity')]: 1 }

    for (const candidate of [imported, edited]) {
      const board = boardWith([0, candidate])
      const charts = new Map([[candidate.uid, candidate]])
      const connectivity = analyzeConnectivity(board, charts, 'any')

      assert.equal(scoreBoard(board, emptyBorders(), charts, weights, disabledOptions).total, 0)
      assert.equal(
        prepareScoreTotal(emptyBorders(), charts, weights, disabledOptions)(board, connectivity),
        0,
      )
      assert.equal(chartValue(candidate, weights, disabledMods), 0)
    }
  })

  it('stacks effects additively within an area', () => {
    const c = chart(
      'additive',
      [],
      [
        { stat: 'quantity', percent: 50 },
        { stat: 'quantity', percent: 50 },
      ],
    )
    const board = boardWith([1, c])
    const charts = new Map([[c.uid, c]])
    const weights = { 'self:quant': 1 }
    const connectivity = analyzeConnectivity(board, charts, 'any')

    const score = scoreBoard(board, emptyBorders(), charts, weights, options, connectivity)
    const fastScore = prepareScoreTotal(emptyBorders(), charts, weights, options)

    assert.equal(score.total, 1)
    assert.equal(score.perStat.quantity, 1)
    assert.equal(fastScore(board, connectivity), 1)
  })

  it('scores imported explicit rewards and border appraisal consistently', () => {
    // Imported header rewards are scored as self-scope explicit modifiers and use
    // the same reward key as their manually modelled chart-mod equivalent.
    assert.equal(chartRewardKey('quantity'), 'self:quant')
    assert.equal(chartRewardKey('sulphur'), 'self:sulph')
    assert.equal(chartRewardKey('packsize'), 'self:pack')
    assert.ok(DEFAULT_WEIGHTS['self:currency'] > 0)
    assert.ok(DEFAULT_WEIGHTS['self:scarabs'] > 0)

    const c = chart('imported', [], [{ stat: 'quantity', percent: 100 }])
    const board = boardWith([1, c])
    const charts = new Map([[c.uid, c]])
    const weights = { 'self:quant': 5 }

    assert.equal(scoreBoard(board, emptyBorders(), charts, weights, options).total, 5)
    assert.equal(scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options).total, 7)

    const appraisal = appraiseBorders(board, bordersWith(1, 'b-mag-1'), charts, weights, options)
    assert.equal(appraisal.score, 2)
    assert.equal(appraisal.ceiling, 4)
    assert.equal(appraisal.fit, 0.5)
    assert.equal(appraisal.segments[1].contribution, 2)
    assert.equal(appraisal.segments[1].bestModId, 'b-mag-3')
    assert.equal(appraisal.segments[1].bestContribution, 4)
    assert.equal(appraisal.segments[1].fit, 0.5)
  })

  it('uses manual self mods as the fallback', () => {
    const c = chart('manual', ['cm-quant-20'])
    const board = boardWith([1, c])
    const charts = new Map([[c.uid, c]])
    const weights = { 'self:quant': 5 }

    assert.equal(scoreBoard(board, emptyBorders(), charts, weights, options).total, 1)
    assertClose(scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options).total, 1.4)
  })

  it('keeps imported aggregates authoritative over manual ids', () => {
    const c = chart('mixed', ['cm-quant-20'], [{ stat: 'quantity', percent: 100 }])
    const board = boardWith([1, c])
    const charts = new Map([[c.uid, c]])
    const weights = { 'self:quant': 5 }

    assert.equal(scoreBoard(board, emptyBorders(), charts, weights, options).total, 5)
    assert.equal(scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options).total, 7)
  })

  it('does not amplify adjacent implicits with explicit magnitude', () => {
    const source = chart('adjacent-source', ['adj-star-1'])
    const target = chart('adjacent-target')
    const board = boardWith([1, source], [4, target])
    const charts = new Map([
      [source.uid, source],
      [target.uid, target],
    ])
    const weights = { 'adjacent:star': 10 }

    const base = scoreBoard(board, emptyBorders(), charts, weights, options)
    const withMagnitude = scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options)
    assert.equal(base.total, 1.5)
    assert.equal(withMagnitude.total, base.total)
  })

  it('does not amplify Voyage-wide implicits with explicit magnitude', () => {
    const c = chart('global', ['voy-quant-1'])
    const board = boardWith([1, c])
    const charts = new Map([[c.uid, c]])
    const weights = { 'voyage:quant': 10 }

    const base = scoreBoard(board, emptyBorders(), charts, weights, options)
    const withMagnitude = scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options)
    assert.equal(base.total, 0.8)
    assert.equal(withMagnitude.total, base.total)
  })

  it('keeps the compiled hot-path total equivalent to the full score breakdown', () => {
    const pool = createPerformanceFixture(14).map((entry, index) =>
      index % 4 === 0
        ? {
            ...entry,
            rewards: [
              { stat: 'quantity' as const, percent: 30 + index },
              { stat: 'packsize' as const, percent: 12 },
            ],
          }
        : entry,
    )
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = [
      'b-rare-3',
      'b-quantconn-2',
      'b-mag-3',
      'b-minmagic',
      null,
      'b-rare-3',
      'b-quantconn-2',
      null,
      'b-mag-3',
      'b-minmagic',
      null,
      'b-rare-3',
    ] satisfies Borders
    const optionSets: ScoreOptions[] = [
      { adjacencyMode: 'physical', adjacentAffectsSelf: false, disabledMods: new Set() },
      { adjacencyMode: 'physical', adjacentAffectsSelf: true, disabledMods: new Set() },
      { adjacencyMode: 'connected', adjacentAffectsSelf: false, disabledMods: new Set() },
      {
        adjacencyMode: 'connected',
        adjacentAffectsSelf: true,
        disabledMods: new Set(['adj-star-1', 'b-mag-3']),
      },
    ]
    let randomState = 0x31c0ffee
    const random = () => {
      randomState = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState)
      randomState ^= randomState + Math.imul(randomState ^ (randomState >>> 7), 61 | randomState)
      return ((randomState ^ (randomState >>> 14)) >>> 0) / 4_294_967_296
    }

    for (const scoreOptions of optionSets) {
      const fastScore = prepareScoreTotal(borders, charts, DEFAULT_WEIGHTS, scoreOptions)
      for (let sample = 0; sample < 30; sample++) {
        const shuffled = [...pool].sort(() => random() - 0.5)
        const board: Board = Array.from({ length: 9 }, (_, index) =>
          random() < 0.12
            ? null
            : {
                chartUid: shuffled[index].uid,
                rotation: Math.floor(random() * 4),
              },
        )
        const connectivity = analyzeConnectivity(board, charts, 'strict')
        const full = scoreBoard(
          board,
          borders,
          charts,
          DEFAULT_WEIGHTS,
          scoreOptions,
          connectivity,
        ).total
        assertClose(fastScore(board, connectivity), full)
      }
    }
  })
})
