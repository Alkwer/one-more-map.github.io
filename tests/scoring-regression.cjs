const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText
  module._compile(output, filename)
}

const { appraiseBorders } = require('../src/logic/borderAppraisal.ts')
const { chartRewardKey, DEFAULT_WEIGHTS } = require('../src/logic/rewards.ts')
const { scoreBoard } = require('../src/logic/scoring.ts')

const options = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
}

const chart = (uid, modIds = [], rewards) => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [false, false, false, false],
  modIds,
  rewards,
})

const boardWith = (...entries) => {
  const board = Array(9).fill(null)
  for (const [tile, entry] of entries) {
    board[tile] = { chartUid: entry.uid, rotation: 0 }
  }
  return board
}

const bordersWith = (segment, modId) => {
  const borders = Array(12).fill(null)
  borders[segment] = modId
  return borders
}

const emptyBorders = () => Array(12).fill(null)
const assertClose = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)

// Imported header rewards are scored as self-scope explicit modifiers and use
// the same reward key as their manually modelled chart-mod equivalent.
{
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

  const appraisal = appraiseBorders(
    board,
    bordersWith(1, 'b-mag-1'),
    charts,
    weights,
    options,
  )
  assert.equal(appraisal.score, 2)
  assert.equal(appraisal.ceiling, 4)
  assert.equal(appraisal.fit, 0.5)
  assert.equal(appraisal.segments[1].contribution, 2)
  assert.equal(appraisal.segments[1].bestModId, 'b-mag-3')
  assert.equal(appraisal.segments[1].bestContribution, 4)
  assert.equal(appraisal.segments[1].fit, 0.5)
}

// Manual self mods remain the fallback for charts without imported rewards.
{
  const c = chart('manual', ['cm-quant-20'])
  const board = boardWith([1, c])
  const charts = new Map([[c.uid, c]])
  const weights = { 'self:quant': 5 }

  assert.equal(scoreBoard(board, emptyBorders(), charts, weights, options).total, 1)
  assertClose(
    scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options).total,
    1.4,
  )
}

// Imported aggregates are authoritative if legacy/manual self ids coexist.
{
  const c = chart(
    'mixed',
    ['cm-quant-20'],
    [{ stat: 'quantity', percent: 100 }],
  )
  const board = boardWith([1, c])
  const charts = new Map([[c.uid, c]])
  const weights = { 'self:quant': 5 }

  assert.equal(scoreBoard(board, emptyBorders(), charts, weights, options).total, 5)
  assert.equal(scoreBoard(board, bordersWith(1, 'b-mag-1'), charts, weights, options).total, 7)
}

// Explicit magnitude must not amplify an adjacent implicit.
{
  const source = chart('adjacent-source', ['adj-star-1'])
  const target = chart('adjacent-target')
  const board = boardWith([1, source], [4, target])
  const charts = new Map([
    [source.uid, source],
    [target.uid, target],
  ])
  const weights = { 'adjacent:star': 10 }

  const base = scoreBoard(board, emptyBorders(), charts, weights, options)
  const withMagnitude = scoreBoard(
    board,
    bordersWith(1, 'b-mag-1'),
    charts,
    weights,
    options,
  )
  assert.equal(base.total, 1.5)
  assert.equal(withMagnitude.total, base.total)
}

// Explicit magnitude must not amplify a Voyage-wide implicit.
{
  const c = chart('global', ['voy-quant-1'])
  const board = boardWith([1, c])
  const charts = new Map([[c.uid, c]])
  const weights = { 'voyage:quant': 10 }

  const base = scoreBoard(board, emptyBorders(), charts, weights, options)
  const withMagnitude = scoreBoard(
    board,
    bordersWith(1, 'b-mag-1'),
    charts,
    weights,
    options,
  )
  assert.equal(base.total, 0.8)
  assert.equal(withMagnitude.total, base.total)
}

console.log(
  'Scoring regression: imported and manual explicit rewards, weighting, magnitude appraisal and implicit isolation passed',
)
