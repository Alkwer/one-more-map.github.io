const assert = require('node:assert/strict')
const fs = require('node:fs')
const { performance } = require('node:perf_hooks')
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

const { DEFAULT_WEIGHTS } = require('../src/logic/rewards.ts')
const { solve } = require('../src/logic/solver.ts')
const {
  evaluateStrategyInventory,
} = require('../src/logic/strategySuggestions.ts')
const { createPerformanceFixture } = require('./performance-fixture.cjs')

const pool = createPerformanceFixture(25)
const charts = new Map(pool.map((chart) => [chart.uid, chart]))
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
]
const commonOptions = {
  mode: 'strict',
  allowRotation: true,
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
}

function signature(value) {
  return JSON.stringify(value)
}

function measure(name, callback) {
  callback()
  const durations = []
  let expected
  for (let run = 0; run < 3; run++) {
    const startedAt = performance.now()
    const result = callback()
    durations.push(performance.now() - startedAt)
    const current = signature(result)
    if (expected === undefined) expected = current
    else assert.equal(current, expected, `${name} changed between seeded runs`)
  }
  durations.sort((a, b) => a - b)
  console.log(
    `${name}: median ${durations[1].toFixed(1)} ms ` +
      `(runs: ${durations.map((duration) => duration.toFixed(1)).join(', ')} ms)`,
  )
}

console.log(`Deterministic performance fixture: ${pool.length} charts`)

measure('Strategy inventory', () =>
  evaluateStrategyInventory(borders, charts, pool, commonOptions),
)

measure('Interactive solve', () =>
  solve(pool, borders, DEFAULT_WEIGHTS, {
    ...commonOptions,
    topK: 5,
    seed: 0x15c0ffee,
  }),
)
