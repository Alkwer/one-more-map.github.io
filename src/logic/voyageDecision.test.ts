import { describe, expect, it } from 'vitest'
import { strategyById } from '../data/strategies'
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

describe('voyage reroll guardrail', () => {
  const weakAlcAndGo = evaluation('alc-and-go')

  it('considers only the 3k and 6k default rerolls', () => {
    expect(decideVoyage(inputFor([weakAlcAndGo], 0)).kind).toBe('reroll')
    expect(decideVoyage(inputFor([weakAlcAndGo], 1)).kind).toBe('reroll')
    expect(decideVoyage(inputFor([weakAlcAndGo], 2)).kind).toBe('stop')
  })

  it('keeps the absolute 50% play line after the cheap rerolls', () => {
    const playable = evaluation('alc-and-go', { fit: 0.5 })

    expect(decideVoyage(inputFor([playable], 2)).kind).toBe('play')
  })
})
