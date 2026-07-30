import { describe, expect, it } from 'vitest'
import type { PositionRule } from '../src/data/strategies'
import type { Borders, ChartData, Edges } from '../src/types'
import { rotateEdges } from '../src/logic/connectivity'
import { solve, type SolverOptions } from '../src/logic/solver'

const EMPTY_EDGES: Edges = [false, false, false, false]
const VERTICAL: Edges = [true, false, true, false]
const HORIZONTAL: Edges = [false, true, false, true]

const emptyBorders = (): Borders => Array(12).fill(null)

const chart = (
  uid: string,
  quantity = 0,
  overrides: Partial<ChartData> = {},
): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: EMPTY_EDGES,
  modIds: [],
  rewards: quantity > 0 ? [{ stat: 'quantity', percent: quantity }] : undefined,
  ...overrides,
})

const baseOptions = (
  overrides: Partial<SolverOptions> = {},
): SolverOptions => ({
  mode: 'any',
  allowRotation: false,
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
  topK: 5,
  ...overrides,
})

const boardSignature = (result: ReturnType<typeof solve>[number]) =>
  result.board
    .map((placement) =>
      placement ? `${placement.chartUid}:${placement.rotation}` : '_',
    )
    .join('|')

describe('exact solver', () => {
  it('returns unique top-K arrangements and places the best reward on magnitude', () => {
    const borders = ['b-mag-3', ...Array(11).fill(null)]
    const results = solve(
      [chart('high', 100), chart('low', 10)],
      borders,
      { 'self:quant': 1 },
      baseOptions(),
    )

    expect(results).toHaveLength(5)
    expect(new Set(results.map(boardSignature)).size).toBe(5)
    expect(results[0].board[0]?.chartUid).toBe('high')
    expect(results[0].reward).toBeCloseTo(1.9)
    expect(results.every((result) => result.valid)).toBe(true)
  })

  it('minimizes actual reward while keeping the objective ordering internal', () => {
    const borders = ['b-mag-3', ...Array(11).fill(null)]
    const [result] = solve(
      [chart('high', 100), chart('low', 10)],
      borders,
      { 'self:quant': 1 },
      baseOptions({ minimizeReward: true, topK: 1 }),
    )

    expect(result.board[0]).toBeNull()
    expect(result.reward).toBeCloseTo(1.1)
    expect(result.score).toBeCloseTo(-1.1)
  })

  it('filters unresolved shapes from strict solver inputs', () => {
    const resolved = chart('resolved', 10, { edges: VERTICAL })
    const unresolved = chart('unresolved', 100, {
      edges: EMPTY_EDGES,
      shapeResolved: false,
      shapeInput: 'Spiral',
    })

    const results = solve(
      [resolved, unresolved],
      emptyBorders(),
      { 'self:quant': 1 },
      baseOptions({ mode: 'strict', topK: 3 }),
    )

    expect(results).not.toHaveLength(0)
    expect(
      results.flatMap((result) =>
        result.board.flatMap((placement) =>
          placement ? [placement.chartUid] : [],
        ),
      ),
    ).not.toContain('unresolved')
    expect(
      solve(
        [unresolved],
        emptyBorders(),
        { 'self:quant': 1 },
        baseOptions({ mode: 'strict' }),
      ),
    ).toEqual([])
  })
})

describe('heuristic solver', () => {
  it('is repeatable for the same seed and selects the best nine-chart subset', () => {
    const pool = Array.from({ length: 10 }, (_, index) =>
      chart(`reward-${index + 1}`, (index + 1) * 10),
    )
    const options = baseOptions({
      allowRotation: true,
      forceHeuristic: true,
      searchRestarts: 4,
      searchIterations: 1_000,
      seed: 0x18c0ffee,
      topK: 3,
    })

    const first = solve(
      pool,
      emptyBorders(),
      { 'self:quant': 1 },
      options,
    )
    const second = solve(
      pool,
      emptyBorders(),
      { 'self:quant': 1 },
      options,
    )

    expect(second).toEqual(first)
    expect(first[0].reward).toBeCloseTo(5.4)
    expect(first[0].board.filter(Boolean)).toHaveLength(9)
    expect(
      first[0].board.some(
        (placement) => placement?.chartUid === 'reward-1',
      ),
    ).toBe(false)
  })

  it('honors strategy placement rules and rotates charts into the target layout', () => {
    const special = chart('special', 0, {
      edges: VERTICAL,
      modIds: ['adj-star-1'],
    })
    const fillers = Array.from({ length: 9 }, (_, index) =>
      chart(`filler-${index + 1}`, 0, { edges: VERTICAL }),
    )
    const layout: Edges[] = Array.from({ length: 9 }, () => HORIZONTAL)
    const rules: PositionRule[] = [
      { cells: [4], modIds: ['adj-star-1'], bonus: 100 },
    ]

    const [result] = solve(
      [special, ...fillers],
      emptyBorders(),
      {},
      baseOptions({
        allowRotation: true,
        forceHeuristic: true,
        strategyLayout: layout,
        strategyRules: rules,
        searchRestarts: 2,
        searchIterations: 100,
        seed: 0x18,
        topK: 1,
      }),
    )

    expect(result.board[4]?.chartUid).toBe('special')
    expect(result.board.filter(Boolean)).toHaveLength(9)
    for (const placement of result.board) {
      expect(placement).not.toBeNull()
      const placedChart = [special, ...fillers].find(
        (entry) => entry.uid === placement?.chartUid,
      )
      expect(placedChart).toBeDefined()
      expect(rotateEdges(placedChart!.edges, placement!.rotation)).toEqual(
        HORIZONTAL,
      )
    }
  })
})
