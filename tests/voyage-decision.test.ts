import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { RequiredBorderStatus, StrategySuggestion } from '../src/logic/strategySuggestions'
import {
  ABSOLUTE_PLAYABLE_FIT,
  decideVoyage,
  type VoyageDecisionInput,
} from '../src/logic/voyageDecision'

interface CandidateOptions {
  id: string
  name?: string
  fit: number | null
  ready?: boolean
  missing?: string[]
  rankScore?: number
  jackpot?: boolean
  requiredBorderStatus?: RequiredBorderStatus
}

const candidate = ({
  id,
  name = id,
  fit,
  ready = true,
  missing = [],
  rankScore = fit ?? 0,
  jackpot = false,
  requiredBorderStatus = 'not-required',
}: CandidateOptions): StrategySuggestion =>
  ({
    strategy: { id, name },
    fit,
    readiness: {
      ready,
      missing,
    },
    rankScore,
    jackpot,
    requiredBorderStatus,
  }) as StrategySuggestion

const decide = ({
  evaluations,
  activeStrategyId = 'active',
  availableCharts = 25,
  enteredBorders = 12,
  rerollsUsed = 0,
}: Partial<VoyageDecisionInput> & Pick<VoyageDecisionInput, 'evaluations'>) =>
  decideVoyage({
    evaluations,
    activeStrategyId,
    availableCharts,
    enteredBorders,
    rerollsUsed,
  })

describe('Voyage decision regressions', () => {
  it('keeps the absolute playable fit threshold', () => {
    assert.equal(ABSOLUTE_PLAYABLE_FIT, 0.5)
  })

  it('chooses the inventory-ranked strategy over the active strategy', () => {
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
  })

  it('does not play a relative winner without absolute fit', () => {
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
  })

  it('does not play when required library pieces are missing', () => {
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
    assert.equal(decision.preserveRoll, false)
  })

  it('does not preserve a strategy whose required border is absent', () => {
    const decision = decide({
      evaluations: [
        candidate({
          id: 'divine-border-rares',
          name: 'Divine Border Rares',
          fit: 0.01,
          ready: false,
          missing: ['1× Sea-Pillar', 'a "+1 Divine Orb" border roll'],
          rankScore: 100,
          requiredBorderStatus: 'missing',
        }),
        candidate({
          id: 'milky-speedrun',
          name: 'Speedrun Strongboxes',
          fit: 0.08,
          ready: false,
          missing: ['1× additional eligible chart for a full voyage'],
          rankScore: 1,
        }),
      ],
    })

    assert.equal(decision.kind, 'wait')
    assert.equal(decision.strategyId, 'milky-speedrun')
    assert.equal(decision.preserveRoll, false)
  })

  it('rerolls a weak early roll', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2 })],
    })

    assert.equal(decision.kind, 'reroll')
    assert.equal(decision.nextCost, 3_000)
    assert.equal(decision.label, 'REROLL — next costs 3,000 Sulphur')
  })

  it('stops paying for an equally weak late roll', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2 })],
      rerollsUsed: 3,
    })

    assert.equal(decision.kind, 'stop')
    assert.equal(decision.nextCost, 24_000)
    assert.equal(decision.label, "DON'T PAY FOR ANOTHER REROLL")
    assert.match(decision.reason, /not a quality endorsement/)
  })

  it('lets a ready Divine jackpot override incomplete border entry', () => {
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
  })

  it('preserves but does not play an incomplete Divine jackpot', () => {
    const decision = decide({
      evaluations: [
        candidate({
          id: 'divine-border-rares',
          name: 'Divine Border Rares',
          fit: null,
          ready: false,
          missing: ['1× Sea-Pillar'],
          jackpot: true,
          requiredBorderStatus: 'met',
          rankScore: 2_000,
        }),
      ],
      activeStrategyId: 'divine-border-rares',
      enteredBorders: 1,
    })

    assert.equal(decision.kind, 'wait')
    assert.match(decision.label, /Divine Border Rares/)
    assert.doesNotMatch(decision.label, /PLAY/)
    assert.equal(decision.preserveRoll, true)
  })

  it('blocks the final command only on missing border data', () => {
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
  })

  it('recommends the best library strategy when none is active', () => {
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
  })

  it('requires imported inventory before recommending a strategy', () => {
    const decision = decide({
      activeStrategyId: null,
      availableCharts: 0,
      evaluations: [],
    })

    assert.equal(decision.kind, 'needs-data')
    assert.equal(decision.label, 'IMPORT CHARTS')
  })
})
