import type { AdjacencyMode } from './scoring'
import { borderModById, voyageModById } from '../data/mods'
import {
  defaultStrategyReservations,
  strategyById,
  type StrategyReservationPreferences,
} from '../data/strategies'
import type {
  Board,
  Borders,
  ChartData,
  ChartShape,
  ConnectivityMode,
  Edges,
  ModEffect,
  Stat,
  Weights,
} from '../types'
import { ALL_STATS, emptyBoard, emptyBorders } from '../types'
import { CHART_SHAPES, chartShapeForEdges, isChartShapeResolved } from './chartShapes'
import { DEFAULT_WEIGHTS } from './rewards'

export interface AppState {
  pool: ChartData[]
  board: Board
  borders: Borders
  weights: Weights
  mode: ConnectivityMode
  allowRotation: boolean
  adjacencyMode: AdjacencyMode
  adjacentAffectsSelf: boolean
  /** mod ids the user has switched off; they contribute nothing to any scoring */
  disabledMods: string[]
  /** active curated strategy id (overrides weights + shapes the solver) or null */
  strategyId: string | null
  /** keeper categories excluded from low-investment strategy solve pools */
  strategyReservations: StrategyReservationPreferences
  /** paid border rerolls recorded for the current Voyage board (0–5 assumed cap) */
  borderRerollsUsed: number
}

export const defaultState = (): AppState => ({
  pool: [],
  board: emptyBoard(),
  borders: emptyBorders(),
  weights: { ...DEFAULT_WEIGHTS },
  mode: 'strict', // confirmed rule: adjacent connectors must match, all 9 filled
  allowRotation: true, // rotation confirmed in game
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: [],
  strategyId: null,
  strategyReservations: defaultStrategyReservations(),
  borderRerollsUsed: 0,
})

const LS_KEY = 'allflame-voyage-solver'
/** bump only when chart/board data (mod ids) changes incompatibly */
export const STATE_VERSION = 3 // v3: full datamined mod pools

type UnknownRecord = Record<string, unknown>

export type StateDecodeErrorCode = 'invalid' | 'incompatible'

export type StateDecodeResult =
  | { ok: true; state: AppState; warnings: string[] }
  | { ok: false; code: StateDecodeErrorCode; message: string }

class StateDecodeError extends Error {
  constructor(
    readonly code: StateDecodeErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const knownModifierIds = new Set([...voyageModById.keys(), ...borderModById.keys()])
const knownStats = new Set<Stat>(ALL_STATS)
const knownShapes = new Set<ChartShape>(CHART_SHAPES)
const knownWeightKeys = new Set(Object.keys(DEFAULT_WEIGHTS))

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function fail(message: string): never {
  throw new StateDecodeError('invalid', message)
}

function incompatible(message: string): never {
  throw new StateDecodeError('incompatible', message)
}

function optionalBoolean(object: UnknownRecord, key: string, fallback: boolean): boolean {
  const value = object[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(`${key} must be a boolean`)
  return value
}

function optionalString(object: UnknownRecord, key: string, path: string): string | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') fail(`${path}.${key} must be a string`)
  return value
}

function decodeVersion(object: UnknownRecord): number | null {
  const version = object.v
  if (version === undefined) return null
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail('v must be a positive integer')
  }
  if (version > STATE_VERSION) {
    incompatible(`state version ${version} is newer than supported version ${STATE_VERSION}`)
  }
  return version
}

function decodeRewards(value: unknown, path: string): ModEffect[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) fail(`${path} must be an array`)
  return value.map((rawEffect, index) => {
    const effectPath = `${path}[${index}]`
    if (!isRecord(rawEffect)) fail(`${effectPath} must be an object`)
    if (typeof rawEffect.stat !== 'string' || !knownStats.has(rawEffect.stat as Stat)) {
      fail(`${effectPath}.stat is not a supported reward stat`)
    }
    if (typeof rawEffect.percent !== 'number' || !Number.isFinite(rawEffect.percent)) {
      fail(`${effectPath}.percent must be a finite number`)
    }
    return {
      stat: rawEffect.stat as Stat,
      percent: rawEffect.percent,
    }
  })
}

