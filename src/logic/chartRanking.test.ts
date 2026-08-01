import { describe, expect, it } from 'vitest'
import type { ChartData, Weights } from '../types'
import { chartRewardKey, voyageRewardKey } from './rewards'
import { voyageModById } from '../data/mods'
import { chartValue, displayChartValue } from './chartRanking'

const chart = (overrides: Partial<ChartData> = {}): ChartData => ({
  uid: 'chart-1',
  name: 'Chart One',
  level: 83,
  edges: [true, true, true, true],
  modIds: [],
  shape: 'Crossing',
  shapeResolved: true,
  ...overrides,
})

const weightForMod = (id: string, value: number): Weights => {
  const mod = voyageModById.get(id)
  if (!mod) throw new Error(`Missing test modifier ${id}`)
  return { [voyageRewardKey(mod)]: value }
}

describe('chart ranking', () => {
  it('scales self, adjacent, and voyage-wide modifiers by their reach', () => {
    expect(
      chartValue(chart({ modIds: ['cm-quant-20'] }), weightForMod('cm-quant-20', 2), new Set()),
    ).toBe(40)
    expect(
      chartValue(chart({ modIds: ['adj-ess-1'] }), weightForMod('adj-ess-1', 2), new Set()),
    ).toBe(90)
    expect(
      chartValue(chart({ modIds: ['voy-quant-1'] }), weightForMod('voy-quant-1', 2), new Set()),
    ).toBe(144)
  })

  it('uses imported rewards instead of counting matching self modifiers twice', () => {
    const weights = {
      ...weightForMod('cm-quant-20', 2),
      [chartRewardKey('quantity')]: 3,
    }
    const value = chartValue(
      chart({
        modIds: ['cm-quant-20'],
        rewards: [{ stat: 'quantity', percent: 20 }],
      }),
      weights,
      new Set(),
    )

    expect(value).toBe(60)
  })

  it('ignores disabled modifiers and preserves the compact display scale', () => {
    const rankedChart = chart({ modIds: ['adj-ess-1'] })
    const weights = weightForMod('adj-ess-1', 2)

    expect(chartValue(rankedChart, weights, new Set(['adj-ess-1']))).toBe(0)
    expect(displayChartValue(rankedChart, weights, new Set())).toBe(1)
  })
})
