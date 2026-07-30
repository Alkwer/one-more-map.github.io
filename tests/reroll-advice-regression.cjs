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

const {
  adviseReroll,
  clampRerollsUsed,
  REROLL_COSTS,
  sulphurSpentAfter,
} = require('../src/logic/rerollAdvice.ts')
const { decodeShare } = require('../src/logic/storage.ts')

const complete = (overrides = {}) => ({
  fit: 0.25,
  status: 'mixed',
  placedCharts: 9,
  enteredBorders: 12,
  rerollsUsed: 0,
  divineJackpot: false,
  ...overrides,
})

assert.deepEqual(REROLL_COSTS, [3_000, 6_000, 12_000, 24_000, 48_000])
assert.equal(sulphurSpentAfter(3), 21_000)
assert.equal(sulphurSpentAfter(5), 93_000)
assert.equal(clampRerollsUsed(-2), 0)
assert.equal(clampRerollsUsed(9), 5)

// Older shared states did not have the counter; malformed/newer values are
// safely revived into the supported range.
{
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
  assert.equal(decodeShare(encode({})).borderRerollsUsed, 0)
  assert.equal(decodeShare(encode({ borderRerollsUsed: 99 })).borderRerollsUsed, 5)
}

// The contextual heuristic must not issue an ordinary recommendation before
// all 9 charts and 12 borders are present.
{
  const advice = adviseReroll(
    complete({ status: 'incomplete', placedCharts: 8, enteredBorders: 11 }),
  )
  assert.equal(advice.recommendation, 'needs-data')
  assert.equal(advice.nextCost, 3_000)
}

// An explicit Divine roll bypasses incomplete layout data.
{
  const advice = adviseReroll(
    complete({
      fit: null,
      status: 'incomplete',
      placedCharts: 0,
      enteredBorders: 1,
      divineJackpot: true,
    }),
  )
  assert.equal(advice.recommendation, 'keep')
  assert.match(advice.label, /DIVINE JACKPOT/)
}

// A weak early roll is worth reconsidering while the marginal cost is low.
{
  const advice = adviseReroll(complete({ fit: 0.2, status: 'weak' }))
  assert.equal(advice.recommendation, 'reroll')
  assert.equal(advice.keepFitLine, 0.6)
  assert.equal(advice.nextCost, 3_000)
}

// The keep line falls as rerolls become more expensive.
{
  const advice = adviseReroll(
    complete({ fit: 0.55, status: 'strong', rerollsUsed: 1 }),
  )
  assert.equal(advice.recommendation, 'keep')
  assert.equal(advice.keepFitLine, 0.5)
  assert.equal(advice.spent, 3_000)
}

// At 24k+, the conservative heuristic stops chasing a better roll.
{
  const advice = adviseReroll(
    complete({ fit: 0.15, status: 'weak', rerollsUsed: 3 }),
  )
  assert.equal(advice.recommendation, 'stop')
  assert.equal(advice.nextCost, 24_000)
  assert.equal(advice.spent, 21_000)
}

// Five recorded attempts exhaust the assumed cap and total 93k Sulphur.
{
  const advice = adviseReroll(complete({ rerollsUsed: 5 }))
  assert.equal(advice.recommendation, 'stop')
  assert.equal(advice.nextCost, null)
  assert.equal(advice.remainingRerolls, 0)
  assert.equal(advice.spent, 93_000)
}

console.log('Reroll advice regression: costs, thresholds, jackpot and cap cases passed')
