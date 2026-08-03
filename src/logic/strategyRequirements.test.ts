import { describe, expect, it } from 'vitest'
import type { ChartData } from '../types'
import { emptyBorders } from '../types'
import { allocateStrategyRequirements, type StrategyRequirement } from './strategyRequirements'

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
})
