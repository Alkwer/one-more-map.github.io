import { describe, expect, it } from 'vitest'
import { planSession } from './sessionPlan'
import { emptyBorders } from '../types'
import type { ChartAreaType, ChartData } from '../types'

let n = 0
const chart = (modIds: string[], areaType?: ChartAreaType): ChartData => ({
  uid: `t-${n++}`,
  name: `Chart ${n}`,
  level: 83,
  edges: [true, true, true, true],
  modIds,
  areaType,
})

const rolled = (modIds: string[] = []): ChartData => ({
  ...chart(modIds),
  rewards: [{ stat: 'quantity', percent: 110 }],
})

const junk = (count: number) => Array.from({ length: count }, () => rolled(['voy-quant-1']))

const divineBorders = (segment: number) => {
  const borders = emptyBorders()
  borders[segment] = 'b-divine'
  return borders
}

const divineKit = (
  strategyId: 'divine-border-rares' | 'cutedog-divine-boxes',
  feederCount: number,
  rareCount: number,
) => [
  chart([], strategyId === 'divine-border-rares' ? 'sea-pillars' : 'pelagic-abyss'),
  ...Array.from({ length: feederCount }, () =>
    chart([strategyId === 'divine-border-rares' ? 'adj-star-1' : 'adj-divbox-1']),
  ),
  ...Array.from({ length: rareCount }, () => chart(['voy-rare'])),
]

// a full Meatfish kit: 2 star, 1 pantheon, 2 sea-pillars, 2 lantern, 1 possess, 1 noequip
const meatfishKit = () => [
  chart(['adj-star-1']),
  chart(['adj-star-2']),
  chart(['adj-pantheon']),
  chart([], 'sea-pillars'),
  chart([], 'sea-pillars'),
  chart(['adj-lantern']),
  chart(['adj-lantern']),
  chart(['voy-possess']),
  chart(['voy-noequip']),
]

