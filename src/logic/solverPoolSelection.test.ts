import { describe, expect, it } from 'vitest'
import { defaultStrategyReservations } from '../data/strategies'
import { chartRewardKey } from './rewards'
import type { ChartData } from '../types'
import { CUSTOM_OPTIONS, PIECE_TYPES, customKey, selectPieceBank } from './pieceKeeps'
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

describe('granular keep-count solve pools', () => {
  const keyOf = (label: string) => {
    const piece = PIECE_TYPES.find((candidate) => candidate.label === label)
    if (!piece) throw new Error(`no piece type labelled ${label}`)
    return piece.key
  }

  it('banks big generic boxes for Divine while leaving smaller generic boxes free', () => {
    const pool = [
      chart('big4', { modIds: ['adj-box-2'] }),
      chart('big5', { modIds: ['adj-box-3'] }),
      chart('small', { modIds: ['adj-box-1'] }),
      chart('diviner', { modIds: ['adj-divbox-2'] }),
    ]

    const bank = selectPieceBank(pool, {}, reservations())
    expect(bank.get('big4')?.strategyId).toBe('divine-border-rares')
    expect(bank.get('big5')?.strategyId).toBe('divine-border-rares')
    expect(bank.has('small')).toBe(false)
    expect(bank.get('diviner')?.strategyId).toBe('milky-speedrun')

    const withDiviners = selectPieceBank(
      pool,
      { [keyOf("Diviner's Strongbox chart")]: 1 },
      reservations(),
    )
    expect(withDiviners.get('diviner')?.strategyId).toBe('cutedog-divine-boxes')
  })

  it('banks six voyage-wide rares while adjacent rares remain spendable by default', () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, index) => chart(`voy-${index}`, { modIds: ['voy-rare'] })),
      chart('adjacent', { modIds: ['adj-rare-2'] }),
    ]

    const selection = selectStrategySolvePool(pool, null, reservations(), new Set(), {})
    expect(selection.heldBack).toBe(6)
    expect(selection.solvePool.map(({ uid }) => uid)).toEqual(['voy-6', 'voy-7', 'adjacent'])
  })

  it('ranks matching charts by their rolls within a kept type', () => {
    const pool = [
      chart('weak', { modIds: ['voy-rare'] }),
      chart('rolled', {
        modIds: ['voy-rare'],
        rewards: [{ stat: 'quantity', percent: 70 }],
      }),
    ]
    const bank = selectPieceBank(
      pool,
      { [keyOf('Increased Rares chart (voyage-wide)')]: 1 },
      reservations(),
    )
    expect(bank.has('rolled')).toBe(true)
    expect(bank.has('weak')).toBe(false)
  })

  it('banks user-added tier families for their selected strategy', () => {
    const barrelFamily = CUSTOM_OPTIONS.find((option) => option.modIds.includes('adj-barrel-1'))
    expect(barrelFamily).toBeDefined()
    const pool = [
      chart('small-barrel', { modIds: ['adj-barrel-1'] }),
      chart('big-barrel', { modIds: ['adj-barrel-2'] }),
    ]
    const keeps = {
      [customKey('milky-ethereal', barrelFamily!.modIds)]: 1,
    }
    const bank = selectPieceBank(pool, keeps, reservations())
    expect(bank.get('big-barrel')?.strategyId).toBe('milky-ethereal')
    expect(bank.has('small-barrel')).toBe(false)
  })

  it('gates a user-added type with its matching granular protection', () => {
    const starfishFamily = CUSTOM_OPTIONS.find((option) => option.modIds.includes('adj-star-1'))
    expect(starfishFamily).toBeDefined()
    const pool = [chart('starfish', { modIds: ['adj-star-2'] })]
    const keeps = {
      [keyOf('Giant Starfish chart')]: 0,
      [customKey('milky-ethereal', starfishFamily!.modIds)]: 1,
    }

    expect(selectPieceBank(pool, keeps, reservations({ starfish: false })).size).toBe(0)
    expect(selectPieceBank(pool, keeps, reservations()).get('starfish')?.strategyId).toBe(
      'milky-ethereal',
    )
  })

  it('keeps an explicit custom type outside the known protection categories', () => {
    const barrelFamily = CUSTOM_OPTIONS.find((option) => option.modIds.includes('adj-barrel-1'))!
    const keeps = {
      [customKey('milky-ethereal', barrelFamily.modIds)]: 1,
    }
    const bank = selectPieceBank(
      // An unrelated mod on the same chart must not make the Barrel type obey
      // that mod's category toggle.
      [chart('barrel', { modIds: ['adj-barrel-2', 'adj-star-2'] })],
      keeps,
      reservations({
        genericStrongboxes: false,
        divinerStrongboxes: false,
        arcanistStrongboxes: false,
        operativeStrongboxes: false,
        messages: false,
        starfish: false,
        globalRares: false,
        adjacentRares: false,
        seaPillars: false,
        pelagicAbyss: false,
        meatfish: false,
        ethereal: false,
      }),
    )

    expect(bank.get('barrel')?.strategyId).toBe('milky-ethereal')
  })
})
