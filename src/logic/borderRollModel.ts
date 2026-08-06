import borderRollDatasetJson from '../../data/border-rolls-v2.json'
import { BORDER_MODS } from '../data/mods'

export const BORDER_ROLL_MODEL_VERSION = 2 as const
export const BORDER_ROLL_PRIOR_PER_MOD = 1
export const BORDER_ROLL_FORECAST_DRAWS = 4_096
export const BORDER_ROLL_SLOT_COUNT = 12

export const BORDER_ROLL_FIXED_SLOT_FAMILIES = [
  {
    slot: 1,
    modIds: [
      'b-curr-1',
      'b-curr-2',
      'b-curr-3',
      'b-ancient',
      'b-divine',
      'b-exalt',
      'b-annul',
      'b-chaos',
      'b-vaal',
      'b-gcp',
      'b-chrome',
      'b-regret',
      'b-blessed',
      'b-regal',
    ],
  },
  { slot: 4, modIds: ['b-rarity-1', 'b-rarity-2', 'b-rarity-3'] },
  { slot: 7, modIds: ['b-scarab-1', 'b-scarab-2', 'b-scarab-3'] },
  { slot: 10, modIds: ['b-exp-1', 'b-exp-2', 'b-exp-3'] },
] as const

const EPSILON = 1e-9

export type BorderRollModelConfidence = 'low' | 'medium' | 'high'
export type BorderRollModelProfile = 'pooled' | 'natural' | 'paid-reroll'
export type BorderRollChanceEvidence = 'observed' | 'prior-only'

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
  observations: Record<string, number>
  probabilities: Record<string, number>
  slotObservationCounts: number[]
  eligibleModIdsBySlot: string[][]
  probabilitiesBySlot: Record<string, number>[]
}