function decodeChart(value: unknown, index: number, warnings: string[]): ChartData {
  const path = `pool[${index}]`
  if (!isRecord(value)) fail(`${path} must be an object`)
  if (typeof value.uid !== 'string' || value.uid.trim() === '') {
    fail(`${path}.uid must be a non-empty string`)
  }
  if (typeof value.name !== 'string') fail(`${path}.name must be a string`)
  if (typeof value.level !== 'number' || !Number.isFinite(value.level)) {
    fail(`${path}.level must be a finite number`)
  }
  if (
    !Array.isArray(value.edges) ||
    value.edges.length !== 4 ||
    value.edges.some((edge) => typeof edge !== 'boolean')
  ) {
    fail(`${path}.edges must contain exactly four booleans`)
  }
  if (!Array.isArray(value.modIds) || value.modIds.some((id) => typeof id !== 'string')) {
    fail(`${path}.modIds must be an array of strings`)
  }

  const edges = [...value.edges] as Edges
  const inferredShape = chartShapeForEdges(edges)
  const rawShape = value.shape
  let storedShape: ChartShape | undefined
  if (rawShape !== undefined) {
    if (typeof rawShape !== 'string' || !knownShapes.has(rawShape as ChartShape)) {
      fail(`${path}.shape is not supported`)
    }
    storedShape = rawShape as ChartShape
  }

  const rawShapeResolved = value.shapeResolved
  if (rawShapeResolved !== undefined && typeof rawShapeResolved !== 'boolean') {
    fail(`${path}.shapeResolved must be a boolean`)
  }
  if (rawShapeResolved !== false && !inferredShape) {
    fail(`${path}.edges do not describe a supported resolved chart shape`)
  }

  const seenModIds = new Set<string>()
  const modIds = value.modIds.filter((id): id is string => {
    if (typeof id !== 'string' || seenModIds.has(id)) return false
    seenModIds.add(id)
    if (!voyageModById.has(id)) {
      warnings.push(`${path}.modIds removed unknown id "${id}"`)
      return false
    }
    return true
  })

  const level = Math.max(1, Math.min(100, Math.floor(value.level)))
  if (level !== value.level) {
    warnings.push(`${path}.level was normalized to ${level}`)
  }

  const chart: ChartData = {
    uid: value.uid,
    name: value.name,
    level,
    edges,
    modIds,
  }

  const implicitText = optionalString(value, 'implicitText', path)
  const shapeInput = optionalString(value, 'shapeInput', path)
  const rawText = optionalString(value, 'rawText', path)
  const rewards = decodeRewards(value.rewards, `${path}.rewards`)
  const preserved = value.preserved
  if (preserved !== undefined && typeof preserved !== 'boolean') {
    fail(`${path}.preserved must be a boolean`)
  }

  if (implicitText !== undefined) chart.implicitText = implicitText
  if (rewards !== undefined) chart.rewards = rewards
  if (rawShapeResolved === false) {
    chart.shapeResolved = false
    if (storedShape !== undefined) chart.shape = storedShape
    if (shapeInput !== undefined) chart.shapeInput = shapeInput
  } else {
    chart.shape = inferredShape
    if (rawShapeResolved !== undefined) chart.shapeResolved = true
    if (storedShape !== undefined && storedShape !== inferredShape) {
      warnings.push(`${path}.shape was repaired from connector edges`)
    }
  }
  if (rawText !== undefined) chart.rawText = rawText
  if (preserved !== undefined) chart.preserved = preserved

  return chart
}

function decodePool(value: unknown, warnings: string[]): ChartData[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail('pool must be an array')
  const seenUids = new Set<string>()
  return value.map((rawChart, index) => {
    const chart = decodeChart(rawChart, index, warnings)
    if (seenUids.has(chart.uid)) {
      fail(`pool[${index}].uid duplicates "${chart.uid}"`)
    }
    seenUids.add(chart.uid)
    return chart
  })
}

