import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { StrategyRecommendationTier } from '../src/data/strategies'
import type { RequiredBorderStatus, StrategySuggestion } from '../src/logic/strategySuggestions'
import type { BorderRollForecast } from '../src/logic/borderRollModel'
import { decideVoyage, type VoyageDecisionInput } from '../src/logic/voyageDecision'

interface CandidateOptions {
  id: string
  name?: string
  fit: number | null
  ready?: boolean
  missing?: string[]
  rankScore?: number
  jackpot?: boolean
  requiredBorderStatus?: RequiredBorderStatus
  rollForecast?: BorderRollForecast
  recommendationTier?: StrategyRecommendationTier
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
  rollForecast,
  recommendationTier = 'specialized',
}: CandidateOptions): StrategySuggestion =>
  ({
    strategy: { id, name, recommendationTier },
    fit,
    readiness: {
      ready,
      missing,
    },
    rankScore,
    jackpot,
    requiredBorderStatus,
    potentialAppraisal: rollForecast ? { rollForecast } : undefined,
  }) as StrategySuggestion

const forecast = (
  currentPercentile: number,
  chanceNextRollBeatsCurrent: number,
  modelConfidence: BorderRollForecast['modelConfidence'] = 'low',
): BorderRollForecast => ({
  modelVersion: 3,
  modelProfile: 'paid-reroll',
  modelConfidence,
  modelStructure: 'slot-aware',
  sampleCount: 21,
  sequenceCount: 7,
  expectedScore: 10,
  expectedFit: 0.2,
  medianFit: 0.18,
  sixtiethPercentileFit: 0.22,
  currentPercentile,
  currentPercentileRange: [currentPercentile, currentPercentile],
  chanceNextRollBeatsCurrent,
  chanceNextRollBeatsCurrentRange: [chanceNextRollBeatsCurrent, chanceNextRollBeatsCurrent],
  priorSensitivity: [0.25, 2],
  borrowedNaturalBoardCount: 27,
})

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
    assert.match(decision.label, /^SWITCH FOR NOW TO: Best Library Strategy$/)
    assert.ok(decision.action)
    assert.equal(decision.action.strategyId, 'alternative')
    assert.match(decision.reason, /all 25 imported charts/)
  })

  it('prefers a fitting specialized strategy over a higher-scoring Alc & Go board', () => {
    const decision = decide({
      activeStrategyId: null,
      evaluations: [
        candidate({
          id: 'alc-and-go',
          name: 'Alc & Go',
          fit: 0.9,
          rankScore: 100,
          recommendationTier: 'fallback',
        }),
        candidate({
          id: 'milky-speedrun',
          name: 'Speedrun Strongboxes',
          fit: 0.75,
          rankScore: 1,
          recommendationTier: 'specialized',
        }),
      ],
    })

    assert.equal(decision.kind, 'switch')
    assert.equal(decision.strategyId, 'milky-speedrun')
  })

  it('prefers Alc & Go when its modeled roll is strong and the specialization is weak', () => {
    const decision = decide({
      activeStrategyId: null,
      evaluations: [
        candidate({
          id: 'milky-speedrun',
          name: 'Speedrun Strongboxes',
          fit: 0.3,
          rankScore: 100,
          recommendationTier: 'specialized',
          rollForecast: forecast(0.2, 0.8),
        }),
        candidate({
          id: 'alc-and-go',
          name: 'Alc & Go',
          fit: 0.7,
          rankScore: 1,
          recommendationTier: 'fallback',
          rollForecast: forecast(0.75, 0.2),
        }),
      ],
    })

    assert.equal(decision.kind, 'switch')
    assert.equal(decision.strategyId, 'alc-and-go')
    assert.equal(decision.label, 'SWITCH TO FALLBACK: Alc & Go')
    assert.match(decision.reason, /it is not the only runnable strategy/)
    assert.match(
      decision.reason,
      /Speedrun Strongboxes is also runnable and is the strongest specialized alternative at the modeled 20th percentile/,
    )
  })

  it('keeps a specialization ahead when both candidates clear the percentile line', () => {
    const decision = decide({
      activeStrategyId: 'alc-and-go',
      evaluations: [
        candidate({
          id: 'anchorfield-fishing',
          name: 'Anchorfield Fishing',
          fit: 0.35,
          rankScore: 0.68,
          recommendationTier: 'specialized',
          rollForecast: forecast(0.8, 0.15),
        }),
        candidate({
          id: 'alc-and-go',
          name: 'Alc & Go',
          fit: 0.36,
          rankScore: 0.56,
          recommendationTier: 'fallback',
          rollForecast: forecast(1, 0),
        }),
      ],
    })

    assert.equal(decision.kind, 'switch')
    assert.equal(decision.strategyId, 'anchorfield-fishing')
    assert.equal(decision.recommendationTier, 'specialized')
    assert.match(decision.label, /SWITCH TO/)
  })

  it('can promote Alc & Go from a high modeled percentile despite a low ceiling ratio', () => {
    const decision = decide({
      activeStrategyId: 'alc-and-go',
      evaluations: [
        candidate({
          id: 'alc-and-go',
          name: 'Alc & Go',
          fit: 0.36,
          recommendationTier: 'fallback',
          rollForecast: forecast(1, 0),
        }),
      ],
    })

    assert.equal(decision.kind, 'play')
    assert.equal(decision.strategyId, 'alc-and-go')
    assert.equal(decision.label, 'PLAY FALLBACK: Alc & Go')
    assert.equal(decision.decisionBasis, 'modeled-percentile')
    assert.match(decision.reason, /theoretical-ceiling ratio is diagnostic only/)
  })

  it('keeps a weak ready specialization ahead of a weak fallback', () => {
    const decision = decide({
      activeStrategyId: null,
      evaluations: [
        candidate({
          id: 'milky-speedrun',
          name: 'Speedrun Strongboxes',
          fit: 0.3,
          rankScore: 100,
          recommendationTier: 'specialized',
        }),
        candidate({
          id: 'alc-and-go',
          name: 'Alc & Go',
          fit: 0.2,
          rankScore: 1,
          recommendationTier: 'fallback',
        }),
      ],
    })

    assert.equal(decision.kind, 'switch')
    assert.equal(decision.strategyId, 'milky-speedrun')
    assert.equal(decision.recommendationTier, 'specialized')
    assert.match(decision.label, /SWITCH FOR NOW TO/)
  })

  it('does not use an absolute ceiling ratio as a play gate', () => {
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

    assert.equal(decision.kind, 'switch')
    assert.match(decision.label, /SWITCH FOR NOW TO/)
    assert.equal(decision.decisionBasis, 'insufficient-data')
    assert.match(decision.reason, /theoretical-ceiling ratio is not used to justify spending/)
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

  it('requires a found layout even if a stale readiness flag says ready', () => {
    const inconclusive = candidate({
      id: 'active',
      name: 'Inconclusive Strategy',
      fit: 0.9,
      ready: true,
      rollForecast: forecast(0.8, 0.1),
    })
    inconclusive.layoutStatus = 'unknown'

    const decision = decide({ evaluations: [inconclusive] })

    assert.equal(decision.kind, 'wait')
    assert.equal(decision.decisionBasis, 'layout-uncertainty')
    assert.doesNotMatch(decision.label, /PLAY|SWITCH/)
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
      evaluations: [candidate({ id: 'active', fit: 0.2, rollForecast: forecast(0.2, 0.7) })],
    })

    assert.equal(decision.kind, 'reroll')
    assert.equal(decision.nextCost, 3_000)
    assert.equal(decision.label, 'CONSIDER REROLL — next costs 3,000 Sulphur')
  })

  it('keeps an all-ties roll when no paid reroll can score strictly higher', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 1, rollForecast: forecast(0.5, 0) })],
    })

    assert.equal(decision.kind, 'stop')
    assert.equal(decision.decisionBasis, 'no-modeled-upside')
    assert.equal(decision.label, 'KEEP — NO PAID REROLL CAN IMPROVE THIS BOARD')
    assert.match(decision.reason, /0% chance that a paid reroll scores strictly higher/)
    assert.match(decision.reason, /Ties do not justify spending Sulphur/)
  })

  it('keeps a maximum roll with enough tie mass to remain below the keep line', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 1, rollForecast: forecast(0.55, 0) })],
    })

    assert.equal(decision.kind, 'stop')
    assert.equal(decision.decisionBasis, 'no-modeled-upside')
  })

  it('does not describe a small positive reroll chance as zero percent', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2, rollForecast: forecast(0.2, 0.004) })],
    })

    assert.equal(decision.kind, 'reroll')
    assert.match(decision.reason, /<1% chance/)
    assert.doesNotMatch(decision.reason, /0% chance/)
  })

  it('keeps a low-confidence roll when every tested prior clears the percentile line', () => {
    const decision = decide({
      evaluations: [
        candidate({
          id: 'active',
          fit: 0.2,
          rollForecast: forecast(0.8, 0.15),
        }),
      ],
    })

    assert.equal(decision.kind, 'play')
    assert.equal(decision.rollForecast?.currentPercentile, 0.8)
    assert.equal(decision.decisionBasis, 'modeled-percentile')
    assert.match(decision.reason, /full 80–80 percentile prior range meets the 60th percentile/)
  })

  it('allows a medium-confidence model keep only when the prior range clears the line', () => {
    const robust = forecast(0.8, 0.15, 'medium')
    robust.currentPercentileRange = [0.65, 0.84]
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2, rollForecast: robust })],
    })

    assert.equal(decision.kind, 'play')
    assert.equal(decision.decisionBasis, 'modeled-percentile')
    assert.match(decision.reason, /full 65–84 percentile prior range meets/)
  })

  it('keeps for now when the prior range crosses the model line', () => {
    const fragile = forecast(0.8, 0.15, 'medium')
    fragile.currentPercentileRange = [0.55, 0.84]
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2, rollForecast: fragile })],
    })

    assert.equal(decision.kind, 'play')
    assert.equal(decision.decisionBasis, 'model-uncertainty')
    assert.equal(decision.label, 'PLAY FOR NOW: active')
    assert.match(decision.reason, /no robust signal to spend Sulphur/)
  })

  it('explains the modeled upside when recommending an early reroll', () => {
    const decision = decide({
      evaluations: [
        candidate({
          id: 'active',
          fit: 0.2,
          rollForecast: forecast(0.2, 0.7),
        }),
      ],
    })

    assert.equal(decision.kind, 'reroll')
    assert.match(decision.reason, /70% chance that a paid reroll scores higher/)
    assert.match(decision.reason, /low confidence/)
  })

  it('stops paying for an equally weak late roll', () => {
    const decision = decide({
      evaluations: [candidate({ id: 'active', fit: 0.2, rollForecast: forecast(0.2, 0.7) })],
      rerollsUsed: 3,
    })

    assert.equal(decision.kind, 'stop')
    assert.equal(decision.nextCost, 24_000)
    assert.equal(decision.label, 'STOP REROLLING — KEEP THE CURRENT BOARD')
    assert.match(decision.reason, /Sulphur guardrail wins/)
    assert.match(decision.reason, /theoretical-ceiling ratio is diagnostic only/)
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
    assert.ok(decision.action)
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
    assert.ok(decision.action)
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
