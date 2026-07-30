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

const { suggestStrategies } = require('../src/logic/strategySuggestions.ts')

const options = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
  mode: 'any',
  allowRotation: false,
}

const chart = (uid, modIds = [], name = `Chart ${uid}`) => ({
  uid,
  name,
  level: 83,
  edges: [false, false, false, false],
  modIds,
})

const emptyBoard = () => Array(9).fill(null)
const emptyBorders = () => Array(12).fill(null)

// The Divine roll is an explicit jackpot and must outrank generic strategies
// even before the player places charts on the board.
{
  const borders = emptyBorders()
  borders[0] = 'b-divine'
  const result = suggestStrategies(emptyBoard(), borders, new Map(), [], options)

  assert.equal(result.suggestions[0].strategy.id, 'divine-border-rares')
  assert.equal(result.suggestions[0].jackpot, true)
  assert.equal(result.suggestions[0].confidence, 'high')
  assert.equal(result.suggestions[0].matchingBorders, 1)
}

// "Cannot drop Equipment" is the Meatfish library jackpot and remains useful
// evidence even when no border roll has been entered yet.
{
  const keeper = chart('keeper', ['voy-noequip'])
  const result = suggestStrategies(
    emptyBoard(),
    emptyBorders(),
    new Map([[keeper.uid, keeper]]),
    [keeper],
    options,
  )

  assert.equal(result.hasEvidence, true)
  assert.equal(result.suggestions[0].strategy.id, 'milky-meatfish')
  assert.equal(result.suggestions[0].jackpot, true)
  assert.ok(
    result.suggestions[0].reasons.some((reason) =>
      /cannot drop Equipment/.test(reason),
    ),
  )
}

// A Magic-monster border gives the Ethereal strategy a direct signal even
// before a layout exists, proving the ranking is based on the roll itself.
{
  const borders = emptyBorders()
  borders[4] = 'b-minmagic'
  const result = suggestStrategies(emptyBoard(), borders, new Map(), [], options)

  assert.equal(result.suggestions[0].strategy.id, 'milky-ethereal')
  assert.equal(result.suggestions[0].matchingBorders, 1)
  assert.ok(result.suggestions[0].borderScore > 0)
}

// With no roll, layout, or jackpot piece, the UI should ask for evidence
// instead of presenting an arbitrary recommendation as meaningful.
{
  const result = suggestStrategies(emptyBoard(), emptyBorders(), new Map(), [], options)
  assert.equal(result.hasEvidence, false)
}

// Strategy discovery must use every imported chart, not only charts already
// arranged on the manual board. Replacing the whole board with junk changes
// only current-board diagnostics, never the library ranking or best-found fit.
{
  const pieces = [
    chart('star-1', ['adj-star-1']),
    chart('star-2', ['adj-star-2']),
    chart('pantheon', ['adj-pantheon']),
    chart('pillar-1', [], 'Sea-Pillar Alpha'),
    chart('pillar-2', [], 'Sea-Pillar Beta'),
    chart('lantern-1', ['adj-lantern']),
    chart('lantern-2', ['adj-lantern']),
    chart('possess', ['voy-possess']),
    chart('no-equipment', ['voy-noequip']),
  ]
  const junk = Array.from({ length: 9 }, (_, index) =>
    chart(`junk-${index}`),
  )
  const pool = [...pieces, ...junk]
  const charts = new Map(pool.map((entry) => [entry.uid, entry]))
  const borders = Array(12).fill('b-mag-3')
  const pieceBoard = pieces.map((entry) => ({
    chartUid: entry.uid,
    rotation: 0,
  }))
  const junkBoard = junk.map((entry) => ({
    chartUid: entry.uid,
    rotation: 0,
  }))

  const withPiecesPlaced = suggestStrategies(
    pieceBoard,
    borders,
    charts,
    pool,
    options,
  )
  const withPiecesUnplaced = suggestStrategies(
    junkBoard,
    borders,
    charts,
    pool,
    options,
  )

  assert.equal(
    withPiecesUnplaced.suggestions[0].strategy.id,
    'milky-meatfish',
  )
  assert.deepEqual(
    withPiecesPlaced.evaluations.map((entry) => entry.strategy.id),
    withPiecesUnplaced.evaluations.map((entry) => entry.strategy.id),
  )
  assert.deepEqual(
    withPiecesPlaced.evaluations.map((entry) => entry.rankScore),
    withPiecesUnplaced.evaluations.map((entry) => entry.rankScore),
  )
  assert.deepEqual(
    withPiecesPlaced.evaluations.map((entry) => entry.fit),
    withPiecesUnplaced.evaluations.map((entry) => entry.fit),
  )
  assert.notEqual(
    withPiecesPlaced.suggestions[0].currentFit,
    withPiecesUnplaced.suggestions[0].currentFit,
  )
}

console.log(
  'Strategy suggestions regression: jackpots, inventory ranking, roll affinity and board independence passed',
)
