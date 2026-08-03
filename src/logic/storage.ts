import type { AdjacencyMode } from './scoring'
import { CHART_AREAS } from '../data/chartAreas'
import { borderModById, voyageModById } from '../data/mods'
import {
  defaultStrategyReservations,
  strategyById,
  type StrategyReservationPreferences,
} from '../data/strategies'
import type {
  Board,
  Borders,
  ChartAreaType,
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
  /** chart types excluded from low-investment strategy solve pools */
  strategyReservations: StrategyReservationPreferences
  /** per-piece-type counts kept in reserve for curated strategies */
  pieceKeeps: Record<string, number>
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
  pieceKeeps: {},
  borderRerollsUsed: 0,
})

export const LOCAL_STATE_KEY = 'allflame-voyage-solver'
export const LOCAL_STATE_BACKUP_PREFIX = `${LOCAL_STATE_KEY}-recovery`
/** bump only when chart/board data (mod ids) changes incompatibly */
export const STATE_VERSION = 3 // v3: full datamined mod pools

/** Resource budgets for state supplied through JSON files, URL hashes, or storage. */
export const MAX_STATE_JSON_CHARS = 2 * 1024 * 1024
export const MAX_STATE_FILE_BYTES = 2 * 1024 * 1024
export const MAX_POOL_CHARTS = 250
export const MAX_CHART_UID_LENGTH = 128
export const MAX_CHART_NAME_LENGTH = 256
export const MAX_IMPLICIT_TEXT_LENGTH = 4 * 1024
export const MAX_RAW_TEXT_LENGTH = 32 * 1024
export const MAX_SHAPE_INPUT_LENGTH = 256
export const MAX_MOD_IDS_PER_CHART = 64
export const MAX_REWARDS_PER_CHART = 64
export const MAX_DISABLED_MODS = 256
export const MAX_PIECE_KEEPS = 256
export const MAX_PIECE_KEEP_KEY_LENGTH = 512
const MAX_ID_LENGTH = 128
const MAX_WEIGHT_KEYS = 128

type UnknownRecord = Record<string, unknown>

export type StateDecodeErrorCode = 'invalid' | 'incompatible'

export type StateDecodeResult =
  | { ok: true; state: AppState; warnings: string[] }
  | { ok: false; code: StateDecodeErrorCode; message: string }

export interface LocalStateRecovery {
  status: 'recovery'
  raw: string
  backupKey: string | null
  code: StateDecodeErrorCode | 'migration'
  message: string
  warnings: string[]
  proposedState?: AppState
}

export type LocalStateLoadResult =
  { status: 'empty' } | { status: 'ready'; state: AppState } | LocalStateRecovery

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
const knownAreaTypes = new Set<ChartAreaType>(CHART_AREAS.map(({ id }) => id))

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

function boundedString(value: unknown, path: string, maxLength: number, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    fail(`${path} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`)
  }
  if (value.length > maxLength) fail(`${path} must be at most ${maxLength} characters`)
  return value
}

