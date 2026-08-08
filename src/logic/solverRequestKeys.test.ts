import { describe, expect, it } from 'vitest'
import { defaultStrategyReservations } from '../data/strategies'
import type { ChartData } from '../types'
import { CUSTOM_OPTIONS, customKey, selectPieceBank } from './pieceKeeps'
import { createSolverStateKey, createStrategyInventoryKey } from './solverRequestKeys'

const chart = (overrides: Partial<ChartData> = {}): ChartData => ({
  uid: 'chart-1',
  name: 'Chart One',
  level: 83,
  edges: [true, false, true, false],
  modIds: ['cm-quant-20'],
  ...overrides,
})

const inventoryOptions = {
  mode: 'strict' as const,
  allowRotation: true,
  adjacencyMode: 'physical' as const,
  adjacentAffectsSelf: false,
  disabledMods: new Set<string>(),
  strategyReservations: defaultStrategyReservations(),
}

describe('solver request keys', () => {
  it('ignores chart fields that cannot affect strategy inventory', () => {
    const borders = Array(12).fill(null)
    const original = createStrategyInventoryKey([chart()], borders, inventoryOptions)
    const metadataEdit = createStrategyInventoryKey(
      [
        chart({
          preserved: true,
          rawText: 'updated clipboard text',
          implicitText: 'updated display text',
        }),
      ],
      borders,
      inventoryOptions,
    )

    expect(metadataEdit).toBe(original)
  })

  it('invalidates both keys when level changes which tied chart is banked', () => {
    const borders = Array(12).fill(null)
    const barrelFamily = CUSTOM_OPTIONS.find((option) => option.modIds.includes('adj-barrel-1'))!
    const pieceKeeps = { [customKey('milky-speedrun', barrelFamily.modIds)]: 1 }
    const high = chart({ uid: 'high', level: 83, modIds: ['adj-barrel-2'] })
    const low = chart({ uid: 'low', level: 82, modIds: ['adj-barrel-2'] })
    const originalPool = [high, low]
    const editedPool = [
      { ...high, level: 81 },
      { ...low, level: 84 },
    ]

    expect([
      ...selectPieceBank(originalPool, pieceKeeps, defaultStrategyReservations()).keys(),
    ]).toEqual(['high'])
    expect([
      ...selectPieceBank(editedPool, pieceKeeps, defaultStrategyReservations()).keys(),
    ]).toEqual(['low'])

    const inventory = createStrategyInventoryKey(originalPool, borders, {
      ...inventoryOptions,
      pieceKeeps,
    })
    const changedInventory = createStrategyInventoryKey(editedPool, borders, {
      ...inventoryOptions,
      pieceKeeps,
    })
    const state = {
      pool: originalPool,
      borders,
      mode: 'strict' as const,
      allowRotation: true,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      disabledMods: [],
      strategyReservations: defaultStrategyReservations(),
      pieceKeeps,
    }
    const interactive = createSolverStateKey(state, {}, 'milky-speedrun')
    const changedInteractive = createSolverStateKey(
      { ...state, pool: editedPool },
      {},
      'milky-speedrun',
    )

    expect(changedInventory).not.toBe(inventory)
    expect(changedInteractive).not.toBe(interactive)
  })

  it('invalidates strategy inventory when scoring inputs change', () => {
    const borders = Array(12).fill(null)
    const original = createStrategyInventoryKey([chart()], borders, inventoryOptions)
    const changedEdges = createStrategyInventoryKey(
      [chart({ edges: [true, true, true, false] })],
      borders,
      inventoryOptions,
    )
    const changedDisabledMods = createStrategyInventoryKey([chart()], borders, {
      ...inventoryOptions,
      disabledMods: new Set(['cm-quant-20']),
    })

    expect(changedEdges).not.toBe(original)
    expect(changedDisabledMods).not.toBe(original)
  })

  it('invalidates inventory and interactive results when chart area type changes', () => {
    const borders = Array(12).fill(null)
    const seaPillars = chart({ areaType: 'sea-pillars' })
    const pelagicAbyss = chart({ areaType: 'pelagic-abyss' })
    const inventory = createStrategyInventoryKey([seaPillars], borders, inventoryOptions)
    const changedInventory = createStrategyInventoryKey([pelagicAbyss], borders, inventoryOptions)
    const state = {
      pool: [seaPillars],
      borders,
      mode: 'strict' as const,
      allowRotation: true,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      disabledMods: [],
      strategyReservations: defaultStrategyReservations(),
    }
    const interactive = createSolverStateKey(state, {}, 'divine-border-rares')
    const changedInteractive = createSolverStateKey(
      { ...state, pool: [pelagicAbyss] },
      {},
      'divine-border-rares',
    )

    expect(changedInventory).not.toBe(inventory)
    expect(changedInteractive).not.toBe(interactive)
  })

  it('invalidates interactive results when filler preservation changes', () => {
    const state = {
      pool: [chart()],
      borders: Array(12).fill(null),
      mode: 'strict' as const,
      allowRotation: true,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      disabledMods: [],
      strategyReservations: defaultStrategyReservations(),
    }
    const original = createSolverStateKey(state, {}, null)
    const preserved = createSolverStateKey(
      { ...state, pool: [chart({ preserved: true })] },
      {},
      null,
    )

    expect(preserved).not.toBe(original)
  })

  it('invalidates inventory and interactive results when strategy protections change', () => {
    const borders = Array(12).fill(null)
    const inventory = createStrategyInventoryKey([chart()], borders, inventoryOptions)
    const changedInventory = createStrategyInventoryKey([chart()], borders, {
      ...inventoryOptions,
      strategyReservations: { ...inventoryOptions.strategyReservations, meatfish: false },
    })
    const state = {
      pool: [chart()],
      borders,
      mode: 'strict' as const,
      allowRotation: true,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      disabledMods: [],
      strategyReservations: inventoryOptions.strategyReservations,
    }
    const interactive = createSolverStateKey(state, {}, 'alc-and-go')
    const changedInteractive = createSolverStateKey(
      {
        ...state,
        strategyReservations: { ...state.strategyReservations, meatfish: false },
      },
      {},
      'alc-and-go',
    )

    expect(changedInventory).not.toBe(inventory)
    expect(changedInteractive).not.toBe(interactive)
  })
})
