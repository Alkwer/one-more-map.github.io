import { strategyById } from '../data/strategies'
import type {
  Borders,
  ChartAreaType,
  ChartData,
  ConnectivityMode,
  Edges,
  ModEffect,
  Weights,
} from '../types'
import type { AdjacencyMode } from './scoring'
import {
  decodeState,
  decodeStateJson,
  defaultState,
  STATE_VERSION,
  type AppState,
  type StateDecodeErrorCode,
} from './storage'

export const SHARE_VERSION = 1
export const SHARE_PREFIX = `layout.v${SHARE_VERSION}.`
export const MAX_SHARE_HASH_LENGTH = 16 * 1024
export const MAX_LEGACY_SHARE_HASH_LENGTH = 256 * 1024

interface SharedChart {
  name: string
  level: number
  edges: Edges
  areaType?: ChartAreaType
  modIds: string[]
  rewards?: ModEffect[]
}

interface SharedCell {
  rotation: number
  chart: SharedChart
}

interface LayoutSharePayloadV1 {
  v: 1
  cells: (SharedCell | null)[]
  borders: Borders
  scoring: {
    weights: Weights
    mode: ConnectivityMode
    adjacencyMode: AdjacencyMode
    adjacentAffectsSelf: boolean
    disabledMods: string[]
  }
}

export type ShareDecodeErrorCode = StateDecodeErrorCode | 'too-large'

export type ShareDecodeResult =
  | {
      ok: true
      state: AppState
      warnings: string[]
      format: 'layout-v1' | 'legacy-v3'
    }
  | { ok: false; code: ShareDecodeErrorCode; message: string }

export class ShareEncodeError extends Error {}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const invalid = (message: string): ShareDecodeResult => ({
  ok: false,
  code: 'invalid',
  message,
})

