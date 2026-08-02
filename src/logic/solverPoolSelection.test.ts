import { describe, expect, it } from 'vitest'
import { defaultStrategyReservations } from '../data/strategies'
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

const reservations = (overrides: Partial<ReturnType<typeof defaultStrategyReservations>> = {}) => ({
  ...defaultStrategyReservations(),
  ...overrides,
})

describe('solver pool selection', () => {
  const strategy = {
    reservationGroups: [
      {
        id: 'genericStrongboxes' as const,
        label: 'Generic Strongboxes',
        modIds: ['divine-mod'],
        nameMatches: ['pelagic'],
        areaTypes: ['sea-pillars' as const],
      },
      {
        id: 'meatfish' as const,
        label: 'Meatfish',
        modIds: ['meatfish-mod'],
      },
      {
        id: 'ethereal' as const,
        label: 'Magic Ethereal',
        modIds: ['ethereal-mod'],
      },
    ],
  }

  const eligiblePool = [
    chart('ordinary'),
    chart('divine-modifier', { modIds: ['divine-mod'] }),
    chart('divine-name', { name: 'Pelagic Abyss Chart' }),
    chart('divine-area', { areaType: 'sea-pillars' }),
    chart('meatfish', { modIds: ['meatfish-mod'] }),
    chart('ethereal', { modIds: ['ethereal-mod'] }),
  ]

  it('holds back only enabled reservation groups and reports why', () => {
    expect(
      selectStrategySolvePool(eligiblePool, strategy, {
        ...reservations(),
        genericStrongboxes: true,
        meatfish: false,
        ethereal: false,
      }),
    ).toEqual({
      solvePool: [eligiblePool[0], eligiblePool[4], eligiblePool[5]],
      heldBack: 3,
      heldBackFor: ['Generic Strongboxes'],
    })
  })

  it('returns every eligible chart when all reservation groups are disabled', () => {
    expect(
      selectStrategySolvePool(eligiblePool, strategy, {
        ...reservations(),
        genericStrongboxes: false,
        adjacentRares: false,
        globalRares: false,
        meatfish: false,
        ethereal: false,
      }),
    ).toEqual({ solvePool: eligiblePool, heldBack: 0, heldBackFor: [] })
  })

  it('matches reservations by modifier, name, or canonical destination', () => {
    const eligiblePool = [
      chart('ordinary'),
      chart('modifier', { modIds: ['reserved-mod'] }),
      chart('named', { name: 'Ethereal Paradise Chart' }),
      chart('area', { areaType: 'sea-pillars' }),
    ]

    expect(
      selectStrategySolvePool(eligiblePool, {
        reservationGroups: [
          {
            id: 'genericStrongboxes',
            label: 'Generic Strongboxes',
            modIds: ['reserved-mod'],
            nameMatches: ['ethereal paradise'],
            areaTypes: ['sea-pillars'],
          },
        ],
      }),
    ).toEqual({
      solvePool: [eligiblePool[0]],
      heldBack: 3,
      heldBackFor: ['Generic Strongboxes'],
    })
  })

  it('holds every enabled strategy category back in manual mode', () => {
    const manualPool = [
      chart('ordinary'),
      chart('adjacent-rares', { modIds: ['adj-rare-1'] }),
      chart('meatfish', { modIds: ['voy-possess'] }),
      chart('ethereal', { modIds: ['voy-minmagic'] }),
    ]

    expect(selectStrategySolvePool(manualPool, null)).toEqual({
      solvePool: [manualPool[0]],
      heldBack: 3,
      heldBackFor: [
        'Adjacent Rare Monsters',
        'Other Meatfish pieces',
        'Other Magic Ethereal pieces',
      ],
    })
    expect(
      selectStrategySolvePool(
        manualPool,
        null,
        reservations({
          adjacentRares: false,
          globalRares: false,
          meatfish: true,
          ethereal: false,
        }),
      ),
    ).toEqual({
      solvePool: [manualPool[0], manualPool[1], manualPool[3]],
      heldBack: 1,
      heldBackFor: ['Other Meatfish pieces'],
    })
  })

  it('allows Divine strategies to consume rare-implicit charts', () => {
    const divinePool = [chart('ordinary'), chart('voyage-rares', { modIds: ['voy-rare'] })]

    expect(
      selectStrategySolvePool(divinePool, {
        allowRareImplicits: true,
      }),
    ).toEqual({ solvePool: divinePool, heldBack: 0, heldBackFor: [] })
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
      null,
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

  it('keeps enabled strategy reservations out of a filler pool', () => {
    const eligiblePool = [
      ...Array.from({ length: 12 }, (_, index) =>
        chart(`ordinary-${index}`, {
          rewards: [{ stat: 'quantity', percent: index * 100 }],
        }),
      ),
      chart('speedrun-message', { modIds: ['adj-msg-1'] }),
      chart('ethereal-area', { areaType: 'infested-bathyspheres' }),
    ]

    const protectedPool = selectFillerPool(
      eligiblePool,
      { [chartRewardKey('quantity')]: 1 },
      new Set(),
      null,
    )
    const speedrunReleased = selectFillerPool(
      eligiblePool,
      { [chartRewardKey('quantity')]: 1 },
      new Set(),
      null,
      reservations({ messages: false }),
    )

    expect(protectedPool.map(({ uid }) => uid)).toEqual(['ordinary-0', 'ordinary-1', 'ordinary-2'])
    expect(speedrunReleased.map(({ uid }) => uid)).toEqual([
      'ordinary-0',
      'ordinary-1',
      'ordinary-2',
      'speedrun-message',
    ])
  })

  it('releases Starfish independently from generic Strongboxes', () => {
    const pool = [
      chart('ordinary'),
      chart('starfish', { modIds: ['adj-star-2'] }),
      chart('strongboxes', { modIds: ['adj-box-3'] }),
    ]

    expect(selectStrategySolvePool(pool, null, reservations({ starfish: false }))).toEqual({
      solvePool: [pool[0], pool[1]],
      heldBack: 1,
      heldBackFor: ['Generic Strongboxes'],
    })
  })

  it('configures each Strongbox family independently', () => {
    const pool = [
      chart('generic', { modIds: ['adj-box-3'] }),
      chart('diviner', { modIds: ['adj-divbox-2'] }),
      chart('arcanist', { modIds: ['adj-arcbox-2'] }),
      chart('operative', { modIds: ['adj-opbox-2'] }),
    ]

    expect(
      selectStrategySolvePool(
        pool,
        null,
        reservations({
          divinerStrongboxes: false,
          arcanistStrongboxes: false,
          operativeStrongboxes: false,
        }),
      ),
    ).toEqual({
      solvePool: [pool[1], pool[2], pool[3]],
      heldBack: 1,
      heldBackFor: ['Generic Strongboxes'],
    })
  })

  it('releases adjacent Rares without spending voyage-wide Rares', () => {
    const pool = [
      chart('adjacent-rares', { modIds: ['adj-rare-2'] }),
      chart('global-rares', { modIds: ['voy-rare'] }),
    ]

    expect(selectStrategySolvePool(pool, null, reservations({ adjacentRares: false }))).toEqual({
      solvePool: [pool[0]],
      heldBack: 1,
      heldBackFor: ['Voyage-wide Rare Monsters'],
    })
  })
})
