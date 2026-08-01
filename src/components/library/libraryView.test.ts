import { describe, expect, it } from 'vitest'
import { voyageModById } from '../../data/mods'
import { voyageRewardKey } from '../../logic/rewards'
import type { ChartData, Weights } from '../../types'
import { selectVisibleCharts, type LibrarySortMode } from './libraryView'

const chart = (uid: string, name: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name,
  level: 80,
  edges: [true, true, true, true],
  modIds: [],
  shape: 'Crossing',
  shapeResolved: true,
  ...overrides,
})

const select = (
  pool: ChartData[],
  query: string,
  sort: LibrarySortMode,
  weights: Weights = {},
  disabledMods: ReadonlySet<string> = new Set(),
) => selectVisibleCharts({ pool, query, sort, weights, disabledMods })

describe('chart library view', () => {
  it('filters case-insensitively by chart name or known modifier text', () => {
    const pool = [
      chart('reef', 'Armoured Coral Reef'),
      chart('prison', 'Forgotten Cove', { modIds: ['adj-ess-1'] }),
      chart('unknown', 'Silent Atoll', { modIds: ['unknown-modifier'] }),
    ]

    expect(select(pool, ' CORAL ', 'name').map(({ uid }) => uid)).toEqual(['reef'])
    expect(select(pool, 'imprisoned monsters', 'name').map(({ uid }) => uid)).toEqual(['prison'])
  })

  it('sorts by level, name, or weighted value without mutating the pool', () => {
    const valuableModifier = voyageModById.get('adj-ess-1')
    if (!valuableModifier) throw new Error('Missing adjacent modifier fixture')
    const pool = [
      chart('high', 'Zulu', { level: 90 }),
      chart('valuable', 'Mike', { level: 70, modIds: ['adj-ess-1'] }),
      chart('alpha', 'Alpha', { level: 80 }),
    ]
    const originalOrder = pool.map(({ uid }) => uid)
    const weights = { [voyageRewardKey(valuableModifier)]: 2 }

    expect(select(pool, '', 'level').map(({ uid }) => uid)).toEqual(['high', 'alpha', 'valuable'])
    expect(select(pool, '', 'name').map(({ uid }) => uid)).toEqual(['alpha', 'valuable', 'high'])
    expect(select(pool, '', 'value', weights).map(({ uid }) => uid)).toEqual([
      'valuable',
      'high',
      'alpha',
    ])
    expect(pool.map(({ uid }) => uid)).toEqual(originalOrder)
  })

  it('keeps unresolved shapes available for explicit confirmation', () => {
    const unresolved = chart('unresolved', 'Unknown Shape', {
      shape: undefined,
      shapeResolved: false,
      shapeInput: 'Mystery',
    })

    expect(select([unresolved], '', 'value')).toEqual([unresolved])
  })
})
