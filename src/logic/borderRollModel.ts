import borderRollDatasetJson from '../../data/border-rolls-v2.json'
import { BORDER_MODS } from '../data/mods'

export const BORDER_ROLL_MODEL_VERSION = 1 as const
export const BORDER_ROLL_PRIOR_PER_MOD = 1
export const BORDER_ROLL_FORECAST_DRAWS = 4_096

const EPSILON = 1e-9

export type BorderRollModelConfidence = 'low' | 'medium' | 'high'
export type BorderRollModelProfile = 'pooled' | 'natural' | 'paid-reroll'

interface BorderRollDatasetSample {
  sequenceId: string
  generation: 'natural' | 'paid-reroll'
  borderModIds: string[]
}

export interface BorderRollDatasetInput {
  exportedAt: string
  samples: BorderRollDatasetSample[]
}

export interface BorderRollModel {
  version: typeof BORDER_ROLL_MODEL_VERSION
  profile: BorderRollModelProfile
  exportedAt: string
  sampleCount: number
  sequenceCount: number
  slotCount: number
  naturalBoardCount: number
  paidRerollBoardCount: number
  confidence: BorderRollModelConfidence
  priorPerMod: number
  modIds: string[]
  probabilities: Record<string, number>
}

export interface BorderRollForecast {
  modelVersion: typeof BORDER_ROLL_MODEL_VERSION
  modelProfile: BorderRollModelProfile
  modelConfidence: BorderRollModelConfidence
  sampleCount: number
  sequenceCount: number
  expectedScore: number
  expectedFit: number
  medianFit: number
  sixtiethPercentileFit: number
  currentPercentile: number
  chanceNextRollBeatsCurrent: number
}

export type BorderContributionTable = Readonly<Record<string, number>>

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function confidenceFor(sequenceCount: number): BorderRollModelConfidence {
  if (sequenceCount >= 100) return 'high'
  if (sequenceCount >= 30) return 'medium'
  return 'low'
}

/**
 * Versioned smoothed model for one generation profile. A symmetric Dirichlet(1)
 * prior prevents an unseen but known modifier from being treated as impossible.
 */
export function buildBorderRollModel(
  dataset: BorderRollDatasetInput,
  modIds = BORDER_MODS.map((mod) => mod.id),
  profile: BorderRollModelProfile = 'pooled',
): BorderRollModel {
  const uniqueModIds = [...new Set(modIds)]
  if (uniqueModIds.length === 0) throw new Error('Border roll model requires known modifiers.')

  const known = new Set(uniqueModIds)
  const counts = Object.fromEntries(uniqueModIds.map((id) => [id, 0])) as Record<string, number>
  const selectedSamples = dataset.samples.filter(
    (sample) => profile === 'pooled' || sample.generation === profile,
  )
  if (selectedSamples.length === 0) {
    throw new Error(`Border roll dataset has no samples for profile ${profile}.`)
  }

  for (const sample of selectedSamples) {
    for (const id of sample.borderModIds) {
      if (!known.has(id)) throw new Error(`Border roll dataset contains unknown modifier ${id}.`)
      counts[id] += 1
    }
  }

  const slotCount = selectedSamples.reduce((sum, sample) => sum + sample.borderModIds.length, 0)
  const denominator = slotCount + BORDER_ROLL_PRIOR_PER_MOD * uniqueModIds.length
  const probabilities = Object.fromEntries(
    uniqueModIds.map((id) => [id, (counts[id] + BORDER_ROLL_PRIOR_PER_MOD) / denominator]),
  )
  const sequenceCount = new Set(selectedSamples.map((sample) => sample.sequenceId)).size

  return {
    version: BORDER_ROLL_MODEL_VERSION,
    profile,
    exportedAt: dataset.exportedAt,
    sampleCount: selectedSamples.length,
    sequenceCount,
    slotCount,
    naturalBoardCount: dataset.samples.filter((sample) => sample.generation === 'natural').length,
    paidRerollBoardCount: dataset.samples.filter((sample) => sample.generation === 'paid-reroll')
      .length,
    confidence: confidenceFor(sequenceCount),
    priorPerMod: BORDER_ROLL_PRIOR_PER_MOD,
    modIds: uniqueModIds,
    probabilities,
  }
}

function stableSeed(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function selectIndex(cumulative: number[], value: number): number {
  let low = 0
  let high = cumulative.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (value <= cumulative[middle]) high = middle
    else low = middle + 1
  }
  return low
}

const quantile = (values: number[], probability: number) =>
  values[Math.floor(probability * (values.length - 1))]

/**
 * Posterior-predictive roll forecast for one concrete chart layout. Slots are
 * sampled independently from the selected profile weights. This assumption is
 * deliberately visible through the model version and confidence label.
 */
export function forecastBorderRoll(
  model: BorderRollModel,
  contributions: readonly BorderContributionTable[],
  currentScore: number,
  ceiling: number,
  draws = BORDER_ROLL_FORECAST_DRAWS,
): BorderRollForecast | null {
  if (contributions.length === 0 || ceiling <= EPSILON || draws < 1) return null

  const cumulative: number[] = []
  let running = 0
  for (const id of model.modIds) {
    running += model.probabilities[id] ?? 0
    cumulative.push(running)
  }
  cumulative[cumulative.length - 1] = 1

  const expectedScore = contributions.reduce(
    (total, segment) =>
      total +
      model.modIds.reduce(
        (sum, id) => sum + (model.probabilities[id] ?? 0) * (segment[id] ?? 0),
        0,
      ),
    0,
  )

  const random = mulberry32(
    stableSeed(`${model.version}:${model.exportedAt}:${contributions.length}`),
  )
  const simulatedScores = Array.from({ length: draws }, () => {
    let score = 0
    for (const segment of contributions) {
      const id = model.modIds[selectIndex(cumulative, random())]
      score += segment[id] ?? 0
    }
    return score
  }).sort((left, right) => left - right)

  let below = 0
  let equal = 0
  let above = 0
  for (const score of simulatedScores) {
    if (score < currentScore - EPSILON) below += 1
    else if (score > currentScore + EPSILON) above += 1
    else equal += 1
  }

  return {
    modelVersion: model.version,
    modelProfile: model.profile,
    modelConfidence: model.confidence,
    sampleCount: model.sampleCount,
    sequenceCount: model.sequenceCount,
    expectedScore,
    expectedFit: clamp01(expectedScore / ceiling),
    medianFit: clamp01(quantile(simulatedScores, 0.5) / ceiling),
    sixtiethPercentileFit: clamp01(quantile(simulatedScores, 0.6) / ceiling),
    currentPercentile: (below + equal / 2) / draws,
    chanceNextRollBeatsCurrent: above / draws,
  }
}

export function chanceModAppearsOnBoard(
  model: BorderRollModel,
  modId: string,
  slots = 12,
): number | null {
  const probability = model.probabilities[modId]
  if (probability === undefined || slots < 1) return null
  return 1 - (1 - probability) ** slots
}

export const BORDER_ROLL_MODEL = buildBorderRollModel(
  borderRollDatasetJson as BorderRollDatasetInput,
  BORDER_MODS.map((mod) => mod.id),
  'paid-reroll',
)