function decodeBoard(value: unknown, pool: ChartData[], warnings: string[]): Board {
  if (value === undefined) return emptyBoard()
  if (!Array.isArray(value) || value.length !== 9) {
    fail('board must contain exactly nine placements')
  }
  const resolvedUids = new Set(pool.filter(isChartShapeResolved).map((chart) => chart.uid))
  const placedUids = new Set<string>()
  return value.map((rawPlacement, index) => {
    const path = `board[${index}]`
    if (rawPlacement === null) return null
    if (!isRecord(rawPlacement)) fail(`${path} must be an object or null`)
    if (typeof rawPlacement.chartUid !== 'string' || rawPlacement.chartUid.trim() === '') {
      fail(`${path}.chartUid must be a non-empty string`)
    }
    if (
      typeof rawPlacement.rotation !== 'number' ||
      !Number.isInteger(rawPlacement.rotation) ||
      rawPlacement.rotation < 0 ||
      rawPlacement.rotation > 3
    ) {
      fail(`${path}.rotation must be an integer from 0 to 3`)
    }
    if (!resolvedUids.has(rawPlacement.chartUid)) {
      warnings.push(`${path} removed an unknown or unresolved chart reference`)
      return null
    }
    if (placedUids.has(rawPlacement.chartUid)) {
      fail(`${path} places chart "${rawPlacement.chartUid}" more than once`)
    }
    placedUids.add(rawPlacement.chartUid)
    return {
      chartUid: rawPlacement.chartUid,
      rotation: rawPlacement.rotation,
    }
  }) as Board
}

function decodeBorders(value: unknown, warnings: string[]): Borders {
  if (value === undefined) return emptyBorders()
  if (!Array.isArray(value) || value.length !== 12) {
    fail('borders must contain exactly twelve entries')
  }
  return value.map((border, index) => {
    if (border === null) return null
    if (typeof border !== 'string') {
      fail(`borders[${index}] must be a string or null`)
    }
    if (!borderModById.has(border)) {
      warnings.push(`borders[${index}] removed unknown id "${border}"`)
      return null
    }
    return border
  })
}

function decodeWeights(value: unknown, warnings: string[]): Weights {
  const weights = { ...DEFAULT_WEIGHTS }
  if (value === undefined) return weights
  if (!isRecord(value)) fail('weights must be an object')

  for (const [key, rawWeight] of Object.entries(value)) {
    if (!knownWeightKeys.has(key)) {
      warnings.push(`weights removed unknown key "${key}"`)
      continue
    }
    if (typeof rawWeight !== 'number' || !Number.isFinite(rawWeight)) {
      fail(`weights.${key} must be a finite number`)
    }
    const weight = Math.max(0, Math.min(10, Math.round(rawWeight)))
    if (weight !== rawWeight) {
      warnings.push(`weights.${key} was normalized to ${weight}`)
    }
    weights[key] = weight
  }
  return weights
}

function decodeDisabledMods(value: unknown, warnings: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
    fail('disabledMods must be an array of strings')
  }
  const disabled = new Set<string>()
  for (const id of value) {
    if (typeof id !== 'string' || disabled.has(id)) continue
    if (!knownModifierIds.has(id)) {
      warnings.push(`disabledMods removed unknown id "${id}"`)
      continue
    }
    disabled.add(id)
  }
  return [...disabled]
}

function decodeStrategyId(value: unknown, warnings: string[]): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') fail('strategyId must be a string or null')
  if (!strategyById.has(value)) {
    warnings.push(`strategyId removed unknown id "${value}"`)
    return null
  }
  return value
}

function decodeStrategyReservations(value: unknown): StrategyReservationPreferences {
  const defaults = defaultStrategyReservations()
  if (value === undefined) return defaults
  if (!isRecord(value)) fail('strategyReservations must be an object')
  return {
    speedrun: optionalBoolean(value, 'speedrun', defaults.speedrun),
    divine: optionalBoolean(value, 'divine', defaults.divine),
    meatfish: optionalBoolean(value, 'meatfish', defaults.meatfish),
    ethereal: optionalBoolean(value, 'ethereal', defaults.ethereal),
  }
}

