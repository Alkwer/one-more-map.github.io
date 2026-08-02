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
  const strategy = {
    reservationGroups: [
      {
        id: 'divine' as const,
        label: 'Divine strategies',
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
        speedrun: false,
        divine: true,
        meatfish: false,
        ethereal: false,
      }),
    ).toEqual({
      solvePool: [eligiblePool[0], eligiblePool[4], eligiblePool[5]],
      heldBack: 3,
      heldBackFor: ['Divine strategies'],
    })
  })

  it('returns every eligible chart when all reservation groups are disabled', () => {
    expect(
      selectStrategySolvePool(eligiblePool, strategy, {
        speedrun: false,
        divine: false,
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
            id: 'divine',
            label: 'Divine strategies',
            modIds: ['reserved-mod'],
            nameMatches: ['ethereal paradise'],
            areaTypes: ['sea-pillars'],
          },
        ],
      }),
    ).toEqual({
      solvePool: [eligiblePool[0]],
      heldBack: 3,
      heldBackFor: ['Divine strategies'],
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
      heldBackFor: ['Divine strategies', 'Meatfish', 'Magic Ethereal'],
    })
    expect(
      selectStrategySolvePool(manualPool, null, {
        speedrun: false,
        divine: false,
        meatfish: true,
        ethereal: false,
      }),
    ).toEqual({
      solvePool: [manualPool[0], manualPool[1], manualPool[3]],
      heldBack: 1,
      heldBackFor: ['Meatfish'],
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
      { speedrun: false, divine: true, meatfish: true, ethereal: true },
    )

    expect(protectedPool.map(({ uid }) => uid)).toEqual(['ordinary-0', 'ordinary-1', 'ordinary-2'])
    expect(speedrunReleased.map(({ uid }) => uid)).toEqual([
      'ordinary-0',
      'ordinary-1',
      'ordinary-2',
      'speedrun-message',
    ])
  })
})
