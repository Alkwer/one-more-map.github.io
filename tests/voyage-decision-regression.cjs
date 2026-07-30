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
  STRATEGY_SWITCH_DELTA,
  decideVoyage,
} = require('../src/logic/voyageDecision.ts')

const appraisal = ({
  fit = 0.2,
  placedCharts = 9,
  enteredBorders = 12,
} = {}) => ({
  fit,
  placedCharts,
  enteredBorders,
})

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
  activeFit = 0.2,
  rerollsUsed = 0,
  placedCharts = 9,
  enteredBorders = 12,
}) =>
  decideVoyage({
    evaluations,
    activeStrategyId,
    activeAppraisal: appraisal({
      fit: activeFit,
      placedCharts,
      enteredBorders,
    }),
    rerollsUsed,
  })

assert.equal(ABSOLUTE_PLAYABLE_FIT, 0.5)
assert.equal(STRATEGY_SWITCH_DELTA, 0.1)

// A weak active strategy cannot hide a ready, strong alternative.
{
  const decision = decide({
    evaluations: [
      candidate({ id: 'active', name: 'Active Strategy', fit: 0.2 }),
      candidate({ id: 'alternative', name: 'Ready Alternative', fit: 0.82 }),
    ],
  })

  assert.equal(decision.kind, 'switch')
  assert.equal(decision.strategyId, 'alternative')
  assert.match(decision.label, /^SWITCH TO: Ready Alternative$/)
  assert.equal(decision.action.strategyId, 'alternative')
}

// Winning the relative ranking is not enough without absolute compatibility.
{
  const decision = decide({
    activeStrategyId: null,
    activeFit: 0.1,
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

// Strong roll evidence with missing required pieces must never become PLAY.
{
  const decision = decide({
    evaluations: [
      candidate({ id: 'active', fit: 0.15 }),
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

// A ready Divine jackpot overrides incomplete board data and selects its strategy.
{
  const decision = decide({
    evaluations: [
      candidate({ id: 'active', fit: null }),
      candidate({
        id: 'divine-border-rares',
        name: 'Divine Border Rares',
        fit: null,
        jackpot: true,
      }),
    ],
    activeFit: null,
    placedCharts: 0,
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
      }),
    ],
    activeStrategyId: 'divine-border-rares',
    activeFit: null,
    placedCharts: 0,
    enteredBorders: 1,
  })

  assert.equal(decision.kind, 'wait')
  assert.match(decision.label, /Divine Border Rares/)
  assert.doesNotMatch(decision.label, /PLAY/)
}

// Without a jackpot, incomplete data cannot produce a play/reroll command.
{
  const decision = decide({
    evaluations: [candidate({ id: 'active', fit: 0.9 })],
    activeFit: 0.9,
    placedCharts: 8,
    enteredBorders: 11,
  })

  assert.equal(decision.kind, 'needs-data')
  assert.equal(decision.label, 'COMPLETE THE BOARD')
}

// A small relative improvement does not churn the active strategy.
{
  const decision = decide({
    evaluations: [
      candidate({ id: 'active', name: 'Active Strategy', fit: 0.7 }),
      candidate({ id: 'alternative', fit: 0.75 }),
    ],
    activeFit: 0.7,
  })

  assert.equal(decision.kind, 'play')
  assert.equal(decision.strategyId, 'active')
}

// Manual weights remain a named, valid active context.
{
  const decision = decide({
    activeStrategyId: null,
    activeFit: 0.7,
    evaluations: [candidate({ id: 'curated', fit: 0.65 })],
  })

  assert.equal(decision.kind, 'play')
  assert.equal(decision.strategyName, 'Manual weights')
  assert.equal(decision.label, 'PLAY: Manual weights')
}

console.log(
  'Voyage decision regression: readiness, alternatives, costs, incomplete data and Divine handling passed',
)
