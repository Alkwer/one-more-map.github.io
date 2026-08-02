import { describe, expect, it } from 'vitest'
import type { StrategyDef } from '../data/strategies'
import type { ChartData } from '../types'
import { selectStrategySolvePool } from './solverPoolSelection'

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [true, true, true, true],
  modIds: [],
  ...overrides,
})

const strategy: Pick<StrategyDef, 'allowRareImplicits' | 'reservationGroups'> = {
  reservationGroups: [
    {
      id: 'divine',
      label: 'Divine strategies',
      modIds: ['divine-mod'],
      areaTypes: ['sea-pillars'],
    },
    { id: 'meatfish', label: 'Meatfish', modIds: ['meatfish-mod', 'shared-mod'] },
    { id: 'ethereal', label: 'Magic Ethereal', modIds: ['ethereal-mod', 'shared-mod'] },
  ],
}

const pool = [
  chart('ordinary'),
  chart('divine-modifier', { modIds: ['divine-mod'] }),
  chart('divine-area', { areaType: 'sea-pillars' }),
  chart('meatfish', { modIds: ['meatfish-mod'] }),
  chart('ethereal', { modIds: ['ethereal-mod'] }),
  chart('shared', { modIds: ['shared-mod'] }),
]

describe('strategy solve-pool reservations', () => {
  it('holds back only enabled categories and reports them', () => {
    expect(
      selectStrategySolvePool(pool, strategy, {
        divine: true,
        meatfish: false,
        ethereal: false,
      }),
    ).toEqual({
      solvePool: [pool[0], pool[3], pool[4], pool[5]],
      heldBack: 2,
      heldBackFor: ['Divine strategies'],
    })
  })

  it('returns every chart when all categories are disabled', () => {
    expect(
      selectStrategySolvePool(pool, strategy, {
        divine: false,
        meatfish: false,
        ethereal: false,
      }),
    ).toEqual({ solvePool: pool, heldBack: 0, heldBackFor: [] })
  })

  it('keeps overlaps protected while either matching category is enabled', () => {
    const result = selectStrategySolvePool(pool, strategy, {
      divine: false,
      meatfish: false,
      ethereal: true,
    })

    expect(result.solvePool.map(({ uid }) => uid)).not.toContain('shared')
    expect(result.heldBackFor).toEqual(['Magic Ethereal'])
  })

  it('always includes locked charts even when their category is protected', () => {
    const result = selectStrategySolvePool(
      pool,
      strategy,
      { divine: true, meatfish: true, ethereal: true },
      new Set(['divine-modifier']),
    )

    expect(result.solvePool.map(({ uid }) => uid)).toContain('divine-modifier')
  })

  it('preserves the manual-mode Divine protection and lets users disable it', () => {
    const rare = chart('rare', { modIds: ['adj-rare-1'] })

    expect(selectStrategySolvePool([rare], null).solvePool).toEqual([])
    expect(
      selectStrategySolvePool([rare], null, {
        divine: false,
        meatfish: true,
        ethereal: true,
      }).solvePool,
    ).toEqual([rare])
  })
})
