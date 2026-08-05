import { borderModById } from '../data/mods'
import type { Borders } from '../types'
import {
  incompatibleAuxiliaryStore,
  unavailableAuxiliaryStore,
  type AuxiliaryStorageRecovery,
} from './auxiliaryStorageRecovery'

export const BORDER_ROLL_SAMPLE_SCHEMA = 'allflame-border-roll/v2' as const
export const BORDER_ROLL_DATASET_SCHEMA = 'allflame-border-roll-dataset/v2' as const

const LEGACY_SAMPLE_SCHEMA = 'allflame-border-roll/v1' as const
const LEGACY_STORE_VERSION = 1
const PREVIOUS_STORE_VERSION = 2
const ARCHIVE_STORE_VERSION = 3
const STORE_VERSION = 4
export const BORDER_RESEARCH_STORAGE_KEY = 'allflame-border-roll-research'
const SUBMISSION_URL = 'https://github.com/Alkwer/one-more-map.github.io/issues/new'

export type OrderedBorderIds = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]

export interface BorderRollSample {
  schema: typeof BORDER_ROLL_SAMPLE_SCHEMA
  sampleId: string
  /** Groups the natural board and every paid reroll from the same Voyage. */
  sequenceId: string
  capturedAt: string
  gamePatch: string
  /** Superior Sovereign progress when the board rolled; null means legacy/unknown. */
  vesperUpgradeCount: number | null
  generation: 'natural' | 'paid-reroll'
  /** Zero is the natural board; one and above are paid rerolls in order. */
  rerollIndex: number
  /** Known next reroll price for this step; legacy v2 samples may contain the observed display. */
  displayedNextRerollCost: number | null
  /** Clockwise UI order: top, right, bottom, left; three slots per side. */
  borderModIds: OrderedBorderIds
}

export interface BorderResearchStore {
  version: typeof STORE_VERSION
  activeSequenceId: string
  /** Persisted capture setting used for newly recorded Voyage sequences. */
  vesperUpgradeCount: number | null
  samples: BorderRollSample[]
  archivedSequenceIds: string[]
  /** Present only in memory while incompatible or unavailable storage blocks writes. */
  recovery?: AuxiliaryStorageRecovery
}

export interface BorderRollDataset {
  schema: typeof BORDER_ROLL_DATASET_SCHEMA
  exportedAt: string
  sampleCount: number
  samples: BorderRollSample[]
}

export function createBorderRollDataset(
  samples: BorderRollSample[],
  exportedAt = new Date().toISOString(),
): BorderRollDataset {
  return {
    schema: BORDER_ROLL_DATASET_SCHEMA,
    exportedAt,
    sampleCount: samples.length,
    samples,
  }
}

interface CreateSampleInput {
  sequenceId: string
  gamePatch: string
  vesperUpgradeCount: number | null
  rerollIndex: number
  displayedNextRerollCost: number | null
  borders: Borders
  capturedAt?: string
}

export type CreateSampleResult =
  { ok: true; sample: BorderRollSample } | { ok: false; message: string }

export type AddSampleResult =
  | { status: 'added'; store: BorderResearchStore }
  | { status: 'duplicate'; store: BorderResearchStore }
  | { status: 'conflict'; store: BorderResearchStore }

