import { describe, expect, it } from 'vitest'
import type { ChartData } from '../types'
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
  strategyReservations: { speedrun: true, divine: true, meatfish: true, ethereal: true },
}

describe('solver request keys', () => {
  it('ignores chart fields that cannot affect strategy inventory', () => {
    const borders = Array(12).fill(null)
    const original = createStrategyInventoryKey([chart()], borders, inventoryOptions)
    const metadataEdit = createStrategyInventoryKey(
      [
        chart({
          level: 70,
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

  it('invalidates interactive results when filler preservation changes', () => {
    const state = {
      pool: [chart()],
      borders: Array(12).fill(null),
      mode: 'strict' as const,
      allowRotation: true,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      disabledMods: [],
      strategyReservations: { speedrun: true, divine: true, meatfish: true, ethereal: true },
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
