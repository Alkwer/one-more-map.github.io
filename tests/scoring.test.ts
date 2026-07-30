import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { Board, Borders, ChartData, ModEffect } from '../src/types'
import { appraiseBorders } from '../src/logic/borderAppraisal'
import { chartRewardKey, DEFAULT_WEIGHTS } from '../src/logic/rewards'
import { scoreBoard } from '../src/logic/scoring'

const options = {
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
})
