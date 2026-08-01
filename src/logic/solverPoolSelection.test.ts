import { describe, expect, it } from 'vitest'
import { chartRewardKey } from './rewards'
import type { ChartData } from '../types'
import { KEEP_BEST_CHARTS, selectFillerPool, selectStrategySolvePool } from './solverPoolSelection'

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 80,
  edges: [true, true, true, true],
  modIds: [],
  shape: 'Crossing',
  shapeResolved: true,
  ...overrides,
})

describe('solver pool selection', () => {
  it('holds back charts reserved by modifier, name, or canonical destination', () => {
    const eligiblePool = [
      chart('ordinary'),
      chart('modifier', { modIds: ['reserved-mod'] }),
      chart('named', { name: 'Ethereal Paradise Chart' }),
      chart('area', { areaType: 'sea-pillars' }),
    ]

    expect(
      selectStrategySolvePool(eligiblePool, {
        reserveModIds: ['reserved-mod'],
        reserveNames: ['ethereal paradise'],
        reserveAreaTypes: ['sea-pillars'],
      }),
    ).toEqual({ solvePool: [eligiblePool[0]], heldBack: 3 })
  })

  it('keeps the nine highest-value and every locked chart out of a filler pool', () => {
    const eligiblePool = Array.from({ length: 12 }, (_, index) =>
      chart(String(index), {
        preserved: index === 0,
        rewards: [{ stat: 'quantity', percent: index * 100 }],
      }),
    )

    const fillerPool = selectFillerPool(
      eligiblePool,
      { [chartRewardKey('quantity')]: 1 },
      new Set(),
    )

    expect(KEEP_BEST_CHARTS).toBe(9)
    expect(fillerPool.map(({ uid }) => uid)).toEqual(['1', '2'])
    expect(eligiblePool.map(({ uid }) => uid)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ])
  })
})
