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
  clampRerollsUsed,
  KEEP_FIT_LINES,
  REROLL_COSTS,
  sulphurSpentAfter,
} = require('../src/logic/rerollAdvice.ts')
const { decodeShare } = require('../src/logic/storage.ts')

assert.deepEqual(REROLL_COSTS, [3_000, 6_000, 12_000, 24_000, 48_000])
assert.deepEqual(KEEP_FIT_LINES, [0.6, 0.5, 0.4, 0.3, 0.2])
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

console.log('Reroll cost regression: costs, thresholds, clamping and persistence passed')
