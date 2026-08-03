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
  MAX_POOL_CHARTS,
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

export type ShareMergeResult = { ok: true; state: AppState } | { ok: false; message: string }

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

function chartMergeKey(chart: ChartData): string {
  const rewards = chart.rewards
    ?.map((reward) => ({ ...reward }))
    .sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
  return JSON.stringify({
    name: chart.name,
    level: chart.level,
    edges: chart.edges,
    areaType: chart.areaType ?? null,
    modIds: [...chart.modIds].sort(),
    rewards: rewards ?? null,
  })
}

function nextMergedChartUid(usedUids: Set<string>, start: number): [string, number] {
  let index = start
  while (usedUids.has(`shared-import-${index}`)) index++
  return [`shared-import-${index}`, index + 1]
}

/** Keep the recipient's library while adopting the shared board and scoring inputs. */
export function mergeSharedLayout(saved: AppState, shared: AppState): ShareMergeResult {
  const availableSavedCharts = new Map<string, ChartData[]>()
  for (const chart of saved.pool) {
    const key = chartMergeKey(chart)
    const matches = availableSavedCharts.get(key) ?? []
    matches.push(chart)
    availableSavedCharts.set(key, matches)
  }

  const uidMap = new Map<string, string>()
  const chartsToAdd: ChartData[] = []
  for (const chart of shared.pool) {
    const matches = availableSavedCharts.get(chartMergeKey(chart))
    const existing = matches?.shift()
    if (existing) uidMap.set(chart.uid, existing.uid)
    else chartsToAdd.push(chart)
  }

  const availableSlots = Math.max(0, MAX_POOL_CHARTS - saved.pool.length)
  if (chartsToAdd.length > availableSlots) {
    return {
      ok: false,
      message: `The shared layout needs ${chartsToAdd.length} new chart${chartsToAdd.length === 1 ? '' : 's'}, but your library has room for ${availableSlots}. Remove charts or replace your saved state instead.`,
    }
  }

  const usedUids = new Set(saved.pool.map((chart) => chart.uid))
  let nextUid = 1
  const addedCharts = chartsToAdd.map((chart) => {
    const [uid, followingUid] = nextMergedChartUid(usedUids, nextUid)
    nextUid = followingUid
    usedUids.add(uid)
    uidMap.set(chart.uid, uid)
    return { ...chart, uid }
  })

  return {
    ok: true,
    state: {
      ...shared,
      pool: [...saved.pool, ...addedCharts],
      board: shared.board.map((placement) =>
        placement ? { ...placement, chartUid: uidMap.get(placement.chartUid)! } : null,
      ),
      allowRotation: saved.allowRotation,
      strategyReservations: saved.strategyReservations,
      pieceKeeps: saved.pieceKeeps,
    },
  }
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
