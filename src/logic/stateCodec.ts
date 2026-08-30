import { defaultState, type AppState } from '../state/appState'
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
/** Generous sanity cap for imported chart-header percentages and their merged totals. */
export const MAX_REWARD_PERCENT = 10_000
export const MAX_DISABLED_MODS = 256
export const MAX_PIECE_KEEPS = 256
export const MAX_PIECE_KEEP_KEY_LENGTH = 512
export const MAX_LAYOUT_CHOICES = 64
export const MAX_LAYOUT_CHOICE_LENGTH = 128
const MAX_ID_LENGTH = 128
const MAX_WEIGHT_KEYS = 128

type UnknownRecord = Record<string, unknown>

export type StateDecodeErrorCode = 'invalid' | 'incompatible'

export type StateDecodeResult =
  | { ok: true; state: AppState; warnings: string[] }
  | { ok: false; code: StateDecodeErrorCode; message: string }

export type StatePersistenceResult = { ok: true } | { ok: false; message: string }

export interface StateSizeBudget {
  readonly compactChars: number
  readonly exportedChars: number
  readonly exportedBytes: number
}

const validatedPayload = Symbol('validated state payload')

/** Immutable bytes certified at a full persistence boundary, independent of later state edits. */
export interface ValidatedStatePayload {
  readonly [validatedPayload]: true
  readonly compact: string
}

export interface StatePersistenceSnapshot {
  readonly budget: StateSizeBudget
  /** Present after full validation; metadata-only mutations defer serialization until autosave. */
  readonly payload?: ValidatedStatePayload
}

export type StatePreparationResult =
  { ok: true; persistence: StatePersistenceSnapshot } | { ok: false; message: string }

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
const PATCH_3292_CHART_MOD_MIGRATIONS = new Map([
  ['cm-gold-50', 'cm-rarity-50'],
  ['cm-gold-70', 'cm-rarity-70'],
])
const PATCH_3292_REMOVED_WEIGHT_KEYS = new Set(['self:gold'])

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
  const decoded = value.map((rawEffect, index) => {
    const effectPath = `${path}[${index}]`
    if (!isRecord(rawEffect)) fail(`${effectPath} must be an object`)
    if (typeof rawEffect.stat !== 'string' || !knownStats.has(rawEffect.stat as Stat)) {
      fail(`${effectPath}.stat is not a supported reward stat`)
    }
    if (
      typeof rawEffect.percent !== 'number' ||
      !Number.isFinite(rawEffect.percent) ||
      rawEffect.percent < 0 ||
      rawEffect.percent > MAX_REWARD_PERCENT
    ) {
      fail(`${effectPath}.percent must be between 0 and ${MAX_REWARD_PERCENT}`)
    }
    return {
      // Patch 3.29.2 converted every Chart Gold-found modifier into Rarity.
      // ChartData.rewards only contains imported self-scope header values, so
      // equipment-to-Gold implicits and borders are not affected here.
      stat: rawEffect.stat === 'gold' ? ('rarity' as const) : (rawEffect.stat as Stat),
      percent: rawEffect.percent,
    }
  })

  // A pre-patch Chart could contain both native Rarity and Gold-found. They
  // now contribute to one aggregate Item Rarity header value.
  const merged = new Map<Stat, number>()
  for (const effect of decoded) {
    const percent = (merged.get(effect.stat) ?? 0) + effect.percent
    if (!Number.isFinite(percent) || percent > MAX_REWARD_PERCENT) {
      fail(`${path} aggregate for ${effect.stat} must be between 0 and ${MAX_REWARD_PERCENT}`)
    }
    merged.set(effect.stat, percent)
  }
  return [...merged].map(([stat, percent]) => ({ stat, percent }))
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
  const modIds: string[] = []
  for (const rawId of value.modIds as string[]) {
    const id = PATCH_3292_CHART_MOD_MIGRATIONS.get(rawId) ?? rawId
    if (seenModIds.has(id)) continue
    seenModIds.add(id)
    if (!voyageModById.has(id)) {
      warnings.push(`${path}.modIds removed unknown id "${rawId}"`)
      continue
    }
    modIds.push(id)
  }

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
    // self:gold represented Chart header Gold, which no longer exists after
    // 3.29.2. Adjacent and border Gold preferences use different keys.
    if (PATCH_3292_REMOVED_WEIGHT_KEYS.has(key)) continue
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
  for (const [index, rawId] of value.entries()) {
    boundedString(rawId, `disabledMods[${index}]`, MAX_ID_LENGTH)
    if (typeof rawId !== 'string') continue
    const id = PATCH_3292_CHART_MOD_MIGRATIONS.get(rawId) ?? rawId
    if (disabled.has(id)) continue
    if (!knownModifierIds.has(id)) {
      warnings.push(`disabledMods removed unknown id "${rawId}"`)
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

function decodeLayoutChoice(value: unknown, warnings: string[]): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) fail('layoutChoice must be an object')
  if (Object.keys(value).length > MAX_LAYOUT_CHOICES) {
    fail(`layoutChoice must contain at most ${MAX_LAYOUT_CHOICES} entries`)
  }

  const decoded: Record<string, string> = {}
  for (const [strategyId, layoutIdValue] of Object.entries(value)) {
    boundedString(strategyId, 'layoutChoice key', MAX_LAYOUT_CHOICE_LENGTH, false)
    if (typeof layoutIdValue !== 'string') {
      warnings.push(`layoutChoice.${strategyId} was ignored because it is not a string`)
      continue
    }
    const layoutId = boundedString(
      layoutIdValue,
      `layoutChoice.${strategyId}`,
      MAX_LAYOUT_CHOICE_LENGTH,
      false,
    )
    const strategy = strategyById.get(strategyId)
    if (!strategy?.layouts?.some((layout) => layout.id === layoutId)) {
      warnings.push(`layoutChoice.${strategyId} was ignored because the layout is unknown`)
      continue
    }
    decoded[strategyId] = layoutId
  }
  return decoded
}

