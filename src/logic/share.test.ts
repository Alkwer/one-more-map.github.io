import { describe, expect, it } from 'vitest'
import { strategyById } from '../data/strategies'
import englishChart from './__fixtures__/charted.en.txt?raw'
import koreanChart from './__fixtures__/charted.ko.txt?raw'
import type { ChartData, ModEffect } from '../types'
import { parseChartText } from './parser'
import {
  decodeShare,
  encodeShare,
  MAX_LEGACY_SHARE_HASH_LENGTH,
  MAX_SHARE_HASH_LENGTH,
  SHARE_PREFIX,
  ShareEncodeError,
} from './share'
import { defaultState, serializeState, type AppState } from './storage'

const chart = (uid: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name: `Stored Chart ${uid}`,
  level: 83,
  edges: [true, false, true, false],
  areaType: 'sea-pillars',
  modIds: ['adj-star-1'],
  shape: 'Straight',
  ...overrides,
})

function encodeText(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const base64 = btoa(binary)
  return urlSafe ? base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : base64
}

function decodePayload(hash: string): unknown {
  const encoded = hash.slice(SHARE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
  const binary = atob(padded)
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))),
  )
}

function layoutHash(payload: unknown): string {
  return `${SHARE_PREFIX}${encodeText(JSON.stringify(payload), true)}`
}

function decodedState(hash: string): AppState {
  const result = decodeShare(hash)
  if (!result.ok) throw new Error(result.message)
  return result.state
}