function optionalBoundedString(
  object: UnknownRecord,
  key: string,
  path: string,
  maxLength: number,
): string | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  return boundedString(value, `${path}.${key}`, maxLength)
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
  if (value.length > MAX_REWARDS_PER_CHART) {
    fail(`${path} must contain at most ${MAX_REWARDS_PER_CHART} entries`)
  }
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
  const uid = boundedString(value.uid, `${path}.uid`, MAX_CHART_UID_LENGTH, false)
  const name = boundedString(value.name, `${path}.name`, MAX_CHART_NAME_LENGTH)
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
  if (!Array.isArray(value.modIds)) fail(`${path}.modIds must be an array of strings`)
  if (value.modIds.length > MAX_MOD_IDS_PER_CHART) {
    fail(`${path}.modIds must contain at most ${MAX_MOD_IDS_PER_CHART} entries`)
  }
  if (value.modIds.some((id) => typeof id !== 'string')) {
    fail(`${path}.modIds must be an array of strings`)
  }
  value.modIds.forEach((id, modIndex) => {
    boundedString(id, `${path}.modIds[${modIndex}]`, MAX_ID_LENGTH)
  })

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
    uid,
    name,
    level,
    edges,
    modIds,
  }

  const areaType = optionalBoundedString(value, 'areaType', path, MAX_ID_LENGTH)
  if (areaType !== undefined && !knownAreaTypes.has(areaType as ChartAreaType)) {
    fail(`${path}.areaType is not supported`)
  }
  const implicitText = optionalBoundedString(value, 'implicitText', path, MAX_IMPLICIT_TEXT_LENGTH)
  const shapeInput = optionalBoundedString(value, 'shapeInput', path, MAX_SHAPE_INPUT_LENGTH)
  const rawText = optionalBoundedString(value, 'rawText', path, MAX_RAW_TEXT_LENGTH)
  const rewards = decodeRewards(value.rewards, `${path}.rewards`)
  const preserved = value.preserved
  if (preserved !== undefined && typeof preserved !== 'boolean') {
    fail(`${path}.preserved must be a boolean`)
  }

  if (areaType !== undefined) chart.areaType = areaType as ChartAreaType
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
  if (value.length > MAX_POOL_CHARTS) {
    fail(`pool must contain at most ${MAX_POOL_CHARTS} charts`)
  }
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
    const chartUid = boundedString(
      rawPlacement.chartUid,
      `${path}.chartUid`,
      MAX_CHART_UID_LENGTH,
      false,
    )
    if (
      typeof rawPlacement.rotation !== 'number' ||
      !Number.isInteger(rawPlacement.rotation) ||
      rawPlacement.rotation < 0 ||
      rawPlacement.rotation > 3
    ) {
      fail(`${path}.rotation must be an integer from 0 to 3`)
    }
    if (!resolvedUids.has(chartUid)) {
      warnings.push(`${path} removed an unknown or unresolved chart reference`)
      return null
    }
    if (placedUids.has(chartUid)) {
      fail(`${path} places chart "${chartUid}" more than once`)
    }
    placedUids.add(chartUid)
    return {
      chartUid,
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
    boundedString(border, `borders[${index}]`, MAX_ID_LENGTH)
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
  if (Object.keys(value).length > MAX_WEIGHT_KEYS) {
    fail(`weights must contain at most ${MAX_WEIGHT_KEYS} entries`)
  }

  for (const [key, rawWeight] of Object.entries(value)) {
    boundedString(key, 'weights key', MAX_ID_LENGTH)
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
  if (!Array.isArray(value)) fail('disabledMods must be an array of strings')
  if (value.length > MAX_DISABLED_MODS) {
    fail(`disabledMods must contain at most ${MAX_DISABLED_MODS} entries`)
  }
  if (value.some((id) => typeof id !== 'string')) {
    fail('disabledMods must be an array of strings')
  }
  const disabled = new Set<string>()
  for (const [index, id] of value.entries()) {
    boundedString(id, `disabledMods[${index}]`, MAX_ID_LENGTH)
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
  const strategyId = boundedString(value, 'strategyId', MAX_ID_LENGTH)
  if (!strategyById.has(strategyId)) {
    warnings.push(`strategyId removed unknown id "${strategyId}"`)
    return null
  }
  return strategyId
}

function decodeStrategyReservations(value: unknown): StrategyReservationPreferences {
  const defaults = defaultStrategyReservations()
  if (value === undefined) return defaults
  if (!isRecord(value)) fail('strategyReservations must be an object')

  // Pre-granular saves used four broad strategy flags. Use their combined
  // effective behaviour as the fallback for each new chart-type preference.
  const legacySpeedrun = optionalBoolean(value, 'speedrun', true)
  const legacyDivine = optionalBoolean(value, 'divine', true)
  const legacyMeatfish = optionalBoolean(value, 'meatfish', true)
  const legacyEthereal = optionalBoolean(value, 'ethereal', true)

  return {
    genericStrongboxes: optionalBoolean(value, 'genericStrongboxes', legacyDivine),
    divinerStrongboxes: optionalBoolean(
      value,
      'divinerStrongboxes',
      legacySpeedrun || legacyDivine,
    ),
    arcanistStrongboxes: optionalBoolean(
      value,
      'arcanistStrongboxes',
      legacySpeedrun || legacyDivine,
    ),
    operativeStrongboxes: optionalBoolean(
      value,
      'operativeStrongboxes',
      legacySpeedrun || legacyDivine,
    ),
    messages: optionalBoolean(value, 'messages', legacySpeedrun),
    starfish: optionalBoolean(value, 'starfish', legacyDivine || legacyMeatfish),
    globalRares: optionalBoolean(value, 'globalRares', legacyDivine || legacyMeatfish),
    adjacentRares: optionalBoolean(value, 'adjacentRares', legacyDivine),
    seaPillars: optionalBoolean(value, 'seaPillars', legacyDivine || legacyMeatfish),
    pelagicAbyss: optionalBoolean(value, 'pelagicAbyss', legacyDivine),
    meatfish: legacyMeatfish,
    ethereal: legacyEthereal,
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

function decodePieceKeeps(value: unknown, warnings: string[]): Record<string, number> {
  if (value === undefined) return {}
  if (!isRecord(value)) fail('pieceKeeps must be an object')
  if (Object.keys(value).length > MAX_PIECE_KEEPS) {
    fail(`pieceKeeps must contain at most ${MAX_PIECE_KEEPS} entries`)
  }

  const decoded: Record<string, number> = {}
  for (const [key, count] of Object.entries(value)) {
    boundedString(key, 'pieceKeeps key', MAX_PIECE_KEEP_KEY_LENGTH, false)
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      warnings.push(`pieceKeeps.${key} was ignored because it is not a finite number`)
      continue
    }
    const normalized = Math.max(0, Math.floor(count))
    if (normalized !== count) warnings.push(`pieceKeeps.${key} was normalized to ${normalized}`)
    decoded[key] = normalized
  }

  // Granular Divine bank types replaced three broad matchers without changing
  // the state version. Copy an explicit legacy override to every new subtype so
  // no previously protected family is silently released. Newer explicit values
  // always win when a save contains both formats.
  const migrations: Record<string, string[]> = {
    'divine-border-rares:adj-star-1|adj-star-2|adj-box-1|adj-box-2|adj-box-3': [
      'divine-border-rares:adj-star-1|adj-star-2',
      'divine-border-rares:adj-box-2|adj-box-3',
      'divine-border-rares:adj-box-1',
    ],
    'divine-border-rares:adj-rare-1|adj-rare-2|voy-rare': [
      'divine-border-rares:voy-rare',
      'divine-border-rares:adj-rare-1|adj-rare-2',
    ],
    'cutedog-divine-boxes:adj-box-1|adj-box-2|adj-box-3|adj-divbox-1|adj-divbox-2|adj-arcbox-1|adj-arcbox-2|adj-opbox-1|adj-opbox-2':
      [
        // Generic boxes are owned by the earlier Divine Border bank.
        'divine-border-rares:adj-box-2|adj-box-3',
        'divine-border-rares:adj-box-1',
        'cutedog-divine-boxes:adj-divbox-1|adj-divbox-2',
        'cutedog-divine-boxes:adj-arcbox-1|adj-arcbox-2',
        'cutedog-divine-boxes:adj-opbox-1|adj-opbox-2',
      ],
  }
  for (const [legacyKey, replacementKeys] of Object.entries(migrations)) {
    const count = decoded[legacyKey]
    if (count === undefined) continue
    for (const replacementKey of replacementKeys) {
      if (decoded[replacementKey] === undefined) decoded[replacementKey] = count
    }
    delete decoded[legacyKey]
    warnings.push(`pieceKeeps.${legacyKey} was migrated to granular chart types`)
  }
  return decoded
}

export function saveLocal(state: AppState) {
  try {
    localStorage.setItem(LOCAL_STATE_KEY, serializeState(state))
  } catch {
    /* storage full / unavailable - ignore */
  }
}

function recoveryBackupKey(raw: string): string {
  let hash = 2166136261
  for (let index = 0; index < raw.length; index += 1) {
    hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619)
  }
  return `${LOCAL_STATE_BACKUP_PREFIX}-${raw.length}-${(hash >>> 0).toString(16)}`
}

/** Preserve the exact original payload without touching the active storage key. */
export function quarantineLocalState(raw: string): string | null {
  try {
    const baseKey = recoveryBackupKey(raw)
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const backupKey = suffix === 0 ? baseKey : `${baseKey}-${suffix}`
      const existing = localStorage.getItem(backupKey)
      if (existing === raw) return backupKey
      if (existing === null) {
        localStorage.setItem(backupKey, raw)
        return localStorage.getItem(backupKey) === raw ? backupKey : null
      }
    }
    return null
  } catch {
    return null
  }
}

export function loadLocalState(): LocalStateLoadResult {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY)
    if (!raw) return { status: 'empty' }
    const decoded = decodeStateJson(raw)
    if (!decoded.ok) {
      return {
        status: 'recovery',
        raw,
        backupKey: quarantineLocalState(raw),
        code: decoded.code,
        message: decoded.message,
        warnings: [],
      }
    }

    const parsed = JSON.parse(raw) as UnknownRecord
    const needsMigration = parsed.v !== STATE_VERSION || decoded.warnings.length > 0
    if (needsMigration) {
      return {
        status: 'recovery',
        raw,
        backupKey: quarantineLocalState(raw),
        code: 'migration',
        message:
          decoded.warnings[0] ??
          `saved state version ${String(parsed.v ?? 'unversioned')} requires migration`,
        warnings: decoded.warnings,
        proposedState: decoded.state,
      }
    }
    return { status: 'ready', state: decoded.state }
  } catch {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY)
      if (raw) {
        return {
          status: 'recovery',
          raw,
          backupKey: quarantineLocalState(raw),
          code: 'invalid',
          message: 'saved state could not be read',
          warnings: [],
        }
      }
    } catch {
      /* storage itself is unavailable */
    }
    return { status: 'empty' }
  }
}

/** Compatibility helper for non-interactive callers. Recovery is never treated as empty state. */
export function loadLocal(): AppState | null {
  const result = loadLocalState()
  return result.status === 'ready' ? result.state : null
}

export function serializeState(state: AppState, space?: number): string {
  return JSON.stringify({ ...state, v: STATE_VERSION }, null, space)
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
        pieceKeeps: decodePieceKeeps(value.pieceKeeps, warnings),
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
  if (json.length > MAX_STATE_JSON_CHARS) {
    return {
      ok: false,
      code: 'invalid',
      message: `state JSON exceeds the ${MAX_STATE_JSON_CHARS}-character limit`,
    }
  }
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

export async function decodeStateFile(
  file: Pick<File, 'size' | 'text'>,
): Promise<StateDecodeResult> {
  if (file.size > MAX_STATE_FILE_BYTES) {
    return {
      ok: false,
      code: 'invalid',
      message: 'file exceeds the 2 MiB size limit',
    }
  }
  return decodeStateJson(await file.text())
}
