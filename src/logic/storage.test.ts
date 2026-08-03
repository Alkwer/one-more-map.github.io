import { afterEach, describe, expect, it, vi } from 'vitest'
import englishChart from './__fixtures__/charted.en.txt?raw'
import koreanChart from './__fixtures__/charted.ko.txt?raw'
import type { AppState } from './storage'
import type { ChartData, ModEffect } from '../types'
import {
  decodeState,
  decodeStateFile,
  decodeStateJson,
  defaultState,
  loadLocal,
  MAX_CHART_NAME_LENGTH,
  MAX_MOD_IDS_PER_CHART,
  MAX_POOL_CHARTS,
  MAX_RAW_TEXT_LENGTH,
  MAX_REWARDS_PER_CHART,
  MAX_STATE_JSON_CHARS,
  MAX_STATE_FILE_BYTES,
  saveLocal,
  serializeState,
  STATE_VERSION,
} from './storage'
import { decodeShare } from './share'
import { customKey } from './pieceKeeps'
import { parseChartText } from './parser'

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

afterEach(() => {
  vi.unstubAllGlobals()
})

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
    expect(decodeShare(btoa(JSON.stringify({ v: STATE_VERSION, pool: [{}] })))).toMatchObject({
      ok: false,
    })
  })

  it.each([
    ['pool type', { pool: {} }, 'pool must be an array'],
    ['chart shape', { pool: [{}] }, 'pool[0].uid must be a non-empty string'],
    ['setting type', { allowRotation: 'yes' }, 'allowRotation must be a boolean'],
    [
      'strategy reservation type',
      { strategyReservations: { meatfish: 'no' } },
      'meatfish must be a boolean',
    ],
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

  it('validates optional chart area types', () => {
    expect(decoded(persisted({ pool: [chart()] })).state.pool[0].areaType).toBeUndefined()
    expect(
      decoded(persisted({ pool: [chart({ areaType: 'sea-pillars' })] })).state.pool[0].areaType,
    ).toBe('sea-pillars')
    expect(
      decodeState(persisted({ pool: [{ ...chart(), areaType: 'unsupported-area' }] })),
    ).toMatchObject({
      ok: false,
      message: 'pool[0].areaType is not supported',
    })
    expect(decodeState(persisted({ pool: [{ ...chart(), areaType: 42 }] }))).toMatchObject({
      ok: false,
      message: 'pool[0].areaType must be a string',
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

  it('defaults missing strategy protections and preserves explicit choices', () => {
    expect(decoded({ v: STATE_VERSION }).state.strategyReservations).toEqual(
      defaultState().strategyReservations,
    )

    expect(
      decoded(
        persisted({
          strategyReservations: { divine: false, meatfish: true, ethereal: false },
        }),
      ).state.strategyReservations,
    ).toEqual({
      genericStrongboxes: false,
      divinerStrongboxes: true,
      arcanistStrongboxes: true,
      operativeStrongboxes: true,
      messages: true,
      starfish: true,
      globalRares: true,
      adjacentRares: false,
      seaPillars: true,
      pelagicAbyss: false,
      meatfish: true,
      ethereal: false,
    })

    expect(
      decoded(
        persisted({
          strategyReservations: {
            speedrun: false,
            divine: true,
            meatfish: false,
            ethereal: false,
          },
        }),
      ).state.strategyReservations,
    ).toEqual({
      genericStrongboxes: true,
      divinerStrongboxes: true,
      arcanistStrongboxes: true,
      operativeStrongboxes: true,
      messages: false,
      starfish: true,
      globalRares: true,
      adjacentRares: true,
      seaPillars: true,
      pelagicAbyss: true,
      meatfish: false,
      ethereal: false,
    })

    const granular = {
      ...defaultState().strategyReservations,
      divinerStrongboxes: false,
      starfish: false,
      adjacentRares: false,
    }
    expect(
      decoded(persisted({ strategyReservations: granular })).state.strategyReservations,
    ).toEqual(granular)
  })

  it('migrates broad Divine keep overrides to every granular subtype', () => {
    const oldFeeders = 'divine-border-rares:adj-star-1|adj-star-2|adj-box-1|adj-box-2|adj-box-3'
    const oldRares = 'divine-border-rares:adj-rare-1|adj-rare-2|voy-rare'
    const oldStrongboxes =
      'cutedog-divine-boxes:adj-box-1|adj-box-2|adj-box-3|adj-divbox-1|adj-divbox-2|adj-arcbox-1|adj-arcbox-2|adj-opbox-1|adj-opbox-2'
    const result = decoded(
      persisted({
        pieceKeeps: {
          [oldFeeders]: 2,
          [oldRares]: 4,
          [oldStrongboxes]: 1,
          // A value saved by the granular UI must not be overwritten.
          'divine-border-rares:adj-star-1|adj-star-2': 7,
        },
      }),
    )

    expect(result.state.pieceKeeps).toEqual({
      'divine-border-rares:adj-star-1|adj-star-2': 7,
      'divine-border-rares:adj-box-2|adj-box-3': 2,
      'divine-border-rares:adj-box-1': 2,
      'divine-border-rares:voy-rare': 4,
      'divine-border-rares:adj-rare-1|adj-rare-2': 4,
      'cutedog-divine-boxes:adj-divbox-1|adj-divbox-2': 1,
      'cutedog-divine-boxes:adj-arcbox-1|adj-arcbox-2': 1,
      'cutedog-divine-boxes:adj-opbox-1|adj-opbox-2': 1,
    })
    expect(result.warnings).toEqual([
      `pieceKeeps.${oldFeeders} was migrated to granular chart types`,
      `pieceKeeps.${oldRares} was migrated to granular chart types`,
      `pieceKeeps.${oldStrongboxes} was migrated to granular chart types`,
    ])
  })

  it('round-trips user-added chart types', () => {
    const state = defaultState()
    state.pieceKeeps = {
      [customKey('milky-ethereal', ['adj-barrel-1', 'adj-barrel-2'])]: 2,
    }

    expect(decoded(JSON.parse(serializeState(state))).state.pieceKeeps).toEqual(state.pieceKeeps)
  })

  it('round-trips a normal export state', () => {
    const state: AppState = {
      ...defaultState(),
      pool: [chart({ shapeResolved: true, preserved: true })],
      board: [{ chartUid: 'chart-1', rotation: 2 }, ...Array(8).fill(null)],
      borders: ['b-divine', ...Array(11).fill(null)],
      allowRotation: false,
      strategyId: 'alc-and-go',
      strategyReservations: {
        ...defaultState().strategyReservations,
        messages: false,
        starfish: false,
        adjacentRares: false,
      },
      borderRerollsUsed: 2,
    }

    const json = serializeState(state, 2)
    expect(JSON.parse(json).v).toBe(STATE_VERSION)
    expect(decoded(JSON.parse(json)).state).toEqual(state)
  })

  it.each([
    ['English', englishChart, 'undersea-groves'],
    ['Korean', koreanChart, 'seafloor-ridges'],
  ])('preserves %s chart area types through JSON and local storage', (_, source, areaType) => {
    const parsed = parseChartText(source)
    expect(parsed.rejected).toEqual([])
    expect(parsed.charts).toHaveLength(1)
    expect(parsed.charts[0].areaType).toBe(areaType)

    const state = { ...defaultState(), pool: parsed.charts }
    const jsonResult = decodeStateJson(serializeState(state))
    expect(jsonResult).toMatchObject({
      ok: true,
      state: { pool: [expect.objectContaining({ areaType })] },
    })

    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    saveLocal(state)

    expect(loadLocal()?.pool[0].areaType).toBe(areaType)
  })

  it('enforces state resource limits at their boundaries', () => {
    const charts = Array.from({ length: MAX_POOL_CHARTS }, (_, index) =>
      chart({ uid: `chart-${index}` }),
    )
    expect(decodeState(persisted({ pool: charts }))).toMatchObject({ ok: true })
    expect(
      decodeState(persisted({ pool: [...charts, chart({ uid: 'one-too-many' })] })),
    ).toMatchObject({
      ok: false,
      message: `pool must contain at most ${MAX_POOL_CHARTS} charts`,
    })

    expect(
      decodeState(persisted({ pool: [chart({ name: 'n'.repeat(MAX_CHART_NAME_LENGTH) })] })),
    ).toMatchObject({ ok: true })
    expect(
      decodeState(persisted({ pool: [chart({ name: 'n'.repeat(MAX_CHART_NAME_LENGTH + 1) })] })),
    ).toMatchObject({
      ok: false,
      message: `pool[0].name must be at most ${MAX_CHART_NAME_LENGTH} characters`,
    })

    expect(
      decodeState(
        persisted({
          pool: [chart({ rawText: 'r'.repeat(MAX_RAW_TEXT_LENGTH) })],
        }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      decodeState(
        persisted({
          pool: [chart({ rawText: 'r'.repeat(MAX_RAW_TEXT_LENGTH + 1) })],
        }),
      ),
    ).toMatchObject({
      ok: false,
      message: `pool[0].rawText must be at most ${MAX_RAW_TEXT_LENGTH} characters`,
    })

    expect(
      decodeState(
        persisted({
          pool: [chart({ modIds: Array(MAX_MOD_IDS_PER_CHART).fill('adj-star-1') })],
        }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      decodeState(
        persisted({
          pool: [chart({ modIds: Array(MAX_MOD_IDS_PER_CHART + 1).fill('adj-star-1') })],
        }),
      ),
    ).toMatchObject({
      ok: false,
      message: `pool[0].modIds must contain at most ${MAX_MOD_IDS_PER_CHART} entries`,
    })

    const reward = { stat: 'quantity' as const, percent: 1 }
    expect(
      decodeState(
        persisted({ pool: [chart({ rewards: Array(MAX_REWARDS_PER_CHART).fill(reward) })] }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      decodeState(
        persisted({ pool: [chart({ rewards: Array(MAX_REWARDS_PER_CHART + 1).fill(reward) })] }),
      ),
    ).toMatchObject({
      ok: false,
      message: `pool[0].rewards must contain at most ${MAX_REWARDS_PER_CHART} entries`,
    })
  })

  it('rejects oversized JSON before parsing it', () => {
    const maximum = `{${' '.repeat(MAX_STATE_JSON_CHARS - 2)}}`
    expect(decodeStateJson(maximum)).toMatchObject({ ok: true })
    expect(decodeStateJson(`${maximum} `)).toMatchObject({
      ok: false,
      message: `state JSON exceeds the ${MAX_STATE_JSON_CHARS}-character limit`,
    })
  })

  it('rejects oversized files before reading their contents', async () => {
    const maximumText = vi.fn(async () => '{}')
    await expect(
      decodeStateFile({ size: MAX_STATE_FILE_BYTES, text: maximumText }),
    ).resolves.toMatchObject({ ok: true })
    expect(maximumText).toHaveBeenCalledOnce()

    const oversizedText = vi.fn(async () => '{}')

    await expect(
      decodeStateFile({ size: MAX_STATE_FILE_BYTES + 1, text: oversizedText }),
    ).resolves.toMatchObject({
      ok: false,
      message: 'file exceeds the 2 MiB size limit',
    })
    expect(oversizedText).not.toHaveBeenCalled()
  })
})