describe('layout sharing', () => {
  it('shares only placed chart data and score inputs', () => {
    const state = defaultState()
    state.pool = [
      chart('placed-private-uid', {
        name: 'Zażółć Gęślą Chart',
        rawText: 'PRIVATE COMPLETE ITEM TEXT',
        implicitText: 'Private verbatim implicit',
        shapeInput: 'Private connector input',
        preserved: true,
        rewards: [{ stat: 'quantity', percent: 123 }],
      }),
      chart('unplaced-private-uid', { name: 'UNPLACED SECRET CHART' }),
    ]
    state.board[0] = { chartUid: 'placed-private-uid', rotation: 2 }
    state.borders[0] = 'b-divine'
    state.disabledMods = ['adj-star-1', 'voy-rare']
    state.strategyId = 'alc-and-go'
    state.pieceKeeps = { privatePreference: 99 }
    state.borderRerollsUsed = 4

    const hash = encodeShare(state)
    const serializedPayload = JSON.stringify(decodePayload(hash))

    expect(hash).toMatch(/^layout\.v1\.[A-Za-z0-9_-]+$/)
    expect(serializedPayload).not.toContain('PRIVATE COMPLETE ITEM TEXT')
    expect(serializedPayload).not.toContain('Private verbatim implicit')
    expect(serializedPayload).not.toContain('Private connector input')
    expect(serializedPayload).not.toContain('UNPLACED SECRET CHART')
    expect(serializedPayload).not.toContain('placed-private-uid')
    expect(serializedPayload).not.toContain('pieceKeeps')
    expect(serializedPayload).not.toContain('borderRerollsUsed')

    const shared = decodedState(hash)
    expect(shared.pool).toEqual([
      expect.objectContaining({
        uid: 'shared-0',
        name: 'Zażółć Gęślą Chart',
        areaType: 'sea-pillars',
        rewards: [{ stat: 'quantity', percent: 123 }],
      }),
    ])
    expect(shared.pool[0]).not.toHaveProperty('rawText')
    expect(shared.pool[0]).not.toHaveProperty('implicitText')
    expect(shared.pool[0]).not.toHaveProperty('preserved')
    expect(shared.board[0]).toEqual({ chartUid: 'shared-0', rotation: 2 })
    expect(shared.disabledMods).toEqual(['adj-star-1'])
    expect(shared.strategyId).toBeNull()
    expect(shared.pieceKeeps).toEqual({})
    expect(shared.borderRerollsUsed).toBe(0)
    const strategyWeights = strategyById.get('alc-and-go')!.weights
    expect(shared.weights).toEqual(
      Object.fromEntries(Object.keys(state.weights).map((key) => [key, strategyWeights[key] ?? 0])),
    )
  })

  it('round-trips the maximum nine shared cells with URL-safe Unicode encoding', () => {
    const state = defaultState()
    state.pool = Array.from({ length: 9 }, (_, index) =>
      chart(`chart-${index}`, { name: `해도 ${index + 1}` }),
    )
    state.board = state.pool.map((entry, index) => ({
      chartUid: entry.uid,
      rotation: index % 4,
    }))

    const hash = encodeShare(state)
    const result = decodeShare(hash)

    expect(hash.length).toBeLessThanOrEqual(MAX_SHARE_HASH_LENGTH)
    expect(result).toMatchObject({ ok: true, format: 'layout-v1' })
    if (!result.ok) return
    expect(result.state.pool).toHaveLength(9)
    expect(result.state.pool.map((entry) => entry.name)).toEqual(
      state.pool.map((entry) => entry.name),
    )
    expect(result.state.board.map((placement) => placement?.rotation)).toEqual(
      state.board.map((placement) => placement?.rotation),
    )
  })

  it.each([
    ['English', englishChart, 'undersea-groves'],
    ['Korean', koreanChart, 'seafloor-ridges'],
  ])('preserves %s chart area types through shared layouts', (_, source, areaType) => {
    const parsed = parseChartText(source)
    expect(parsed.rejected).toEqual([])
    expect(parsed.charts).toHaveLength(1)
    expect(parsed.charts[0].areaType).toBe(areaType)

    const state = defaultState()
    state.pool = parsed.charts
    state.board[0] = { chartUid: parsed.charts[0].uid, rotation: 0 }

    const result = decodeShare(encodeShare(state))

    expect(result).toMatchObject({
      ok: true,
      state: { pool: [expect.objectContaining({ areaType })] },
    })
  })

  it('keeps bounded legacy v3 links compatible', () => {
    const state = defaultState()
    state.pool = [chart('legacy-chart', { rawText: 'legacy raw text' })]
    state.board[0] = { chartUid: 'legacy-chart', rotation: 1 }
    const legacyHash = encodeText(serializeState(state), false)

    const result = decodeShare(legacyHash)

    expect(result).toMatchObject({ ok: true, format: 'legacy-v3', state })
  })

  it('rejects malformed, future, and oversized hashes before revival', () => {
    expect(decodeShare(`${SHARE_PREFIX}not*base64`)).toMatchObject({
      ok: false,
      code: 'invalid',
      message: 'share link contains malformed Base64URL or JSON',
    })
    expect(decodeShare('layout.v2.anything')).toMatchObject({
      ok: false,
      code: 'incompatible',
    })
    expect(decodeShare('%%%%')).toMatchObject({ ok: false, code: 'invalid' })
    expect(decodeShare(`${SHARE_PREFIX}${'a'.repeat(MAX_SHARE_HASH_LENGTH)}`)).toMatchObject({
      ok: false,
      code: 'too-large',
    })
    expect(decodeShare('A'.repeat(MAX_LEGACY_SHARE_HASH_LENGTH + 4))).toMatchObject({
      ok: false,
      code: 'too-large',
    })
  })

  it('rejects structurally excessive share payloads', () => {
    const payload = {
      v: 1,
      cells: Array(10).fill(null),
      borders: Array(12).fill(null),
      scoring: {
        weights: {},
        mode: 'strict',
        adjacencyMode: 'physical',
        adjacentAffectsSelf: false,
        disabledMods: [],
      },
    }

    expect(decodeShare(layoutHash(payload))).toMatchObject({
      ok: false,
      message: 'share payload must contain exactly nine board cells',
    })
  })

  it('refuses valid but over-budget generated layouts', () => {
    const rewards: ModEffect[] = Array.from({ length: 64 }, () => ({
      stat: 'quantity',
      percent: 1,
    }))
    const state = defaultState()
    state.pool = Array.from({ length: 9 }, (_, index) => chart(`chart-${index}`, { rewards }))
    state.board = state.pool.map((entry) => ({ chartUid: entry.uid, rotation: 0 }))

    expect(() => encodeShare(state)).toThrow(ShareEncodeError)
    expect(() => encodeShare(state)).toThrow(/link limit/)
  })
})
