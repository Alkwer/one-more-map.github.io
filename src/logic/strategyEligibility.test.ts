import { describe, expect, it } from 'vitest'
import { strategyById, type StrategyRequirementDef } from '../data/strategies'
import type { ChartAreaType, ChartData, ConnectivityMode } from '../types'
import { emptyBorders } from '../types'
import { planSession } from './sessionPlan'
import { solve } from './solver'
import { selectSolverEligibleCharts } from './chartShapes'
import { chartMatchesRequirement } from './strategyRequirements'
import { strategyReadiness } from './strategySuggestions'

const chart = (
  uid: string,
  modIds: string[] = [],
  overrides: Partial<ChartData> = {},
): ChartData => ({
  uid,
  name: `${uid} Chart`,
  level: 83,
  edges: [true, true, true, true],
  shape: 'Crossing',
  shapeResolved: true,
  modIds,
  ...overrides,
})

describe('shared strategy and solver eligibility', () => {
  it.each([
    ['legacy English name', 'Forgotten Sea-Pillar Chart', undefined, true],
    ['localized canonical area', '해병 고역 산호 암초 해도', 'sea-pillars', true],
    ['localized name without area metadata', '해병 고역 산호 암초 해도', undefined, false],
  ] as const)('matches requirements by %s', (_, name, areaType, expected) => {
    const requirement: StrategyRequirementDef = {
      nameMatch: 'pillar',
      areaTypes: ['sea-pillars'],
      count: 1,
      label: 'Sea-Pillar chart',
    }
    const candidate = chart('candidate', [], {
      name,
      areaType: areaType as ChartAreaType | undefined,
    })

    expect(chartMatchesRequirement(candidate, requirement)).toBe(expected)
  })

  it.each([
    ['strict', false, 8, 1],
    ['any', true, 9, 0],
  ] as const)(
    'keeps planner, readiness, and solver aligned in %s mode',
    (mode, expectedReady, expectedEligible, expectedBlocked) => {
      const strategy = strategyById.get('milky-speedrun')!
      const unresolvedCentre = chart('unresolved-centre', ['adj-opbox-1'], {
        edges: [false, false, false, false],
        shape: undefined,
        shapeResolved: false,
        shapeInput: 'Spiral',
      })
      const pool = [
        unresolvedCentre,
        ...Array.from({ length: 8 }, (_, index) => chart(`filler-${index}`)),
      ]
      const borders = emptyBorders()
      const eligible = selectSolverEligibleCharts(pool, mode as ConnectivityMode)
      const readiness = strategyReadiness(strategy, pool, borders, mode as ConnectivityMode)
      const plan = planSession(pool, borders, undefined, {}, mode as ConnectivityMode)
      const results = solve(pool, borders, strategy.weights, {
        mode: mode as ConnectivityMode,
        allowRotation: true,
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        topK: 1,
        strategyRequirements: strategy.requirements,
        forceHeuristic: true,
        searchRestarts: 2,
        searchIterations: 50,
        seed: 88,
      })

      expect(eligible).toHaveLength(expectedEligible)
      expect(readiness.ready).toBe(expectedReady)
      expect(plan.eligible).toBe(expectedEligible)
      expect(plan.blocked).toBe(expectedBlocked)
      expect(
        plan.entries.some((entry) => entry.strategyId === strategy.id && entry.status === 'ready'),
      ).toBe(expectedReady)
      expect(results.length > 0).toBe(expectedReady)
      if (expectedReady) {
        expect(results[0].board[4]?.chartUid).toBe(unresolvedCentre.uid)
      }
    },
  )
})
