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

const { checkConnectivity } = require('../src/logic/connectivity.ts')
const { solve } = require('../src/logic/solver.ts')
const {
  evaluateStrategyInventory,
} = require('../src/logic/strategySuggestions.ts')

const chart = (uid, edges) => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges,
  modIds: [],
})

const boardFor = (charts) =>
  charts.map((entry) => ({ chartUid: entry.uid, rotation: 0 }))

const emptyBorders = () => Array(12).fill(null)

// The game accepts three separately matched Straight lanes, but only the lane
// containing the bottom-left start can be explored.
const verticals = Array.from({ length: 9 }, (_, index) =>
  chart(`straight-${index}`, [true, false, true, false]),
)
const verticalBoard = boardFor(verticals)
const verticalMap = new Map(verticals.map((entry) => [entry.uid, entry]))

{
  const result = checkConnectivity(verticalBoard, verticalMap, 'strict')
  assert.equal(result.launchable, true)
  assert.equal(result.fullyReachable, false)
  assert.equal(result.valid, false)
  assert.equal(result.mismatches, 0)
  assert.equal(result.unfilled, 0)
  assert.equal(result.unreachable, 6)
  assert.equal(result.connections, 6)
  assert.equal(result.violations, 6)
}

// Experiment mode may ignore the safety rule, but the structural diagnostics
// remain available to the UI.
{
  const result = checkConnectivity(verticalBoard, verticalMap, 'any')
  assert.equal(result.valid, true)
  assert.equal(result.launchable, true)
  assert.equal(result.fullyReachable, false)
  assert.equal(result.unreachable, 6)
  assert.equal(result.violations, 0)
}

// A fully matched connected board is both launchable and fully reachable.
{
  const crosses = Array.from({ length: 9 }, (_, index) =>
    chart(`cross-${index}`, [true, true, true, true]),
  )
  const result = checkConnectivity(
    boardFor(crosses),
    new Map(crosses.map((entry) => [entry.uid, entry])),
    'strict',
  )
  assert.equal(result.launchable, true)
  assert.equal(result.fullyReachable, true)
  assert.equal(result.valid, true)
  assert.equal(result.unreachable, 0)
  assert.equal(result.connections, 12)
}

// A shared-edge mismatch prevents launch.
{
  const charts = Array.from({ length: 9 }, (_, index) =>
    chart(`mismatch-${index}`, [false, false, false, false]),
  )
  charts[0].edges = [false, true, false, false]
  const result = checkConnectivity(
    boardFor(charts),
    new Map(charts.map((entry) => [entry.uid, entry])),
    'strict',
  )
  assert.equal(result.mismatches, 1)
  assert.equal(result.launchable, false)
  assert.equal(result.fullyReachable, false)
  assert.equal(result.valid, false)
}

// A Voyage still requires all nine slots even when every placed edge matches.
{
  const crosses = Array.from({ length: 8 }, (_, index) =>
    chart(`partial-${index}`, [true, true, true, true]),
  )
  const board = [...boardFor(crosses), null]
  const result = checkConnectivity(
    board,
    new Map(crosses.map((entry) => [entry.uid, entry])),
    'strict',
  )
  assert.equal(result.unfilled, 1)
  assert.equal(result.launchable, false)
  assert.equal(result.fullyReachable, false)
  assert.equal(result.valid, false)
}

// The strict solver must not promote a merely launchable board as runnable.
{
  const [result] = solve(verticals, emptyBorders(), {}, {
    mode: 'strict',
    allowRotation: false,
    adjacencyMode: 'physical',
    adjacentAffectsSelf: false,
    disabledMods: new Set(),
    topK: 1,
    forceHeuristic: true,
    searchRestarts: 1,
    searchIterations: 0,
    seed: 12,
  })
  assert.equal(result.launchable, true)
  assert.equal(result.fullyReachable, false)
  assert.equal(result.valid, false)
}

// Strategy readiness and therefore Voyage recommendations retain the safe
// full-reachability requirement.
{
  const inventory = evaluateStrategyInventory(
    emptyBorders(),
    verticalMap,
    verticals,
    {
      mode: 'strict',
      allowRotation: false,
      adjacencyMode: 'physical',
      adjacentAffectsSelf: false,
      disabledMods: new Set(),
    },
  )
  const alcAndGo = inventory.evaluations.find(
    (entry) => entry.strategy.id === 'alc-and-go',
  )
  assert.ok(alcAndGo)
  assert.equal(alcAndGo.potentialLaunchable, true)
  assert.equal(alcAndGo.potentialFullyReachable, false)
  assert.equal(alcAndGo.readiness.ready, false)
  assert.ok(
    alcAndGo.readiness.missing.some((entry) =>
      /fully reachable connector layout/.test(entry),
    ),
  )
}

console.log(
  'Connectivity regression: launchability, reachability, solver safety and strategy readiness passed',
)