function stringifyState(state: AppState, space?: number): string {
  return JSON.stringify({ ...state, v: STATE_VERSION }, null, space)
}

/**
 * Verify the same compact local-storage payload and readable JSON export that
 * the UI produces. A successful result guarantees both forms fit their input
 * budgets and the compact form can be decoded without recovery adjustments.
 */
export function prepareStateForPersistence(state: AppState): StatePreparationResult {
  let compact: string
  try {
    compact = stringifyState(state)
    if (typeof compact !== 'string') {
      return { ok: false, message: 'state contains a value that cannot be serialized' }
    }
  } catch {
    return { ok: false, message: 'state contains a value that cannot be serialized' }
  }

  const compactCheck = checkStateSizeBudget({
    compactChars: compact.length,
    exportedChars: compact.length,
    exportedBytes: 0,
  })
  if (!compactCheck.ok) return compactCheck
  const parsed: unknown = JSON.parse(compact)
  const whitespace = prettyJsonWhitespace(parsed)
  const characterCheck = checkStateSizeBudget({
    compactChars: compact.length,
    exportedChars: compact.length + whitespace,
    exportedBytes: 0,
  })
  if (!characterCheck.ok) return characterCheck
  const budget: StateSizeBudget = {
    compactChars: compact.length,
    exportedChars: compact.length + whitespace,
    exportedBytes: new TextEncoder().encode(compact).byteLength + whitespace,
  }
  const sizeCheck = checkStateSizeBudget(budget)
  if (!sizeCheck.ok) return sizeCheck

  const decoded = decodeState(parsed)
  if (!decoded.ok) return { ok: false, message: decoded.message }
  if (decoded.warnings.length > 0) {
    return {
      ok: false,
      message: `state would require recovery on reload: ${decoded.warnings[0]}`,
    }
  }
  return {
    ok: true,
    persistence: {
      budget,
      payload: Object.freeze({ [validatedPayload]: true as const, compact }),
    },
  }
}

/**
 * JSON.stringify(parsed, null, 2) adds only ASCII whitespace to compact JSON:
 * one space per object property colon, plus line breaks and indentation for
 * nonempty containers. Walk the already-parsed tree, never the large strings.
 */
