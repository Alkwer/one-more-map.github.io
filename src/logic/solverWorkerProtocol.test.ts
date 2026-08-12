import { describe, expect, it } from 'vitest'
import type { Borders, ChartData } from '../types'
import { MAX_IMPLICIT_TEXT_LENGTH, MAX_RAW_TEXT_LENGTH } from './storage'
import { solve, type SolverOptions } from './solver'
import { hydrateSolverChartDto, toSolverChartDto } from './solverWorkerProtocol'

const emptyBorders = (): Borders => Array(12).fill(null)

const options: SolverOptions = {
  mode: 'any',
  allowRotation: false,
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
  topK: 3,
}

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: [false, false, false, false],
  modIds: [],
  ...overrides,
})

describe('solver worker chart protocol', () => {
  it('keeps direct and serialized solver results equivalent', () => {
    const pool = [
      chart('high', {
        rewards: [{ stat: 'quantity', percent: 100 }],
        rawText: 'not computational',
        implicitText: 'not computational',
      }),
      chart('low', {
        rewards: [{ stat: 'quantity', percent: 10 }],
        shapeInput: 'not computational',
        preserved: true,
      }),
    ]
    const borders = emptyBorders()
    borders[0] = 'b-mag-3'

    expect(
      solve(
        pool.map(toSolverChartDto).map(hydrateSolverChartDto),
        borders,
        { 'self:quant': 1 },
        options,
      ),
    ).toEqual(solve(pool, borders, { 'self:quant': 1 }, options))
  })

  it('keeps a maximum-size library payload below the documented byte budget', () => {
    const pool = Array.from({ length: 250 }, (_, index) =>
      chart(`chart-${index}`, {
        name: `Maximum chart ${index}`,
        edges: [true, true, true, true],
        modIds: ['adj-box-3', 'voy-rare'],
        rewards: [{ stat: 'quantity', percent: 100 }],
        rawText: 'r'.repeat(MAX_RAW_TEXT_LENGTH),
        implicitText: 'i'.repeat(MAX_IMPLICIT_TEXT_LENGTH),
        shapeInput: 'presentation-only shape source',
        preserved: index % 2 === 0,
      }),
    )
    const serializedBytes = new TextEncoder().encode(
      JSON.stringify(pool.map(toSolverChartDto)),
    ).byteLength
    const unfilteredBytes = new TextEncoder().encode(JSON.stringify(pool)).byteLength

    expect(serializedBytes).toBeLessThanOrEqual(128 * 1024)
    expect(serializedBytes).toBeLessThan(unfilteredBytes * 0.05)
  })
})