export interface BorderRollForecast {
  modelVersion: typeof BORDER_ROLL_MODEL_VERSION
  modelProfile: BorderRollModelProfile
  modelConfidence: BorderRollModelConfidence
  modelStructure: 'slot-aware'
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

export interface BorderModBoardChanceEstimate {
  chance: number
  evidence: BorderRollChanceEvidence
  observations: number
  eligibleSlots: number[]
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function confidenceFor(sequenceCount: number): BorderRollModelConfidence {
  if (sequenceCount >= 100) return 'high'
  if (sequenceCount >= 30) return 'medium'
  return 'low'
}

/**
 * Versioned smoothed model for one generation profile. Version 2 maintains one
 * posterior per physical border slot. Four data-backed semantic families start
 * with fixed-slot eligibility; any contradictory observed slot is automatically
 * added so new evidence can widen, rather than be discarded by, the hypothesis.
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
  const countsBySlot = Array.from(
    { length: BORDER_ROLL_SLOT_COUNT },
    () => Object.fromEntries(uniqueModIds.map((id) => [id, 0])) as Record<string, number>,
  )
  const slotObservationCounts = Array(BORDER_ROLL_SLOT_COUNT).fill(0) as number[]
  const selectedSamples = dataset.samples.filter(
    (sample) => profile === 'pooled' || sample.generation === profile,
  )
  if (selectedSamples.length === 0) {
    throw new Error(`Border roll dataset has no samples for profile ${profile}.`)
  }

  for (const sample of selectedSamples) {
    if (sample.borderModIds.length > BORDER_ROLL_SLOT_COUNT) {
      throw new Error(`Border roll sample exceeds ${BORDER_ROLL_SLOT_COUNT} slots.`)
    }
    for (const [slot, id] of sample.borderModIds.entries()) {
      if (!known.has(id)) throw new Error(`Border roll dataset contains unknown modifier ${id}.`)
      counts[id] += 1
      countsBySlot[slot][id] += 1
      slotObservationCounts[slot] += 1
    }
  }

  const slotCount = selectedSamples.reduce((sum, sample) => sum + sample.borderModIds.length, 0)
  const denominator = slotCount + BORDER_ROLL_PRIOR_PER_MOD * uniqueModIds.length
  const probabilities = Object.fromEntries(
    uniqueModIds.map((id) => [id, (counts[id] + BORDER_ROLL_PRIOR_PER_MOD) / denominator]),
  )
  const fixedSlotByModId = new Map<string, number>()
  for (const family of BORDER_ROLL_FIXED_SLOT_FAMILIES) {
    for (const id of family.modIds) fixedSlotByModId.set(id, family.slot)
  }
  const eligibleModIdsBySlot = Array.from({ length: BORDER_ROLL_SLOT_COUNT }, (_, slot) =>
    uniqueModIds.filter((id) => {
      const fixedSlot = fixedSlotByModId.get(id)
      return fixedSlot === undefined || fixedSlot === slot || countsBySlot[slot][id] > 0
    }),
  )
  const probabilitiesBySlot = eligibleModIdsBySlot.map((eligibleIds, slot) => {
    const eligible = new Set(eligibleIds)
    const slotDenominator =
      slotObservationCounts[slot] + BORDER_ROLL_PRIOR_PER_MOD * eligibleIds.length
    return Object.fromEntries(
      uniqueModIds.map((id) => [
        id,
        eligible.has(id)
          ? (countsBySlot[slot][id] + BORDER_ROLL_PRIOR_PER_MOD) / slotDenominator
          : 0,
      ]),
    )
  })
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
    observations: counts,
    probabilities,
    slotObservationCounts,
    eligibleModIdsBySlot,
    probabilitiesBySlot,
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
 * Posterior-predictive roll forecast for one concrete chart layout. Each entry
 * in contributions retains its physical slot index and is sampled from that
 * slot's posterior. Slots remain conditionally independent within a board.
 */
export function forecastBorderRoll(
  model: BorderRollModel,
  contributions: readonly BorderContributionTable[],
  currentScore: number,
  ceiling: number,
  draws = BORDER_ROLL_FORECAST_DRAWS,
): BorderRollForecast | null {
  if (contributions.length === 0 || ceiling <= EPSILON || draws < 1) return null

  const distributions = contributions.map((_, slot) => {
    const probabilities = model.probabilitiesBySlot[slot] ?? model.probabilities
    const ids = model.modIds.filter((id) => (probabilities[id] ?? 0) > 0)
    const cumulative: number[] = []
    let running = 0
    for (const id of ids) {
      running += probabilities[id] ?? 0
      cumulative.push(running)
    }
    cumulative[cumulative.length - 1] = 1
    return { cumulative, ids, probabilities }
  })

  const expectedScore = contributions.reduce(
    (total, segment, slot) =>
      total +
      model.modIds.reduce(
        (sum, id) => sum + (distributions[slot].probabilities[id] ?? 0) * (segment[id] ?? 0),
        0,
      ),
    0,
  )

  const random = mulberry32(
    stableSeed(`${model.version}:${model.exportedAt}:${contributions.length}`),
  )
  const simulatedScores = Array.from({ length: draws }, () => {
    let score = 0
    for (const [slot, segment] of contributions.entries()) {
      const distribution = distributions[slot]
      const id = distribution.ids[selectIndex(distribution.cumulative, random())]
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
    modelStructure: 'slot-aware',
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
  if (model.probabilities[modId] === undefined || slots < 1) return null
  let absentChance = 1
  for (let slot = 0; slot < slots; slot += 1) {
    const probability = model.probabilitiesBySlot[slot]?.[modId] ?? model.probabilities[modId]
    absentChance *= 1 - probability
  }
  return 1 - absentChance
}

export function estimateModBoardChance(
  model: BorderRollModel,
  modId: string,
  slots = BORDER_ROLL_SLOT_COUNT,
): BorderModBoardChanceEstimate | null {
  const chance = chanceModAppearsOnBoard(model, modId, slots)
  if (chance === null) return null
  const observations = model.observations[modId] ?? 0
  return {
    chance,
    evidence: observations === 0 ? 'prior-only' : 'observed',
    observations,
    eligibleSlots: Array.from({ length: slots }, (_, slot) => slot).filter(
      (slot) => (model.probabilitiesBySlot[slot]?.[modId] ?? model.probabilities[modId]) > 0,
    ),
  }
}

export const BORDER_ROLL_MODEL = buildBorderRollModel(
  borderRollDatasetJson as BorderRollDatasetInput,
  BORDER_MODS.map((mod) => mod.id),
  'paid-reroll',
)