const incompatible = (message: string): ShareDecodeResult => ({
  ok: false,
  code: 'incompatible',
  message,
})

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Text(encoded: string, urlSafe: boolean): string {
  let base64 = encoded
  if (urlSafe) {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
      throw new Error('malformed Base64URL')
    }
    base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    base64 += '='.repeat((4 - (base64.length % 4)) % 4)
  } else if (
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
    /=/.test(encoded.slice(0, -2))
  ) {
    throw new Error('malformed Base64')
  }

  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function hasOwn(object: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function decodeLayoutPayload(value: unknown): ShareDecodeResult {
  if (!isRecord(value)) return invalid('share payload root must be an object')
  if (value.v !== SHARE_VERSION) {
    if (typeof value.v === 'number' && value.v > SHARE_VERSION) {
      return incompatible(
        `share version ${value.v} is newer than supported version ${SHARE_VERSION}`,
      )
    }
    return invalid(`share payload must use version ${SHARE_VERSION}`)
  }
  if (!Array.isArray(value.cells) || value.cells.length !== 9) {
    return invalid('share payload must contain exactly nine board cells')
  }
  if (!hasOwn(value, 'borders')) return invalid('share payload is missing borders')
  if (!isRecord(value.scoring)) return invalid('share payload scoring must be an object')
  for (const field of ['weights', 'mode', 'adjacencyMode', 'adjacentAffectsSelf', 'disabledMods']) {
    if (!hasOwn(value.scoring, field)) return invalid(`share payload scoring is missing ${field}`)
  }

  const pool: UnknownRecord[] = []
  const board: unknown[] = []
  for (const [index, rawCell] of value.cells.entries()) {
    if (rawCell === null) {
      board.push(null)
      continue
    }
    if (!isRecord(rawCell) || !isRecord(rawCell.chart)) {
      return invalid(`share payload cells[${index}] must contain a chart`)
    }
    const uid = `shared-${index}`
    const rawChart = rawCell.chart
    const chart: UnknownRecord = {
      uid,
      name: rawChart.name,
      level: rawChart.level,
      edges: rawChart.edges,
      modIds: rawChart.modIds,
    }
    if (hasOwn(rawChart, 'areaType')) chart.areaType = rawChart.areaType
    if (hasOwn(rawChart, 'rewards')) chart.rewards = rawChart.rewards
    pool.push(chart)
    board.push({ chartUid: uid, rotation: rawCell.rotation })
  }

  const defaults = defaultState()
  const decoded = decodeState({
    ...defaults,
    v: STATE_VERSION,
    pool,
    board,
    borders: value.borders,
    weights: value.scoring.weights,
    mode: value.scoring.mode,
    adjacencyMode: value.scoring.adjacencyMode,
    adjacentAffectsSelf: value.scoring.adjacentAffectsSelf,
    disabledMods: value.scoring.disabledMods,
    strategyId: null,
    strategyReservations: defaults.strategyReservations,
    pieceKeeps: {},
    borderRerollsUsed: 0,
  })
  if (!decoded.ok) return decoded
  return {
    ok: true,
    state: decoded.state,
    warnings: decoded.warnings,
    format: 'layout-v1',
  }
}

function sharedChart(chart: ChartData): SharedChart {
  const result: SharedChart = {
    name: chart.name,
    level: chart.level,
    edges: [...chart.edges] as Edges,
    modIds: [...chart.modIds],
  }
  if (chart.areaType !== undefined) result.areaType = chart.areaType
  if (chart.rewards !== undefined) {
    result.rewards = chart.rewards.map((reward) => ({ ...reward }))
  }
  return result
}

export function encodeShare(state: AppState): string {
  const chartMap = new Map(state.pool.map((chart) => [chart.uid, chart]))
  const relevantModIds = new Set(state.borders.filter((id): id is string => id !== null))
  const cells: (SharedCell | null)[] = state.board.map((placement, index) => {
    if (!placement) return null
    const chart = chartMap.get(placement.chartUid)
    if (!chart) {
      throw new ShareEncodeError(`Board cell ${index + 1} references a missing chart`)
    }
    for (const id of chart.modIds) relevantModIds.add(id)
    return {
      rotation: placement.rotation,
      chart: sharedChart(chart),
    }
  })

  const activeStrategy = state.strategyId ? strategyById.get(state.strategyId) : undefined
  const effectiveWeights = activeStrategy
    ? Object.fromEntries(
        Object.keys(state.weights).map((key) => [key, activeStrategy.weights[key] ?? 0]),
      )
    : state.weights
  const payload: LayoutSharePayloadV1 = {
    v: SHARE_VERSION,
    cells,
    borders: [...state.borders],
    scoring: {
      weights: { ...effectiveWeights },
      mode: state.mode,
      adjacencyMode: state.adjacencyMode,
      adjacentAffectsSelf: state.adjacentAffectsSelf,
      disabledMods: state.disabledMods.filter((id) => relevantModIds.has(id)),
    },
  }

  const validation = decodeLayoutPayload(payload)
  if (!validation.ok) throw new ShareEncodeError(validation.message)

  const hash = `${SHARE_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    throw new ShareEncodeError(
      `Shared layout exceeds the ${MAX_SHARE_HASH_LENGTH}-character link limit`,
    )
  }
  return hash
}

export function decodeShare(hash: string): ShareDecodeResult {
  if (!hash) return invalid('share link is empty')

  if (hash.startsWith('layout.') && !hash.startsWith(SHARE_PREFIX)) {
    return incompatible('share link uses an unsupported layout version')
  }

  if (hash.startsWith(SHARE_PREFIX)) {
    if (hash.length > MAX_SHARE_HASH_LENGTH) {
      return {
        ok: false,
        code: 'too-large',
        message: `share link exceeds the ${MAX_SHARE_HASH_LENGTH}-character limit`,
      }
    }
    try {
      const json = decodeBase64Text(hash.slice(SHARE_PREFIX.length), true)
      return decodeLayoutPayload(JSON.parse(json))
    } catch {
      return invalid('share link contains malformed Base64URL or JSON')
    }
  }

  if (hash.length > MAX_LEGACY_SHARE_HASH_LENGTH) {
    return {
      ok: false,
      code: 'too-large',
      message: `legacy share link exceeds the ${MAX_LEGACY_SHARE_HASH_LENGTH}-character limit`,
    }
  }
  try {
    const json = decodeBase64Text(hash, false)
    const decoded = decodeStateJson(json)
    if (!decoded.ok) return decoded
    return {
      ok: true,
      state: decoded.state,
      warnings: decoded.warnings,
      format: 'legacy-v3',
    }
  } catch {
    return invalid('share link contains malformed Base64 or JSON')
  }
}
