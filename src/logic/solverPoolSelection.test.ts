import { describe, expect, it } from 'vitest'
import type { StrategyDef } from '../data/strategies'
import type { ChartData } from '../types'
import { selectRareBacklog, selectStrategySolvePool } from './solverPoolSelection'

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [true, true, true, true],
  modIds: [],
  ...overrides,
})

const strategy: Pick<
  StrategyDef,
  'allowRareImplicits' | 'allowFractureCharts' | 'reservationGroups'
> = {
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

  it('banks only the best six rare charts - extras are spendable', () => {
    const rares = [
      ...Array.from({ length: 5 }, (_, i) => chart(`r60-${i}`, { modIds: ['adj-rare-2'] })),
      chart('r25-good', {
        modIds: ['voy-rare'],
        rewards: [{ stat: 'quantity', percent: 70 }],
      }),
      chart('r25-weak', { modIds: ['voy-rare'] }),
      chart('r30-extra', { modIds: ['adj-rare-1'] }),
    ]

    // ranking: five 60% tiers + the best-rolled 25% fill the backlog...
    const backlog = selectRareBacklog(rares)
    expect(backlog.size).toBe(6)
    expect(backlog.has('r30-extra')).toBe(true) // 30% tier beats both 25%s
    expect(backlog.has('r25-good')).toBe(false)
    expect(backlog.has('r25-weak')).toBe(false)

    // ...and manual mode holds exactly the backlog, spending the rest
    const { solvePool } = selectStrategySolvePool(rares, null)
    expect(solvePool.map(({ uid }) => uid).sort()).toEqual(['r25-good', 'r25-weak'])
  })

  it('ranks equal-tier rares by their header rolls', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => chart(`r60-${i}`, { modIds: ['adj-rare-2'] })),
      chart('weak', { modIds: ['voy-rare'] }),
      chart('good', {
        modIds: ['voy-rare'],
        rewards: [{ stat: 'quantity', percent: 70 }],
      }),
    ]
    const backlog = selectRareBacklog(pool)
    expect(backlog.has('good')).toBe(true)
    expect(backlog.has('weak')).toBe(false)
  })

  it('holds Rare Fracture charts for Meatfish everywhere except Meatfish itself', () => {
    const fracture = chart('fracture', { modIds: ['voy-fracture'] })

    // manual mode holds it, reporting Meatfish as the reason
    const manual = selectStrategySolvePool([fracture], null)
    expect(manual.solvePool).toEqual([])
    expect(manual.heldBackFor).toEqual(['Meatfish'])
    // Meatfish itself may spend it
    expect(
      selectStrategySolvePool([fracture], { allowFractureCharts: true }).solvePool,
    ).toEqual([fracture])
    // a Divine strategy may not (rares allowed, fracture still Meatfish fuel)
    expect(
      selectStrategySolvePool([fracture], { allowRareImplicits: true }).solvePool,
    ).toEqual([])
    // switching the Meatfish protection off releases it
    expect(
      selectStrategySolvePool([fracture], null, {
        divine: true,
        meatfish: false,
        ethereal: true,
      }).solvePool,
    ).toEqual([fracture])
  })
})