function prettyJsonWhitespace(parsed: unknown): number {
  let whitespace = 0
  const pending = [{ value: parsed, depth: 0 }]
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!
    if (typeof value !== 'object' || value === null) continue
    const values: unknown[] = Object.values(value)
    if (values.length === 0) continue
    const entries = values.length
    whitespace += entries + 1 + entries * 2 * (depth + 1) + 2 * depth
    if (!Array.isArray(value)) whitespace += entries
    for (const child of values) {
      if (typeof child === 'object' && child !== null) {
        pending.push({ value: child, depth: depth + 1 })
      }
    }
  }
  return whitespace
}

function measureStateJson(compact: string, exported: string): StateSizeBudget {
  return {
    compactChars: compact.length,
    exportedChars: exported.length,
    exportedBytes: new TextEncoder().encode(exported).byteLength,
  }
}

function checkStateSizeBudget(budget: StateSizeBudget): StatePersistenceResult {
  if (budget.compactChars > MAX_STATE_JSON_CHARS || budget.exportedChars > MAX_STATE_JSON_CHARS) {
    return {
      ok: false,
      message: `state JSON exceeds the ${MAX_STATE_JSON_CHARS}-character limit`,
    }
  }
  if (budget.exportedBytes > MAX_STATE_FILE_BYTES) {
    return { ok: false, message: 'state JSON export exceeds the 2 MiB file limit' }
  }

  return { ok: true }
}

/**
 * An immutable reducer can reuse the unchanged pool's certified size. Validate
 * only settings and the nine board references, then apply exact JSON/UTF-8 size
 * deltas. Full validation still runs when this state crosses the save boundary.
 */
export function prepareStateMetadataMutation(
  previous: AppState,
  next: AppState,
  previousBudget: StateSizeBudget,
): StatePreparationResult {
  if (previous.pool !== next.pool) return prepareStateForPersistence(next)

  try {
    const warnings: string[] = []
    decodeBoard(next.board, next.pool, warnings)
    const settings = decodeState({ ...next, pool: [], board: emptyBoard(), v: STATE_VERSION })
    if (!settings.ok) return { ok: false, message: settings.message }
    warnings.push(...settings.warnings)
    if (warnings.length > 0) {
      return {
        ok: false,
        message: `state would require recovery on reload: ${warnings[0]}`,
      }
    }

    // Replacing the same pool with [] preserves every other property's JSON
    // indentation and escaping, so subtracting these envelopes is exact.
    const measureEnvelope = (state: AppState) => {
      const envelope = { ...state, pool: [] }
      return measureStateJson(stringifyState(envelope), stringifyState(envelope, 2))
    }
    const before = measureEnvelope(previous)
    const after = measureEnvelope(next)
    const budget: StateSizeBudget = {
      compactChars: previousBudget.compactChars - before.compactChars + after.compactChars,
      exportedChars: previousBudget.exportedChars - before.exportedChars + after.exportedChars,
      exportedBytes: previousBudget.exportedBytes - before.exportedBytes + after.exportedBytes,
    }
    const sizeCheck = checkStateSizeBudget(budget)
    return sizeCheck.ok ? { ok: true, persistence: { budget } } : sizeCheck
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof StateDecodeError
          ? error.message
          : 'state contains a value that cannot be serialized',
    }
  }
}

export function validateStateForPersistence(state: AppState): StatePersistenceResult {
  const prepared = prepareStateForPersistence(state)
  return prepared.ok ? { ok: true } : prepared
}

export function serializeState(state: AppState, space?: number): string {
  const prepared = prepareStateForPersistence(state)
  if (!prepared.ok) throw new Error(prepared.message)
  if (space === undefined || space === 0) return prepared.persistence.payload!.compact
  // Readable exports are uncommon; format the certified snapshot only on demand.
  return JSON.stringify(JSON.parse(prepared.persistence.payload!.compact), null, space)
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
        layoutChoice: decodeLayoutChoice(value.layoutChoice, warnings),
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
