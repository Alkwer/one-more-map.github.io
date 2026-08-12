import { describe, expect, it } from 'vitest'
import type { PositionRule } from '../src/data/strategies'
import type { Borders, ChartData, Edges } from '../src/types'
import { checkConnectivity, rotateEdges } from '../src/logic/connectivity'
import { CHART_REWARD_STATS, chartRewardKey } from '../src/logic/rewards'
import { solve, type SolverOptions } from '../src/logic/solver'

const EMPTY_EDGES: Edges = [false, false, false, false]
const VERTICAL: Edges = [true, false, true, false]
const HORIZONTAL: Edges = [false, true, false, true]

const emptyBorders = (): Borders => Array(12).fill(null)

const chart = (uid: string, quantity = 0, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges: EMPTY_EDGES,
  modIds: [],
  rewards: quantity > 0 ? [{ stat: 'quantity', percent: quantity }] : undefined,
  ...overrides,
})

const baseOptions = (overrides: Partial<SolverOptions> = {}): SolverOptions => ({
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
    .map((placement) => (placement ? `${placement.chartUid}:${placement.rotation}` : '_'))
    .join('|')

const connectorBonusPool = (connectedReward: number, disconnectedReward: number) => {
  const cross: Edges = [true, true, true, true]
  const fixed = [
    chart('fixed-0'),
    chart('fixed-1', 0, { edges: [false, false, true, false] }),
    chart('fixed-2'),
    chart('fixed-3', 0, { edges: [false, true, false, false] }),
    chart('fixed-5', 0, { edges: [false, false, false, true] }),
    chart('fixed-6'),
    chart('fixed-7', 0, { edges: [true, false, false, false] }),
    chart('fixed-8'),
  ]
  const locked = [
    { chartUid: 'fixed-0', rotation: 0 },
    { chartUid: 'fixed-1', rotation: 0 },
    { chartUid: 'fixed-2', rotation: 0 },
    { chartUid: 'fixed-3', rotation: 0 },
    null,
    { chartUid: 'fixed-5', rotation: 0 },
    { chartUid: 'fixed-6', rotation: 0 },
    { chartUid: 'fixed-7', rotation: 0 },
    { chartUid: 'fixed-8', rotation: 0 },
  ]
  return {
    pool: [
      ...fixed,
      chart('connected', connectedReward, { edges: cross }),
      chart('disconnected', disconnectedReward),
    ],
    locked,
  }
}

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
    expect(results.every((result) => result.searchMethod === 'exhaustive')).toBe(true)
    expect(results.every((result) => result.searchComplete)).toBe(true)
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

  it('maximizes reward without a connector-count bonus in ignore-connectors mode', () => {
    const { pool, locked } = connectorBonusPool(0, 50)

    const [result] = solve(
      pool,
      emptyBorders(),
      { 'self:quant': 1 },
      baseOptions({
        locked,
        forceHeuristic: true,
        searchRestarts: 2,
        searchIterations: 500,
        seed: 273,
        topK: 1,
      }),
    )

    expect(result.board[4]?.chartUid).toBe('disconnected')
    expect(result.reward).toBeCloseTo(0.5)
    expect(result.score).toBeCloseTo(0.5)
  })

  it('minimizes reward without a connector-count bonus in ignore-connectors mode', () => {
    const { pool, locked } = connectorBonusPool(50, 0)

    const [result] = solve(
      pool,
      emptyBorders(),
      { 'self:quant': 1 },
      baseOptions({
        locked,
        minimizeReward: true,
        forceHeuristic: true,
        searchRestarts: 2,
        searchIterations: 500,
        seed: 273,
        topK: 1,
      }),
    )

    expect(result.board[4]?.chartUid).toBe('disconnected')
    expect(result.reward).toBe(0)
    expect(result.score).toBeCloseTo(0)
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
        result.board.flatMap((placement) => (placement ? [placement.chartUid] : [])),
      ),
    ).not.toContain('unresolved')
    expect(
      solve([unresolved], emptyBorders(), { 'self:quant': 1 }, baseOptions({ mode: 'strict' })),
    ).toEqual([])
  })

  it('ranks a valid exhaustive result ahead of a higher-scoring invalid board', () => {
    const cross: Edges = [true, true, true, true]
    const topLeftOnly: Edges = [false, true, true, false]
    const maximumRewards = CHART_REWARD_STATS.map((stat) => ({ stat, percent: 10_000 }))
    const weights = Object.fromEntries(CHART_REWARD_STATS.map((stat) => [chartRewardKey(stat), 10]))
    const pool = [
      chart('required-top-left', 0, { edges: topLeftOnly }),
      chart('maximum-reward', 0, { edges: cross, rewards: maximumRewards }),
      ...Array.from({ length: 7 }, (_, index) => chart(`cross-${index + 1}`, 0, { edges: cross })),
    ]
    const borders: Borders = Array(12).fill(null)
    borders[0] = 'b-mag-3'
    borders[9] = 'b-mag-3'

    const [result] = solve(
      pool,
      borders,
      weights,
      baseOptions({
        mode: 'strict',
        topK: 1,
        strategyRules: [
          {
            cells: [0],
            nameMatch: 'maximum-reward',
            bonus: 0,
            rewardStat: { stat: 'quantity', per: 5 },
          },
        ],
        locked: [
          null,
          null,
          ...Array.from({ length: 7 }, (_, index) => ({
            chartUid: `cross-${index + 1}`,
            rotation: 0,
          })),
        ],
      }),
    )

    expect(result.valid).toBe(true)
    expect(result.searchComplete).toBe(true)
    expect(result.board[0]?.chartUid).toBe('required-top-left')
  })
})