describe('session planner', () => {
  describe.each([
    {
      strategyId: 'divine-border-rares' as const,
      feederLabel: 'Starfish or Strongbox feeder chart',
      rareLabel: 'Increased Rares chart',
    },
    {
      strategyId: 'cutedog-divine-boxes' as const,
      feederLabel: 'Strongbox adjacent chart (any type)',
      rareLabel: 'Increased Rares (voyage) chart',
    },
  ])('$strategyId border-dependent requirements', ({ strategyId, feederLabel, rareLabel }) => {
    it.each([
      { location: 'corner', segment: 0, feeders: 2, rares: 6 },
      { location: 'middle edge', segment: 1, feeders: 3, rares: 5 },
    ])('accepts the complete $location composition', ({ segment, feeders, rares }) => {
      const pool = divineKit(strategyId, feeders, rares)
      const plan = planSession(pool, divineBorders(segment))
      const entry = plan.entries.find((candidate) => candidate.strategyId === strategyId)

      expect(entry?.status).toBe('ready')
      expect(plan.allocated).toBe(pool.length)
      expect(plan.allocated + plan.leftover).toBe(pool.length)
    })

    it('rejects a corner composition that is one Rare chart short', () => {
      const pool = divineKit(strategyId, 3, 5)
      const plan = planSession(pool, divineBorders(0))
      const entry = plan.entries.find((candidate) => candidate.strategyId === strategyId)

      expect(entry?.status).toBe('waiting')
      expect(entry?.note).toContain(`1× ${rareLabel}`)
      expect(entry?.note).not.toContain(`3× ${feederLabel}`)
      expect(plan.allocated + plan.leftover).toBe(pool.length)
    })

    it('rejects a middle-edge composition that is one feeder chart short', () => {
      const pool = divineKit(strategyId, 2, 6)
      const plan = planSession(pool, divineBorders(1))
      const entry = plan.entries.find((candidate) => candidate.strategyId === strategyId)

      expect(entry?.status).toBe('waiting')
      expect(entry?.note).toContain(`1× ${feederLabel}`)
      expect(plan.allocated + plan.leftover).toBe(pool.length)
    })
  })

  it('sequences a ready Meatfish, then Speedruns, then Alc & Go', () => {
    const pool = [
      ...meatfishKit(),
      rolled(['adj-opbox-1']), // speedrun centre
      rolled(['adj-divbox-2']), // second centre
      ...junk(20),
    ]
    const plan = planSession(pool, emptyBorders())

    const meatfish = plan.entries.find((e) => e.strategyId === 'milky-meatfish')
    expect(meatfish?.status).toBe('ready')

    const speedrun = plan.entries.find((e) => e.strategyId === 'milky-speedrun')
    expect(speedrun?.status).toBe('ready')
    expect(speedrun?.runs).toBe(2)

    // both Divine strats wait on the border roll
    for (const id of ['divine-border-rares', 'cutedog-divine-boxes']) {
      const e = plan.entries.find((x) => x.strategyId === id)
      expect(e?.status).toBe('waiting')
      expect(e?.note).toContain('border')
    }

    expect(plan.allocated + plan.leftover).toBe(pool.length)
  })

  it('reports what a not-ready strategy is missing', () => {
    const plan = planSession(junk(12), emptyBorders())
    const meatfish = plan.entries.find((e) => e.strategyId === 'milky-meatfish')
    expect(meatfish?.status).toBe('waiting')
    expect(meatfish?.note).toContain('Giant Starfish')
    // junk still burns fine
    const alcgo = plan.entries.find((e) => e.strategyId === 'alc-and-go')
    expect(alcgo?.runs).toBe(1)
  })

  it('treats one Divine border roll as a single-use planning resource', () => {
    const pool = [
      ...divineKit('divine-border-rares', 2, 6),
      ...divineKit('cutedog-divine-boxes', 2, 6),
    ]

    const plan = planSession(pool, divineBorders(0))
    const rares = plan.entries.find((entry) => entry.strategyId === 'divine-border-rares')
    const boxes = plan.entries.find((entry) => entry.strategyId === 'cutedog-divine-boxes')

    expect(rares?.status).toBe('ready')
    expect(boxes?.status).toBe('waiting')
    expect(boxes?.note).toContain('committed to Divine Border Rares')
    expect(boxes?.note).toContain('future roll and re-evaluation')
    expect(plan.allocated).toBe(9)
    expect(plan.leftover).toBe(9)
  })

  it('never double-spends a chart across entries', () => {
    const pool = [...meatfishKit(), rolled(['adj-opbox-1']), ...junk(8)]
    const plan = planSession(pool, emptyBorders())
    // meatfish takes its 9; the 1 centre + 8 junk feed exactly one speedrun
    expect(plan.entries.find((e) => e.strategyId === 'milky-speedrun')?.runs).toBe(1)
    expect(plan.entries.find((e) => e.strategyId === 'alc-and-go')).toBeUndefined()
    expect(plan.leftover).toBe(0)
  })

  it.each([
    { centres: 2, sides: 7, expectedRuns: 0, expectedLeftover: 9 },
    { centres: 9, sides: 0, expectedRuns: 0, expectedLeftover: 9 },
    { centres: 2, sides: 16, expectedRuns: 2, expectedLeftover: 0 },
  ])(
    'plans $expectedRuns Speedruns from $centres centres and $sides non-centres',
    ({ centres, sides, expectedRuns, expectedLeftover }) => {
      const pool = [
        ...Array.from({ length: centres }, () => rolled(['adj-opbox-1'])),
        ...junk(sides),
      ]

      const plan = planSession(pool, emptyBorders())
      const speedrun = plan.entries.find((entry) => entry.strategyId === 'milky-speedrun')

      expect(speedrun?.runs ?? 0).toBe(expectedRuns)
      expect(plan.leftover).toBe(expectedLeftover)
    },
  )

  it('reassigns an overlapping chart when a complete distinct kit exists', () => {
    const pool = [
      chart(['adj-star-1'], 'sea-pillars'),
      chart(['adj-star-1']),
      chart(['adj-star-2']),
      chart([], 'sea-pillars'),
      chart(['adj-pantheon']),
      chart(['adj-lantern']),
      chart(['adj-lantern']),
      chart(['voy-possess']),
      chart(['voy-noequip']),
    ]

    const plan = planSession(pool, emptyBorders())
    const meatfish = plan.entries.find((entry) => entry.strategyId === 'milky-meatfish')

    expect(meatfish?.status).toBe('ready')
    expect(plan.allocated).toBe(9)
    expect(plan.leftover).toBe(0)
  })

  it('reports unresolved shapes as blocked instead of allocating them', () => {
    const unresolved: ChartData = {
      ...chart(['adj-opbox-1']),
      edges: [false, false, false, false],
      shapeResolved: false,
      shapeInput: 'Spiral',
    }
    const pool = [...junk(8), unresolved]

    const plan = planSession(pool, emptyBorders())

    expect(plan.eligible).toBe(8)
    expect(plan.blocked).toBe(1)
    expect(plan.allocated).toBe(0)
    expect(plan.leftover).toBe(9)
    expect(plan.entries.some((entry) => entry.status === 'ready')).toBe(false)
  })
})
