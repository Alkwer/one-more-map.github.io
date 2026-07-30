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

const options = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
}

const chart = (uid, modIds = []) => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [false, false, false, false],
  modIds,
})

// A single 50% currency border contributes 5 points at weight 10. The best
// known currency tier contributes 10, so the slot-level contextual fit is 50%.
{
  const c = chart('one')
  const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
  const borders = ['b-curr-1', ...Array(11).fill(null)]
  const result = appraiseBorders(board, borders, new Map([[c.uid, c]]), { 'border:curr': 10 }, options)

  assert.equal(result.score, 5)
  assert.equal(result.segments[0].bestModId, 'b-curr-3')
  assert.equal(result.segments[0].bestContribution, 10)
  assert.equal(result.segments[0].fit, 0.5)
  assert.equal(result.status, 'incomplete')
}

// Magnitude borders are appraised through their interaction with the touched
// chart, even though the border itself has no direct ModEffect entries.
{
  const c = chart('magnitude', ['cm-quant-20'])
  const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
  const borders = ['b-mag-1', ...Array(11).fill(null)]
  const result = appraiseBorders(board, borders, new Map([[c.uid, c]]), { 'self:quant': 5 }, options)

  assert.ok(Math.abs(result.segments[0].contribution - 0.4) < 1e-9)
  assert.equal(result.segments[0].bestModId, 'b-mag-3')
  assert.ok(Math.abs(result.segments[0].fit - 0.5) < 1e-9)
}

// A complete board with the middle currency tier in every slot is a 75% fit
// against the known top tier. This is a contextual "strong fit", not roll EV.
{
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
}

// A selected modifier that has no weight is surfaced as needing attention.
{
  const c = chart('zero')
  const board = [{ chartUid: c.uid, rotation: 0 }, ...Array(8).fill(null)]
  const borders = ['b-scarab-1', ...Array(11).fill(null)]
  const result = appraiseBorders(board, borders, new Map([[c.uid, c]]), {}, options)

  assert.equal(result.segments[0].issue, 'unscored')
  assert.equal(result.attentionSegments, 1)
}

console.log('Border appraisal regression: marginal score, fit, magnitude and zero-value cases passed')
