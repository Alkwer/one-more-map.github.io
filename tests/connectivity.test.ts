import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import type { Board, Borders, ChartData, Edges } from '../src/types'
import { checkConnectivity } from '../src/logic/connectivity'
import { solve } from '../src/logic/solver'
import { evaluateStrategyInventory } from '../src/logic/strategySuggestions'

const chart = (uid: string, edges: Edges): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 83,
  edges,
  modIds: [],
})

const boardFor = (charts: ChartData[]): Board =>
  charts.map((entry) => ({ chartUid: entry.uid, rotation: 0 }))

const emptyBorders = (): Borders => Array(12).fill(null)

const verticals = Array.from({ length: 9 }, (_, index) =>
  chart(`straight-${index}`, [true, false, true, false]),
)
const verticalBoard = boardFor(verticals)
const verticalMap = new Map(verticals.map((entry) => [entry.uid, entry]))

describe('connectivity regressions', () => {
  it('distinguishes a launchable board from full reachability', () => {
    // The game accepts three separately matched Straight lanes, but only the lane
    // containing the bottom-left start can be explored.
    const result = checkConnectivity(verticalBoard, verticalMap, 'strict')
    assert.equal(result.launchable, true)
    assert.equal(result.fullyReachable, false)
    assert.equal(result.valid, false)
    assert.equal(result.mismatches, 0)
    assert.equal(result.unfilled, 0)
    assert.equal(result.unreachable, 6)
    assert.equal(result.connections, 6)
    assert.equal(result.violations, 6)
  })

  it('retains structural diagnostics in experiment mode', () => {
    const result = checkConnectivity(verticalBoard, verticalMap, 'any')
    assert.equal(result.valid, true)
    assert.equal(result.launchable, true)
    assert.equal(result.fullyReachable, false)
    assert.equal(result.unreachable, 6)
    assert.equal(result.violations, 0)
  })

  it('accepts a fully matched connected board', () => {
    const crosses = Array.from({ length: 9 }, (_, index) =>
      chart(`cross-${index}`, [true, true, true, true]),
    )
    const result = checkConnectivity(
      boardFor(crosses),
      new Map(crosses.map((entry) => [entry.uid, entry])),
      'strict',
    )
    assert.equal(result.launchable, true)
    assert.equal(result.fullyReachable, true)
    assert.equal(result.valid, true)
    assert.equal(result.unreachable, 0)
    assert.equal(result.connections, 12)
  })

  it('rejects a shared-edge mismatch', () => {
    const charts = Array.from({ length: 9 }, (_, index) =>
      chart(`mismatch-${index}`, [false, false, false, false]),
    )
    charts[0].edges = [false, true, false, false]
    const result = checkConnectivity(
      boardFor(charts),
      new Map(charts.map((entry) => [entry.uid, entry])),
      'strict',
    )
    assert.equal(result.mismatches, 1)
    assert.equal(result.launchable, false)
    assert.equal(result.fullyReachable, false)
    assert.equal(result.valid, false)
  })

  it('requires all nine slots for launch', () => {
    const crosses = Array.from({ length: 8 }, (_, index) =>
      chart(`partial-${index}`, [true, true, true, true]),
    )
    const board: Board = [...boardFor(crosses), null]
    const result = checkConnectivity(
      board,
      new Map(crosses.map((entry) => [entry.uid, entry])),
      'strict',
    )
    assert.equal(result.unfilled, 1)
    assert.equal(result.launchable, false)
    assert.equal(result.fullyReachable, false)
    assert.equal(result.valid, false)
  })

  it('keeps strict solver and strategy readiness on the safe default', () => {
    const [result] = solve(verticals, emptyBorders(), {}, {
      mode: 'strict',
      allowRotation: false,
      adjacencyMode: 'physical',
      adjacentAffectsSelf: false,
      disabledMods: new Set(),
      topK: 1,
      forceHeuristic: true,
      searchRestarts: 1,
      searchIterations: 0,
      seed: 12,
    })
    assert.equal(result.launchable, true)
    assert.equal(result.fullyReachable, false)
    assert.equal(result.valid, false)

    const inventory = evaluateStrategyInventory(
      emptyBorders(),
      verticalMap,
      verticals,
      {
        mode: 'strict',
        allowRotation: false,
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        disabledMods: new Set(),
      },
    )
    const alcAndGo = inventory.evaluations.find(
      (entry) => entry.strategy.id === 'alc-and-go',
    )
    assert.ok(alcAndGo)
    assert.equal(alcAndGo.potentialLaunchable, true)
    assert.equal(alcAndGo.potentialFullyReachable, false)
    assert.equal(alcAndGo.readiness.ready, false)
    assert.ok(
      alcAndGo.readiness.missing.some((entry) =>
        /fully reachable connector layout/.test(entry),
      ),
    )
  })
})
