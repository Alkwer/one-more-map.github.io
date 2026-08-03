import { describe, expect, it } from 'vitest'
import type { Board, ChartData } from '../types'
import { emptyBorders } from '../types'
import {
  allocateStrategyRequirements,
  boardSatisfiesStrategyRequirements,
  type StrategyRequirement,
} from './strategyRequirements'

const chart = (uid: string, modIds: string[]): ChartData => ({
  uid,
  name: `${uid} Chart`,
  level: 83,
  edges: [true, true, true, true],
  shape: 'Crossing',
  shapeResolved: true,
  modIds,
})

describe('strategy requirement allocation', () => {
  it('moves a broad match aside for a requirement with only one candidate', () => {
    const requirements: StrategyRequirement[] = [
      { modIds: ['wide', 'narrow'], count: 1, label: 'Wide requirement' },
      { modIds: ['narrow'], count: 1, label: 'Narrow requirement' },
    ]
    const pool = [chart('a-narrow', ['narrow']), chart('b-wide', ['wide'])]

    const allocation = allocateStrategyRequirements(requirements, pool, emptyBorders())

    expect(allocation.allocations.map((entry) => entry.chartUids)).toEqual([
      ['b-wide'],
      ['a-narrow'],
    ])
    expect(allocation.allocations.every((entry) => entry.missing === 0)).toBe(true)
  })

  it('is deterministic when the input pool order changes', () => {
    const requirements: StrategyRequirement[] = [
      { modIds: ['wide', 'narrow'], count: 1, label: 'Wide requirement' },
      { modIds: ['narrow'], count: 1, label: 'Narrow requirement' },
    ]
    const pool = [chart('a-narrow', ['narrow']), chart('b-wide', ['wide'])]

    expect(allocateStrategyRequirements(requirements, pool, emptyBorders())).toEqual(
      allocateStrategyRequirements(requirements, [...pool].reverse(), emptyBorders()),
    )
  })

  it('never assigns the same UID to two slots', () => {
    const duplicate = chart('same-chart', ['piece'])
    const requirements: StrategyRequirement[] = [
      { modIds: ['piece'], count: 2, label: 'Two physical pieces' },
    ]

    const allocation = allocateStrategyRequirements(
      requirements,
      [duplicate, duplicate],
      emptyBorders(),
    )

    expect(allocation.allocatedUids).toEqual(['same-chart'])
    expect(allocation.allocations[0].missing).toBe(1)
  })

  it('does not allocate more required pieces than fit on the board', () => {
    const requirements: StrategyRequirement[] = [
      { modIds: ['piece'], count: 10, label: 'Required piece' },
    ]
    const pool = Array.from({ length: 10 }, (_, index) => chart(`piece-${index}`, ['piece']))

    const allocation = allocateStrategyRequirements(requirements, pool, emptyBorders())

    expect(allocation.allocatedUids).toHaveLength(9)
    expect(allocation.allocations[0].missing).toBe(1)
  })

  it('checks distinct UIDs on the solved board instead of recounting matches', () => {
    const requirements: StrategyRequirement[] = [
      { modIds: ['wide', 'narrow'], count: 1, label: 'Wide requirement' },
      { modIds: ['narrow'], count: 1, label: 'Narrow requirement' },
    ]
    const narrow = chart('narrow', ['narrow'])
    const filler = chart('filler', [])
    const charts = new Map([narrow, filler].map((entry) => [entry.uid, entry]))
    const board: Board = [
      { chartUid: narrow.uid, rotation: 0 },
      { chartUid: filler.uid, rotation: 0 },
      ...Array(7).fill(null),
    ]

    expect(boardSatisfiesStrategyRequirements(requirements, board, charts, emptyBorders())).toBe(
      false,
    )
  })

  it('enforces static and border-relative allowed cells', () => {
    const center = chart('center', ['center'])
    const feederA = chart('feeder-a', ['feeder'])
    const feederB = chart('feeder-b', ['feeder'])
    const charts = new Map([center, feederA, feederB].map((entry) => [entry.uid, entry]))
    const borders = emptyBorders()
    borders[0] = 'b-divine'
    const requirements: StrategyRequirement[] = [
      { cells: [4], modIds: ['center'], count: 1, label: 'Centre piece' },
      {
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        modIds: ['feeder'],
        count: 2,
        label: 'Divine feeders',
      },
    ]
    const valid: Board = Array(9).fill(null)
    valid[4] = { chartUid: center.uid, rotation: 0 }
    valid[1] = { chartUid: feederA.uid, rotation: 0 }
    valid[3] = { chartUid: feederB.uid, rotation: 0 }
    const invalid: Board = valid.map((placement) => (placement ? { ...placement } : null))
    invalid[3] = null
    invalid[8] = { chartUid: feederB.uid, rotation: 0 }

    expect(boardSatisfiesStrategyRequirements(requirements, valid, charts, borders)).toBe(true)
    expect(boardSatisfiesStrategyRequirements(requirements, invalid, charts, borders)).toBe(false)
  })
})
