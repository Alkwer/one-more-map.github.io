import { describe, expect, it } from 'vitest'
import type { AppState } from './storage'
import type { ChartData, ModEffect } from '../types'
import {
  decodeShare,
  decodeState,
  decodeStateJson,
  defaultState,
  encodeShare,
  serializeState,
  STATE_VERSION,
} from './storage'

const chart = (overrides: Partial<ChartData> = {}): ChartData => ({
  uid: 'chart-1',
  name: 'Stored Chart',
  level: 83,
  edges: [true, false, true, false],
  modIds: [],
  shape: 'Straight',
  ...overrides,
})

const persisted = (overrides: Record<string, unknown> = {}) => ({
  ...defaultState(),
  v: STATE_VERSION,
  ...overrides,
})

function decoded(value: unknown) {
  const result = decodeState(value)
  if (!result.ok) throw new Error(result.message)
  return result
}

describe('state decoding', () => {
  it('preserves defaults when optional fields are absent', () => {
    const result = decoded({ v: STATE_VERSION })

    expect(result.state).toEqual(defaultState())
    expect(result.state.allowRotation).toBe(true)
    expect(result.warnings).toEqual([])

    expect(decoded({}).warnings).toContain('unversioned state was migrated')
  })

  it('rejects malformed JSON and non-object roots', () => {
    expect(decodeStateJson('{not json')).toMatchObject({
      ok: false,
      code: 'invalid',
      message: 'file does not contain valid JSON',
    })
    expect(decodeState(null)).toMatchObject({
      ok: false,
      code: 'invalid',
      message: 'state root must be an object',
    })
    expect(decodeState([])).toMatchObject({
      ok: false,
      code: 'invalid',
      message: 'state root must be an object',
    })
    expect(decodeShare(btoa(JSON.stringify({ v: STATE_VERSION, pool: [{}] })))).toBeNull()
  })

  it.each([
    ['pool type', { pool: {} }, 'pool must be an array'],
    ['chart shape', { pool: [{}] }, 'pool[0].uid must be a non-empty string'],
    ['setting type', { allowRotation: 'yes' }, 'allowRotation must be a boolean'],
    [
      'border entry',
      { borders: [{}, ...Array(11).fill(null)] },
      'borders[0] must be a string or null',
    ],
  ])('rejects a valid JSON document with an invalid %s', (_, overrides, message) => {
    expect(decodeState(persisted(overrides))).toMatchObject({
      ok: false,
      code: 'invalid',
      message,
    })
  })

  it('validates nested rewards and weights', () => {
    const invalidReward = chart({
      rewards: [{ stat: 'not-a-stat', percent: 10 } as unknown as ModEffect],
    })
    expect(decodeState(persisted({ pool: [invalidReward] }))).toMatchObject({
      ok: false,
      message: 'pool[0].rewards[0].stat is not a supported reward stat',
    })

    const weightKey = Object.keys(defaultState().weights)[0]
    expect(decodeState(persisted({ weights: { [weightKey]: 'high' } }))).toMatchObject({
      ok: false,
      message: `weights.${weightKey} must be a finite number`,
    })
  })

  it('rejects duplicate chart ids and invalid placements', () => {
    expect(
      decodeState(
        persisted({
          pool: [chart(), chart({ name: 'Duplicate' })],
        }),
      ),
    ).toMatchObject({
      ok: false,
      message: 'pool[1].uid duplicates "chart-1"',
    })

    const board = Array(9).fill(null)
    board[0] = { chartUid: 'chart-1', rotation: 4 }
    expect(decodeState(persisted({ pool: [chart()], board }))).toMatchObject({
      ok: false,
      message: 'board[0].rotation must be an integer from 0 to 3',
    })
  })

  it('removes unknown board references, border ids and modifier ids', () => {
    const board = Array(9).fill(null)
    board[0] = { chartUid: 'missing-chart', rotation: 0 }
    const borders = Array(12).fill(null)
    borders[0] = 'missing-border'
    const result = decoded(
      persisted({
        pool: [chart({ modIds: ['missing-mod'] })],
        board,
        borders,
      }),
    )

    expect(result.state.pool[0].modIds).toEqual([])
    expect(result.state.board).toEqual(Array(9).fill(null))
    expect(result.state.borders).toEqual(Array(12).fill(null))
    expect(result.warnings).toHaveLength(3)
  })

  it('keeps unresolved charts in the library but removes them from the board', () => {
    const unresolved = chart({
      edges: [false, false, false, false],
      shape: undefined,
      shapeResolved: false,
      shapeInput: 'Spiral',
    })
    const board = Array(9).fill(null)
    board[0] = { chartUid: unresolved.uid, rotation: 0 }

    const result = decoded(persisted({ pool: [unresolved], board }))

    expect(result.state.pool).toEqual([unresolved])
    expect(result.state.board).toEqual(Array(9).fill(null))
  })

  it('repairs stale canonical shape labels from valid stored edges', () => {
    const result = decoded(persisted({ pool: [chart({ shape: 'Corner' })] }))

    expect(result.state.pool[0].shape).toBe('Straight')
    expect(result.warnings).toContain('pool[0].shape was repaired from connector edges')
  })

  it('migrates older versions and rejects newer incompatible versions', () => {
    const oldState = persisted({
      v: STATE_VERSION - 1,
      pool: [chart()],
      board: [{ chartUid: 'chart-1', rotation: 0 }, ...Array(8).fill(null)],
      borders: Array(12).fill('legacy-border'),
      allowRotation: false,
      mode: 'connected',
    })
    const migrated = decoded(oldState)

    expect(migrated.state.pool).toEqual([])
    expect(migrated.state.board).toEqual(Array(9).fill(null))
    expect(migrated.state.borders).toEqual(Array(12).fill(null))
    expect(migrated.state.allowRotation).toBe(false)
    expect(migrated.state.mode).toBe('strict')
    expect(migrated.warnings[0]).toContain('reset chart, board and border data')

    expect(decodeState(persisted({ v: STATE_VERSION + 1 }))).toMatchObject({
      ok: false,
      code: 'incompatible',
      message: `state version ${STATE_VERSION + 1} is newer than supported version ${STATE_VERSION}`,
    })
  })

  it('round-trips a normal export and shared URL state', () => {
    const state: AppState = {
      ...defaultState(),
      pool: [chart({ shapeResolved: true, preserved: true })],
      board: [{ chartUid: 'chart-1', rotation: 2 }, ...Array(8).fill(null)],
      borders: ['b-divine', ...Array(11).fill(null)],
      allowRotation: false,
      strategyId: 'alc-and-go',
      borderRerollsUsed: 2,
    }

    const json = serializeState(state, 2)
    expect(JSON.parse(json).v).toBe(STATE_VERSION)
    expect(decoded(JSON.parse(json)).state).toEqual(state)
    expect(decodeShare(encodeShare(state))).toEqual(state)
  })
})