function createId(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${id}`
}

export function createBorderResearchStore(): BorderResearchStore {
  return {
    version: STORE_VERSION,
    activeSequenceId: createId('voyage'),
    vesperUpgradeCount: null,
    samples: [],
    archivedSequenceIds: [],
  }
}

export function startBorderRollSequence(store: BorderResearchStore): BorderResearchStore {
  return { ...store, activeSequenceId: createId('voyage') }
}

function isVesperUpgradeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5
}

export function setCurrentVesperUpgradeCount(
  store: BorderResearchStore,
  vesperUpgradeCount: number | null,
): BorderResearchStore {
  if (vesperUpgradeCount !== null && !isVesperUpgradeCount(vesperUpgradeCount)) return store
  const canCorrectActiveSequence = store.vesperUpgradeCount !== null
  return {
    ...store,
    vesperUpgradeCount,
    samples: store.samples.map((sample) =>
      canCorrectActiveSequence && sample.sequenceId === store.activeSequenceId
        ? { ...sample, vesperUpgradeCount }
        : sample,
    ),
  }
}

export function archiveBorderRollSequence(
  store: BorderResearchStore,
  sequenceId: string,
): BorderResearchStore {
  if (
    sequenceId === store.activeSequenceId ||
    store.archivedSequenceIds.includes(sequenceId) ||
    !store.samples.some((sample) => sample.sequenceId === sequenceId)
  ) {
    return store
  }
  return { ...store, archivedSequenceIds: [...store.archivedSequenceIds, sequenceId] }
}

export function restoreBorderRollSequence(
  store: BorderResearchStore,
  sequenceId: string,
): BorderResearchStore {
  if (!store.archivedSequenceIds.includes(sequenceId)) return store
  return {
    ...store,
    archivedSequenceIds: store.archivedSequenceIds.filter((id) => id !== sequenceId),
  }
}

function completeBorders(borders: Borders): OrderedBorderIds | null {
  if (borders.length !== 12 || borders.some((id) => !id || !borderModById.has(id))) return null
  return [...borders] as OrderedBorderIds
}

export function createBorderRollSample(input: CreateSampleInput): CreateSampleResult {
  const gamePatch = input.gamePatch.trim()
  if (!gamePatch || gamePatch.length > 32) {
    return { ok: false, message: 'Enter the current game patch (for example 3.29.2).' }
  }
  if (!Number.isInteger(input.rerollIndex) || input.rerollIndex < 0 || input.rerollIndex > 20) {
    return { ok: false, message: 'Reroll number must be a whole number from 0 to 20.' }
  }
  if (!isVesperUpgradeCount(input.vesperUpgradeCount)) {
    return {
      ok: false,
      message: 'Select your current Superior Sovereign / Vesper progress from 0 to 5.',
    }
  }
  if (
    input.displayedNextRerollCost !== null &&
    (!Number.isInteger(input.displayedNextRerollCost) || input.displayedNextRerollCost < 0)
  ) {
    return { ok: false, message: 'Displayed cost must be a non-negative whole number or blank.' }
  }
  const borderModIds = completeBorders(input.borders)
  if (!borderModIds) {
    return { ok: false, message: 'Import or enter all 12 recognised border modifiers first.' }
  }
  if (!input.sequenceId.trim()) {
    return { ok: false, message: 'Start a Voyage sequence before recording a roll.' }
  }

  return {
    ok: true,
    sample: {
      schema: BORDER_ROLL_SAMPLE_SCHEMA,
      sampleId: createId('roll'),
      sequenceId: input.sequenceId,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      gamePatch,
      vesperUpgradeCount: input.vesperUpgradeCount,
      generation: input.rerollIndex === 0 ? 'natural' : 'paid-reroll',
      rerollIndex: input.rerollIndex,
      displayedNextRerollCost: input.displayedNextRerollCost,
      borderModIds,
    },
  }
}

const sameBorders = (left: OrderedBorderIds, right: OrderedBorderIds) =>
  left.every((id, index) => id === right[index])

export function addBorderRollSample(
  store: BorderResearchStore,
  sample: BorderRollSample,
): AddSampleResult {
  const existing = store.samples.find(
    (item) => item.sequenceId === sample.sequenceId && item.rerollIndex === sample.rerollIndex,
  )
  if (existing) {
    return {
      status: sameBorders(existing.borderModIds, sample.borderModIds) ? 'duplicate' : 'conflict',
      store,
    }
  }
  return { status: 'added', store: { ...store, samples: [...store.samples, sample] } }
}

export function removeBorderRollSample(
  store: BorderResearchStore,
  sampleId: string,
): BorderResearchStore {
  const samples = store.samples.filter((sample) => sample.sampleId !== sampleId)
  const remainingSequenceIds = new Set(samples.map((sample) => sample.sequenceId))
  return {
    ...store,
    samples,
    archivedSequenceIds: store.archivedSequenceIds.filter((id) => remainingSequenceIds.has(id)),
  }
}

export function getBorderRollSequence(
  samples: BorderRollSample[],
  sequenceId: string,
): BorderRollSample[] {
  return samples
    .filter((sample) => sample.sequenceId === sequenceId)
    .sort((left, right) => left.rerollIndex - right.rerollIndex)
}

export function nextBorderRollIndex(samples: BorderRollSample[]): number {
  const recorded = new Set(samples.map((sample) => sample.rerollIndex))
  let index = 0
  while (recorded.has(index)) index += 1
  return index
}

export function isCompleteBorderRollSequence(samples: BorderRollSample[]): boolean {
  if (samples.length === 0) return false
  const ordered = [...samples].sort((left, right) => left.rerollIndex - right.rerollIndex)
  const [{ sequenceId, gamePatch, vesperUpgradeCount }] = ordered
  return ordered.every(
    (sample, index) =>
      sample.sequenceId === sequenceId &&
      sample.gamePatch === gamePatch &&
      sample.vesperUpgradeCount === vesperUpgradeCount &&
      sample.rerollIndex === index,
  )
}

function isStoredSample(value: unknown): value is BorderRollSample {
  if (!value || typeof value !== 'object') return false
  const sample = value as Partial<BorderRollSample>
  return (
    sample.schema === BORDER_ROLL_SAMPLE_SCHEMA &&
    typeof sample.sampleId === 'string' &&
    sample.sampleId.length > 0 &&
    typeof sample.sequenceId === 'string' &&
    sample.sequenceId.length > 0 &&
    typeof sample.capturedAt === 'string' &&
    Number.isFinite(Date.parse(sample.capturedAt)) &&
    typeof sample.gamePatch === 'string' &&
    sample.gamePatch.trim().length > 0 &&
    sample.gamePatch.length <= 32 &&
    (sample.vesperUpgradeCount === null || isVesperUpgradeCount(sample.vesperUpgradeCount)) &&
    (sample.generation === 'natural' || sample.generation === 'paid-reroll') &&
    typeof sample.rerollIndex === 'number' &&
    Number.isInteger(sample.rerollIndex) &&
    sample.rerollIndex >= 0 &&
    sample.rerollIndex <= 20 &&
    sample.generation === (sample.rerollIndex === 0 ? 'natural' : 'paid-reroll') &&
    (sample.displayedNextRerollCost === null ||
      (typeof sample.displayedNextRerollCost === 'number' &&
        Number.isInteger(sample.displayedNextRerollCost) &&
        sample.displayedNextRerollCost >= 0)) &&
    Array.isArray(sample.borderModIds) &&
    completeBorders(sample.borderModIds as Borders) !== null
  )
}

type PreviousBorderRollSample = Omit<BorderRollSample, 'vesperUpgradeCount'>

function isPreviousStoredSample(value: unknown): value is PreviousBorderRollSample {
  if (!value || typeof value !== 'object') return false
  const sample = value as Partial<BorderRollSample>
  return (
    sample.vesperUpgradeCount === undefined &&
    isStoredSample({ ...sample, vesperUpgradeCount: null })
  )
}

function migratePreviousSample(sample: PreviousBorderRollSample): BorderRollSample {
  return { ...sample, vesperUpgradeCount: null }
}

interface LegacyBorderRollSample extends Omit<BorderRollSample, 'schema' | 'vesperUpgradeCount'> {
  schema: typeof LEGACY_SAMPLE_SCHEMA
  voyageLevel: number
}

function isLegacyStoredSample(value: unknown): value is LegacyBorderRollSample {
  if (!value || typeof value !== 'object') return false
  const sample = value as Partial<LegacyBorderRollSample>
  if (
    sample.schema !== LEGACY_SAMPLE_SCHEMA ||
    typeof sample.voyageLevel !== 'number' ||
    !Number.isInteger(sample.voyageLevel) ||
    sample.voyageLevel < 1 ||
    sample.voyageLevel > 100
  ) {
    return false
  }
  const currentFields = { ...sample }
  delete currentFields.voyageLevel
  return isStoredSample({
    ...currentFields,
    schema: BORDER_ROLL_SAMPLE_SCHEMA,
    vesperUpgradeCount: null,
  })
}

function migrateLegacySample(sample: LegacyBorderRollSample): BorderRollSample {
  return {
    schema: BORDER_ROLL_SAMPLE_SCHEMA,
    sampleId: sample.sampleId,
    sequenceId: sample.sequenceId,
    capturedAt: sample.capturedAt,
    gamePatch: sample.gamePatch,
    vesperUpgradeCount: null,
    generation: sample.generation,
    rerollIndex: sample.rerollIndex,
    displayedNextRerollCost: sample.displayedNextRerollCost,
    borderModIds: sample.borderModIds,
  }
}

export function loadBorderResearch(): BorderResearchStore {
  let raw: string | null
  try {
    raw = localStorage.getItem(BORDER_RESEARCH_STORAGE_KEY)
  } catch {
    return {
      ...createBorderResearchStore(),
      recovery: unavailableAuxiliaryStore('Border research storage is unavailable.'),
    }
  }
  if (!raw) return createBorderResearchStore()

  let value: {
    version?: unknown
    activeSequenceId?: unknown
    vesperUpgradeCount?: unknown
    samples?: unknown
    archivedSequenceIds?: unknown
  }
  try {
    value = JSON.parse(raw) as typeof value
  } catch {
    return {
      ...createBorderResearchStore(),
      recovery: incompatibleAuxiliaryStore(
        BORDER_RESEARCH_STORAGE_KEY,
        raw,
        'invalid',
        'Border research data is malformed JSON.',
      ),
    }
  }

  try {
    if (
      value.version === STORE_VERSION &&
      typeof value.activeSequenceId === 'string' &&
      (value.vesperUpgradeCount === null || isVesperUpgradeCount(value.vesperUpgradeCount)) &&
      Array.isArray(value.samples) &&
      value.samples.every(isStoredSample) &&
      Array.isArray(value.archivedSequenceIds) &&
      value.archivedSequenceIds.every((id) => typeof id === 'string')
    ) {
      return value as BorderResearchStore
    }
    if (
      value.version === ARCHIVE_STORE_VERSION &&
      typeof value.activeSequenceId === 'string' &&
      Array.isArray(value.samples) &&
      value.samples.every(isPreviousStoredSample) &&
      Array.isArray(value.archivedSequenceIds) &&
      value.archivedSequenceIds.every((id) => typeof id === 'string')
    ) {
      const migrated: BorderResearchStore = {
        version: STORE_VERSION,
        activeSequenceId: value.activeSequenceId,
        vesperUpgradeCount: null,
        samples: value.samples.map(migratePreviousSample),
        archivedSequenceIds: value.archivedSequenceIds,
      }
      return saveBorderResearch(migrated)
        ? migrated
        : {
            ...migrated,
            recovery: unavailableAuxiliaryStore(
              'Migrated border research could not be saved because storage is unavailable.',
            ),
          }
    }
    if (
      value.version === PREVIOUS_STORE_VERSION &&
      typeof value.activeSequenceId === 'string' &&
      Array.isArray(value.samples) &&
      value.samples.every(isPreviousStoredSample)
    ) {
      const migrated: BorderResearchStore = {
        version: STORE_VERSION,
        activeSequenceId: value.activeSequenceId,
        vesperUpgradeCount: null,
        samples: value.samples.map(migratePreviousSample),
        archivedSequenceIds: [],
      }
      return saveBorderResearch(migrated)
        ? migrated
        : {
            ...migrated,
            recovery: unavailableAuxiliaryStore(
              'Migrated border research could not be saved because storage is unavailable.',
            ),
          }
    }
    if (
      value.version === LEGACY_STORE_VERSION &&
      typeof value.activeSequenceId === 'string' &&
      Array.isArray(value.samples) &&
      value.samples.every(isLegacyStoredSample)
    ) {
      const migrated: BorderResearchStore = {
        version: STORE_VERSION,
        activeSequenceId: value.activeSequenceId,
        vesperUpgradeCount: null,
        samples: value.samples.map(migrateLegacySample),
        archivedSequenceIds: [],
      }
      return saveBorderResearch(migrated)
        ? migrated
        : {
            ...migrated,
            recovery: unavailableAuxiliaryStore(
              'Migrated border research could not be saved because storage is unavailable.',
            ),
          }
    }
    const newer =
      typeof value.version === 'number' &&
      Number.isInteger(value.version) &&
      value.version > STORE_VERSION
    return {
      ...createBorderResearchStore(),
      recovery: incompatibleAuxiliaryStore(
        BORDER_RESEARCH_STORAGE_KEY,
        raw,
        newer ? 'incompatible' : 'invalid',
        newer
          ? `Border research version ${value.version} is newer than supported version ${STORE_VERSION}.`
          : 'Border research data failed validation.',
      ),
    }
  } catch {
    return {
      ...createBorderResearchStore(),
      recovery: incompatibleAuxiliaryStore(
        BORDER_RESEARCH_STORAGE_KEY,
        raw,
        'invalid',
        'Border research data could not be decoded.',
      ),
    }
  }
}

export function saveBorderResearch(store: BorderResearchStore): boolean {
  if (store.recovery) return false
  try {
    localStorage.setItem(BORDER_RESEARCH_STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export function resetBorderResearch(): BorderResearchStore {
  const clean = createBorderResearchStore()
  return saveBorderResearch(clean)
    ? clean
    : {
        ...clean,
        recovery: unavailableAuxiliaryStore('Border research storage is unavailable.'),
      }
}

export function serializeBorderRollDataset(
  samples: BorderRollSample[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(createBorderRollDataset(samples, exportedAt), null, 2)
}

export function buildBorderRollSequenceSubmissionUrl(samples: BorderRollSample[]): string {
  if (!isCompleteBorderRollSequence(samples)) {
    throw new Error('A submission must contain one Voyage sequence starting at natural roll 0.')
  }
  const ordered = [...samples].sort((left, right) => left.rerollIndex - right.rerollIndex)
  const title = `[data] Border roll sequence ${ordered[0].gamePatch}`
  const body = [
    'I captured the natural board before judging it and every paid reroll in order.',
    '',
    '```json',
    serializeBorderRollDataset(ordered),
    '```',
  ].join('\n')
  const query = new URLSearchParams({ title, body })
  return `${SUBMISSION_URL}?${query.toString()}`
}

/** @deprecated New submissions should contain a complete Voyage sequence. */
export function buildBorderRollSubmissionUrl(sample: BorderRollSample): string {
  const title = `[data] Border roll ${sample.gamePatch}`
  const body = [
    'I captured this full roll without selecting only good or unusual outcomes.',
    '',
    '```json',
    JSON.stringify(sample, null, 2),
    '```',
  ].join('\n')
  const query = new URLSearchParams({ title, body })
  return `${SUBMISSION_URL}?${query.toString()}`
}
