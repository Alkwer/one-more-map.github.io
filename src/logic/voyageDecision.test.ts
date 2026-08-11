import { describe, expect, it } from 'vitest'
import { strategyById } from '../data/strategies'
import type { BorderRollForecast } from './borderRollModel'
import type { StrategySuggestion } from './strategySuggestions'
import { decideVoyage } from './voyageDecision'

function evaluation(
  strategyId: string,
  overrides: Partial<StrategySuggestion> = {},
): StrategySuggestion {
  const strategy = strategyById.get(strategyId)
  if (!strategy) throw new Error(`Missing strategy ${strategyId}`)

  return {
    strategy,
    rankScore: 0.8,
    fit: 0.49,
    jackpot: false,
    divineJackpot: false,
    requiredBorderStatus: 'not-required',
    readiness: {
      ready: true,
      have: 0,
      need: 0,
      ratio: 1,
      missing: [],
      requirements: [],
    },
    ...overrides,
  } as StrategySuggestion
}

const inputFor = (evaluations: StrategySuggestion[], rerollsUsed: number) => ({
  evaluations,
  activeStrategyId: evaluations[0]?.strategy.id ?? null,
  availableCharts: 9,
  enteredBorders: 12,
  rerollsUsed,
})

const forecast = (percentile: number): BorderRollForecast => ({
  modelVersion: 3,
  modelProfile: 'paid-reroll',
  modelConfidence: 'low',
  modelStructure: 'slot-aware',
  sampleCount: 21,
  sequenceCount: 7,
  expectedScore: 10,
  expectedFit: 0.05,
  medianFit: 0.04,
  sixtiethPercentileFit: 0.06,
  currentPercentile: percentile,
  currentPercentileRange: [percentile, percentile],
  chanceNextRollBeatsCurrent: 1 - percentile,
  chanceNextRollBeatsCurrentRange: [1 - percentile, 1 - percentile],
  priorSensitivity: [0.25, 2],
  borrowedNaturalBoardCount: 27,
})

describe('voyage reroll guardrail', () => {
  const weakAlcAndGo = evaluation('alc-and-go', {
    fit: 0.99,
    potentialAppraisal: {
      rollForecast: forecast(0.2),
    } as StrategySuggestion['potentialAppraisal'],
  })

  it('considers only the 3k and 6k default rerolls', () => {
    expect(decideVoyage(inputFor([weakAlcAndGo], 0)).kind).toBe('reroll')
    expect(decideVoyage(inputFor([weakAlcAndGo], 1)).kind).toBe('reroll')
    expect(decideVoyage(inputFor([weakAlcAndGo], 2)).kind).toBe('stop')
  })

  it('uses the achievable-roll percentile instead of the ceiling ratio', () => {
    const playable = evaluation('alc-and-go', {
      fit: 0.01,
      potentialAppraisal: {
        rollForecast: forecast(0.7),
      } as StrategySuggestion['potentialAppraisal'],
    })

    expect(decideVoyage(inputFor([playable], 2)).kind).toBe('play')
  })
})