describe('heuristic solver', () => {
  it('marks a bounded miss as inconclusive when a valid arrangement is independently known', () => {
    const corners = Array.from({ length: 6 }, (_, index) =>
      chart(`corner-${index}`, 0, { edges: [true, true, false, false] }),
    )
    const straights = Array.from({ length: 3 }, (_, index) =>
      chart(`straight-${index}`, 0, { edges: VERTICAL }),
    )
    const pool = [...corners, ...straights]
    const knownValidBoard = [
      { chartUid: corners[0].uid, rotation: 1 },
      { chartUid: straights[0].uid, rotation: 1 },
      { chartUid: corners[1].uid, rotation: 3 },
      { chartUid: corners[2].uid, rotation: 0 },
      { chartUid: straights[1].uid, rotation: 1 },
      { chartUid: corners[3].uid, rotation: 2 },
      { chartUid: corners[4].uid, rotation: 1 },
      { chartUid: straights[2].uid, rotation: 1 },
      { chartUid: corners[5].uid, rotation: 3 },
    ]
    expect(
      checkConnectivity(knownValidBoard, new Map(pool.map((c) => [c.uid, c])), 'strict').valid,
    ).toBe(true)
    const [bounded] = solve(
      pool,
      emptyBorders(),
      {},
      baseOptions({
        mode: 'strict',
        allowRotation: true,
        forceHeuristic: true,
        searchRestarts: 1,
        searchIterations: 0,
        seed: 12,
        topK: 1,
      }),
    )

    expect(bounded.valid).toBe(false)
    expect(bounded.searchMethod).toBe('heuristic')
    expect(bounded.searchComplete).toBe(false)
  })

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

    const first = solve(pool, emptyBorders(), { 'self:quant': 1 }, options)
    const second = solve(pool, emptyBorders(), { 'self:quant': 1 }, options)

    expect(second).toEqual(first)
    expect(first[0].reward).toBeCloseTo(5.4)
    expect(first[0].board.filter(Boolean)).toHaveLength(9)
    expect(first[0].board.some((placement) => placement?.chartUid === 'reward-1')).toBe(false)
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
    const rules: PositionRule[] = [{ cells: [4], modIds: ['adj-star-1'], bonus: 100 }]

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
      const placedChart = [special, ...fillers].find((entry) => entry.uid === placement?.chartUid)
      expect(placedChart).toBeDefined()
      expect(rotateEdges(placedChart!.edges, placement!.rotation)).toEqual(HORIZONTAL)
    }
  })
})
