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
  assert.match(result.suggestions[0].reasons[0], /cannot drop Equipment/)
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

console.log('Strategy suggestions regression: jackpots, roll affinity and empty state passed')
