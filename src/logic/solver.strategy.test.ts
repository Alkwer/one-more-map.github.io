import { describe, expect, it } from 'vitest'
import type { ChartAreaType, ChartData } from '../types'
import { emptyBorders } from '../types'
import { solve } from './solver'

function chart(uid: string, name: string, areaType?: ChartAreaType): ChartData {
  return {
    uid,
    name,
    level: 83,
    edges: [false, false, false, false],
    areaType,
    modIds: [],
  }
}

describe('strategy destination rules', () => {
  it('places a canonical Sea Pillars chart without relying on its localized name', () => {
    const seaPillars = chart('sea-pillars', '해병 고역 산호 암초 해도', 'sea-pillars')
    const nameImpostor = chart('impostor', 'Pelagic Pillar Chart', 'undersea-groves')

    const [best] = solve(
      [seaPillars, nameImpostor],
      emptyBorders(),
      {},
      {
        mode: 'any',
        allowRotation: false,
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        topK: 1,
        strategyRules: [{ cells: [4], areaTypes: ['sea-pillars'], bonus: 100 }],
      },
    )

    expect(best.board[4]?.chartUid).toBe('sea-pillars')
  })

  it('never lets raw reward displace a mandatory strategy piece', () => {
    const required = chart('required', 'Required chart', 'sea-pillars')
    const highScore = Array.from({ length: 9 }, (_, index) => ({
      ...chart(`high-score-${index}`, `High score ${index}`),
      rewards: [{ stat: 'quantity' as const, percent: 20_000 }],
    }))

    const results = solve(
      [required, ...highScore],
      emptyBorders(),
      { 'self:quant': 1 },
      {
        mode: 'any',
        allowRotation: false,
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        topK: 5,
        strategyRules: [{ cells: [4], areaTypes: ['sea-pillars'], bonus: 100 }],
        strategyRequirements: [
          {
            cells: [4],
            areaTypes: ['sea-pillars'],
            count: 1,
            label: 'Required centre chart',
          },
        ],
        forceHeuristic: true,
        searchRestarts: 20,
        searchIterations: 200,
        seed: 86,
      },
    )

    expect(results).not.toHaveLength(0)
    expect(results.every((result) => result.board[4]?.chartUid === required.uid)).toBe(true)
  })

  it('returns no strategy result when a lock makes the required position impossible', () => {
    const required = chart('required', 'Required chart', 'sea-pillars')
    const fillers = Array.from({ length: 8 }, (_, index) =>
      chart(`filler-${index}`, `Filler ${index}`),
    )
    const locked = Array(9).fill(null)
    locked[0] = { chartUid: required.uid, rotation: 0 }

    const results = solve(
      [required, ...fillers],
      emptyBorders(),
      {},
      {
        mode: 'any',
        allowRotation: false,
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        topK: 1,
        strategyRequirements: [
          {
            cells: [4],
            areaTypes: ['sea-pillars'],
            count: 1,
            label: 'Required centre chart',
          },
        ],
        locked,
        forceHeuristic: true,
        searchRestarts: 4,
        searchIterations: 20,
        seed: 86,
      },
    )

    expect(results).toEqual([])
  })
})
