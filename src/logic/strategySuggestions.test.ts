import { describe, expect, it } from 'vitest'
import { strategyById } from '../data/strategies'
import type { Borders, ChartAreaType, ChartData } from '../types'
import { emptyBorders } from '../types'
import { decideVoyage } from './voyageDecision'
import { evaluateStrategyInventory, strategyReadiness } from './strategySuggestions'

const crossing = (uid: string, modIds: string[], areaType?: ChartAreaType): ChartData => ({
  uid,
  name: `${uid} Chart`,
  level: 83,
  edges: [true, true, true, true],
  shape: 'Crossing',
  shapeResolved: true,
  modIds,
  areaType,
})

const divineBorders = (segment: number): Borders => {
  const borders = emptyBorders()
  borders[segment] = 'b-divine'
  return borders
}

const options = {
  mode: 'strict' as const,
  allowRotation: true,
  adjacencyMode: 'physical' as const,
  adjacentAffectsSelf: false,
}

describe('border-aware strategy readiness', () => {
  const strategy = strategyById.get('cutedog-divine-boxes')!
  const pool = [
    crossing('pelagic', [], 'pelagic-abyss'),
    crossing('box-1', ['adj-box-3']),
    crossing('box-2', ['adj-opbox-2']),
    ...Array.from({ length: 6 }, (_, index) => crossing(`rares-${index + 1}`, ['voy-rare'])),
  ]

  it('requires two feeders and six global rare charts for a corner Divine tile', () => {
    const readiness = strategyReadiness(strategy, pool, divineBorders(0))

    expect(readiness.ready).toBe(true)
    expect(readiness.requirements.find((entry) => entry.label.startsWith('Strongbox'))?.need).toBe(
      2,
    )
    expect(readiness.requirements.find((entry) => entry.label.startsWith('Increased'))?.need).toBe(
      6,
    )
  })

  it('requires three feeders and five global rare charts for a middle-edge Divine tile', () => {
    const readiness = strategyReadiness(strategy, pool, divineBorders(1))

    expect(readiness.ready).toBe(false)
    expect(readiness.requirements.find((entry) => entry.label.startsWith('Strongbox'))?.need).toBe(
      3,
    )
    expect(readiness.requirements.find((entry) => entry.label.startsWith('Increased'))?.need).toBe(
      5,
    )
    expect(readiness.missing).toContain('1× Strongbox adjacent chart (any type)')
  })

  it('treats an Arcanist chart as a valid Speedrun centre piece', () => {
    const speedrun = strategyById.get('milky-speedrun')!
    const readiness = strategyReadiness(
      speedrun,
      [crossing('arcanist', ['adj-arcbox-2'])],
      emptyBorders(),
    )

    expect(readiness.ready).toBe(true)
  })
})

describe('Divine strategy selection', () => {
  it('selects the ready Strongbox variant instead of waiting for the Rares variant', () => {
    const pool = [
      crossing('pelagic', [], 'pelagic-abyss'),
      crossing('box-1', ['adj-box-3']),
      crossing('box-2', ['adj-opbox-2']),
      ...Array.from({ length: 6 }, (_, index) => crossing(`rares-${index + 1}`, ['voy-rare'])),
    ]
    const borders = divineBorders(0)
    const charts = new Map(pool.map((chart) => [chart.uid, chart]))
    const inventory = evaluateStrategyInventory(borders, charts, pool, options)
    const strongboxes = inventory.evaluations.find(
      (entry) => entry.strategy.id === 'cutedog-divine-boxes',
    )!
    const rares = inventory.evaluations.find(
      (entry) => entry.strategy.id === 'divine-border-rares',
    )!

    expect(strongboxes.readiness.ready).toBe(true)
    expect(strongboxes.divineJackpot).toBe(true)
    expect(rares.readiness.ready).toBe(false)

    const decision = decideVoyage({
      evaluations: inventory.evaluations.map((entry) => ({
        ...entry,
        appraisal: entry.potentialAppraisal,
        currentFit: entry.fit,
        currentStatus: entry.status,
      })),
      activeStrategyId: null,
      availableCharts: pool.length,
      enteredBorders: 1,
      rerollsUsed: 0,
    })

    expect(decision.kind).toBe('switch')
    expect(decision.strategyId).toBe('cutedog-divine-boxes')
    expect(decision.preserveRoll).toBe(true)
  })
})

describe('strategy reservation preferences', () => {
  it('keeps automatic strategy evaluation aligned with the interactive solve pool', () => {
    const pool = [
      crossing('reserved-rare', ['voy-rare']),
      ...Array.from({ length: 8 }, (_, index) => crossing(`ordinary-${index + 1}`, [])),
    ]
    const borders = emptyBorders()
    const charts = new Map(pool.map((chart) => [chart.uid, chart]))
    const protectedInventory = evaluateStrategyInventory(borders, charts, pool, options)
    const unprotectedInventory = evaluateStrategyInventory(borders, charts, pool, {
      ...options,
      strategyReservations: { divine: false, meatfish: false, ethereal: true },
    })

    expect(
      protectedInventory.evaluations.find((entry) => entry.strategy.id === 'alc-and-go')
        ?.eligibleCharts,
    ).toBe(8)
    expect(
      unprotectedInventory.evaluations.find((entry) => entry.strategy.id === 'alc-and-go')
        ?.eligibleCharts,
    ).toBe(9)
  })
})