function decodeRerolls(value: unknown, warnings: string[]): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('borderRerollsUsed must be a finite number')
  }
  const rerolls = Math.max(0, Math.min(5, Math.floor(value)))
  if (rerolls !== value) {
    warnings.push(`borderRerollsUsed was normalized to ${rerolls}`)
  }
  return rerolls
}

export function saveLocal(state: AppState) {
  try {
    localStorage.setItem(LS_KEY, serializeState(state))
  } catch {
    /* storage full / unavailable - ignore */
  }
}

export function loadLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const decoded = decodeStateJson(raw)
    return decoded.ok ? decoded.state : null
  } catch {
    return null
  }
}

export function serializeState(state: AppState, space?: number): string {
  return JSON.stringify({ ...state, v: STATE_VERSION }, null, space)
}

/** Share state via URL hash (base64 JSON). */
export function encodeShare(state: AppState): string {
  const json = serializeState(state)
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeShare(hash: string): AppState | null {
  try {
    const json = decodeURIComponent(escape(atob(hash)))
    const decoded = decodeStateJson(json)
    return decoded.ok ? decoded.state : null
  } catch {
    return null
  }
}

export function decodeState(value: unknown): StateDecodeResult {
  try {
    if (!isRecord(value)) fail('state root must be an object')
    const warnings: string[] = []
    const defaults = defaultState()
    const version = decodeVersion(value)
    const resetTransient = version !== null && version < STATE_VERSION
    if (version === null) {
      warnings.push('unversioned state was migrated')
    } else if (resetTransient) {
      warnings.push(`state version ${version} reset chart, board and border data during migration`)
    }

    const modeValue = value.mode
    let mode: ConnectivityMode
    if (modeValue === undefined) mode = defaults.mode
    else if (modeValue === 'any') mode = 'any'
    else if (modeValue === 'strict' || modeValue === 'connected') mode = 'strict'
    else fail('mode is not supported')

    const adjacencyValue = value.adjacencyMode
    let adjacencyMode: AdjacencyMode
    if (adjacencyValue === undefined) adjacencyMode = defaults.adjacencyMode
    else if (adjacencyValue === 'physical' || adjacencyValue === 'connected') {
      adjacencyMode = adjacencyValue
    } else {
      fail('adjacencyMode is not supported')
    }

    const pool = resetTransient ? [] : decodePool(value.pool, warnings)
    const board = resetTransient ? emptyBoard() : decodeBoard(value.board, pool, warnings)
    const borders = resetTransient ? emptyBorders() : decodeBorders(value.borders, warnings)

    return {
      ok: true,
      warnings,
      state: {
        pool,
        board,
        borders,
        weights: decodeWeights(value.weights, warnings),
        mode,
        allowRotation: optionalBoolean(value, 'allowRotation', defaults.allowRotation),
        adjacencyMode,
        adjacentAffectsSelf: optionalBoolean(
          value,
          'adjacentAffectsSelf',
          defaults.adjacentAffectsSelf,
        ),
        disabledMods: decodeDisabledMods(value.disabledMods, warnings),
        strategyId: decodeStrategyId(value.strategyId, warnings),
        strategyReservations: decodeStrategyReservations(value.strategyReservations),
        borderRerollsUsed: decodeRerolls(value.borderRerollsUsed, warnings),
      },
    }
  } catch (error) {
    if (error instanceof StateDecodeError) {
      return { ok: false, code: error.code, message: error.message }
    }
    return {
      ok: false,
      code: 'invalid',
      message: 'state could not be decoded',
    }
  }
}

export function decodeStateJson(json: string): StateDecodeResult {
  try {
    return decodeState(JSON.parse(json))
  } catch {
    return {
      ok: false,
      code: 'invalid',
      message: 'file does not contain valid JSON',
    }
  }
}
