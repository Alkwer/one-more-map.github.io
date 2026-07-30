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
  ABSOLUTE_PLAYABLE_FIT,
  decideVoyage,
} = require('../src/logic/voyageDecision.ts')

const candidate = ({
  id,
  name = id,
  fit,
  ready = true,
  missing = [],
  rankScore = fit ?? 0,
  jackpot = false,
}) => ({
  strategy: { id, name },
  fit,
  readiness: {
    ready,
    missing,
  },
  rankScore,
  jackpot,
})

const decide = ({
  evaluations,
  activeStrategyId = 'active',
  availableCharts = 25,
  enteredBorders = 12,
  rerollsUsed = 0,
}) =>
  decideVoyage({
    evaluations,
    activeStrategyId,
    availableCharts,
    enteredBorders,
    rerollsUsed,
  })

assert.equal(ABSOLUTE_PLAYABLE_FIT, 0.5)

// Inventory rank, not the manually active strategy, chooses the recommendation.
{
  const decision = decide({
    evaluations: [
      candidate({
        id: 'active',
        name: 'Active Strategy',
        fit: 0.9,
        rankScore: 1,
      }),
      candidate({
        id: 'alternative',
        name: 'Best Library Strategy',
        fit: 0.82,
        rankScore: 10,
      }),
    ],
  })

  assert.equal(decision.kind, 'switch')
  assert.equal(decision.strategyId, 'alternative')
  assert.match(decision.label, /^SWITCH TO: Best Library Strategy$/)
  assert.equal(decision.action.strategyId, 'alternative')
  assert.match(decision.reason, /all 25 imported charts/)
}

// Winning the inventory ranking is not enough without absolute roll fit.
{
  const decision = decide({
    activeStrategyId: null,
    evaluations: [
      candidate({
        id: 'relative-winner',
        name: 'Relative Winner',
        fit: 0.25,
        rankScore: 10_000,
      }),
      candidate({ id: 'runner-up', fit: 0.1, rankScore: 1 }),
    ],
  })

  assert.equal(decision.kind, 'reroll')
  assert.doesNotMatch(decision.label, /PLAY|SWITCH/)
}

// Strong roll evidence with missing library pieces must never become PLAY.
{
  const decision = decide({
    evaluations: [
      candidate({
        id: 'missing',
        name: 'Missing Pieces',
        fit: 0.85,
        ready: false,
        missing: ['2× Starfish', '1× Lantern'],
      }),
    ],
  })

  assert.equal(decision.kind, 'wait')
  assert.equal(decision.strategyId, 'missing')
  assert.match(decision.label, /Missing Pieces/)
  assert.deepEqual(decision.missing, ['2× Starfish', '1× Lantern'])
}

// A weak early roll is rerolled while the next attempt is inexpensive.
{
  const decision = decide({
    evaluations: [candidate({ id: 'active', fit: 0.2 })],
  })

  assert.equal(decision.kind, 'reroll')
  assert.equal(decision.nextCost, 3_000)
  assert.equal(decision.label, 'REROLL — next costs 3,000 Sulphur')
}

// An equally weak late roll is not described as good; only the payment stops.
{
  const decision = decide({
    evaluations: [candidate({ id: 'active', fit: 0.2 })],
    rerollsUsed: 3,
  })

  assert.equal(decision.kind, 'stop')
  assert.equal(decision.nextCost, 24_000)
  assert.equal(decision.label, "DON'T PAY FOR ANOTHER REROLL")
  assert.match(decision.reason, /not a quality endorsement/)
}

// A ready Divine jackpot overrides incomplete border entry and selects its strategy.
{
  const decision = decide({
    evaluations: [
      candidate({ id: 'active', fit: null }),
      candidate({
        id: 'divine-border-rares',
        name: 'Divine Border Rares',
        fit: null,
        jackpot: true,
        rankScore: 2_000,
      }),
    ],
    enteredBorders: 1,
  })

  assert.equal(decision.kind, 'switch')
  assert.equal(decision.strategyId, 'divine-border-rares')
  assert.match(decision.reason, /Preserve the roll/)
}

// A Divine jackpot with missing pieces is preserved, but cannot become PLAY.
{
  const decision = decide({
    evaluations: [
      candidate({
        id: 'divine-border-rares',
        name: 'Divine Border Rares',
        fit: null,
        ready: false,
        missing: ['1× Sea-Pillar'],
        jackpot: true,
        rankScore: 2_000,
      }),
    ],
    activeStrategyId: 'divine-border-rares',
    enteredBorders: 1,
  })

  assert.equal(decision.kind, 'wait')
  assert.match(decision.label, /Divine Border Rares/)
  assert.doesNotMatch(decision.label, /PLAY/)
}

// Strategy discovery works before layout; only missing border-roll data blocks
// the final play/reroll command.
{
  const decision = decide({
    evaluations: [
      candidate({
        id: 'library-best',
        name: 'Library Best',
        fit: 0.9,
        rankScore: 10,
      }),
    ],
    activeStrategyId: null,
    enteredBorders: 11,
  })

  assert.equal(decision.kind, 'needs-data')
  assert.equal(decision.label, 'ENTER ALL BORDERS')
  assert.equal(decision.strategyId, 'library-best')
  assert.equal(decision.action.strategyId, 'library-best')
}

// With no active strategy, the best library strategy is still recommended.
{
  const decision = decide({
    activeStrategyId: null,
    evaluations: [
      candidate({
        id: 'curated',
        name: 'Curated Strategy',
        fit: 0.7,
        rankScore: 10,
      }),
    ],
  })

  assert.equal(decision.kind, 'switch')
  assert.equal(decision.strategyName, 'Curated Strategy')
  assert.equal(decision.action.strategyId, 'curated')
}

// No imported inventory means there is no strategy recommendation yet.
{
  const decision = decide({
    activeStrategyId: null,
    availableCharts: 0,
    evaluations: [],
  })

  assert.equal(decision.kind, 'needs-data')
  assert.equal(decision.label, 'IMPORT CHARTS')
}

console.log(
  'Voyage decision regression: inventory ranking, readiness, costs, incomplete roll data and Divine handling passed',
)
