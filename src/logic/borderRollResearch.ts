import { borderModById } from '../data/mods'
import type { Borders } from '../types'

export const BORDER_ROLL_SAMPLE_SCHEMA = 'allflame-border-roll/v2' as const
export const BORDER_ROLL_DATASET_SCHEMA = 'allflame-border-roll-dataset/v2' as const

const LEGACY_SAMPLE_SCHEMA = 'allflame-border-roll/v1' as const
const LEGACY_STORE_VERSION = 1
const STORE_VERSION = 2
const STORAGE_KEY = 'allflame-border-roll-research'
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
  samples: BorderRollSample[]
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
    samples: [],
  }
}

export function startBorderRollSequence(store: BorderResearchStore): BorderResearchStore {
  return { ...store, activeSequenceId: createId('voyage') }
}

function completeBorders(borders: Borders): OrderedBorderIds | null {
  if (borders.length !== 12 || borders.some((id) => !id || !borderModById.has(id))) return null
  return [...borders] as OrderedBorderIds
}

export function createBorderRollSample(input: CreateSampleInput): CreateSampleResult {
  const gamePatch = input.gamePatch.trim()
  if (!gamePatch || gamePatch.length > 32) {
    return { ok: false, message: 'Enter the current game patch (for example 3.29.0).' }
  }
  if (!Number.isInteger(input.rerollIndex) || input.rerollIndex < 0 || input.rerollIndex > 20) {
    return { ok: false, message: 'Reroll number must be a whole number from 0 to 20.' }
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
  return { ...store, samples: store.samples.filter((sample) => sample.sampleId !== sampleId) }
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
  const [{ sequenceId, gamePatch }] = ordered
  return ordered.every(
    (sample, index) =>
      sample.sequenceId === sequenceId &&
      sample.gamePatch === gamePatch &&
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

interface LegacyBorderRollSample extends Omit<BorderRollSample, 'schema'> {
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
  return isStoredSample({ ...currentFields, schema: BORDER_ROLL_SAMPLE_SCHEMA })
}

function migrateLegacySample(sample: LegacyBorderRollSample): BorderRollSample {
  return {
    schema: BORDER_ROLL_SAMPLE_SCHEMA,
    sampleId: sample.sampleId,
    sequenceId: sample.sequenceId,
    capturedAt: sample.capturedAt,
    gamePatch: sample.gamePatch,
    generation: sample.generation,
    rerollIndex: sample.rerollIndex,
    displayedNextRerollCost: sample.displayedNextRerollCost,
    borderModIds: sample.borderModIds,
  }
}

export function loadBorderResearch(): BorderResearchStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createBorderResearchStore()
    const value = JSON.parse(raw) as {
      version?: unknown
      activeSequenceId?: unknown
      samples?: unknown
    }
    if (
      value.version === STORE_VERSION &&
      typeof value.activeSequenceId === 'string' &&
      Array.isArray(value.samples) &&
      value.samples.every(isStoredSample)
    ) {
      return value as BorderResearchStore
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
        samples: value.samples.map(migrateLegacySample),
      }
      saveBorderResearch(migrated)
      return migrated
    }
    return createBorderResearchStore()
  } catch {
    return createBorderResearchStore()
  }
}

export function saveBorderResearch(store: BorderResearchStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage full or unavailable */
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
