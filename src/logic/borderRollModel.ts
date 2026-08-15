import borderRollDatasetJson from '../../data/border-rolls-v2.json'
import { BORDER_MODS } from '../data/mods'

export const BORDER_ROLL_MODEL_VERSION = 3 as const
export const BORDER_ROLL_PRIOR_PER_MOD = 1
export const BORDER_ROLL_FORECAST_DRAWS = 4_096
export const BORDER_ROLL_SLOT_COUNT = 12
export const BORDER_ROLL_PRIOR_SENSITIVITY = [0.25, 2] as const
export const BORDER_ROLL_NATURAL_BORROW_WEIGHT = 0.5

export const BORDER_ROLL_PRESPECIFIED_SLOT_FAMILIES = [
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
export type BorderRollModelTrainingProfile = 'single-profile' | 'pooled-borrowed'
export type BorderRollChanceEvidence = 'observed' | 'borrowed' | 'prior-only'

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
  trainingProfile: BorderRollModelTrainingProfile
  exportedAt: string
  /** Target-profile boards. Confidence and actionability are based on these only. */
  sampleCount: number
  sequenceCount: number
  slotCount: number
  /** Boards used to estimate probabilities after borrowing compatible observations. */
  trainingSampleCount: number
  trainingSlotCount: number
  borrowedNaturalBoardCount: number
  naturalBorrowWeight: number
  naturalBoardCount: number
  paidRerollBoardCount: number
  confidence: BorderRollModelConfidence
  priorPerMod: number
  modIds: string[]
  /** Observations from the target profile, used for evidence labels. */
  observations: Record<string, number>
  borrowedObservations: Record<string, number>
  probabilities: Record<string, number>
  slotObservationCounts: number[]
  observationsBySlot: Record<string, number>[]
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
  currentPercentileRange: readonly [number, number]
  chanceNextRollBeatsCurrent: number
  chanceNextRollBeatsCurrentRange: readonly [number, number]
  priorSensitivity: typeof BORDER_ROLL_PRIOR_SENSITIVITY
  borrowedNaturalBoardCount: number
}

export type BorderContributionTable = Readonly<Record<string, number>>

export interface BorderModBoardChanceEstimate {
  chance: number
  evidence: BorderRollChanceEvidence
  observations: number
  borrowedObservations: number
  eligibleSlots: number[]
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function confidenceFor(sequenceCount: number): BorderRollModelConfidence {
  if (sequenceCount >= 100) return 'high'
  if (sequenceCount >= 30) return 'medium'
  return 'low'
}

/**
 * Versioned smoothed model for one generation profile. Version 3 maintains one
 * posterior per physical border slot. Four data-backed semantic families start
 * with prespecified slot eligibility; any contradictory observed slot is
 * automatically added so new evidence can widen, rather than be discarded by,
 * the hypothesis.
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
  const prespecifiedSlotByModId = new Map<string, number>()
  for (const family of BORDER_ROLL_PRESPECIFIED_SLOT_FAMILIES) {
    for (const id of family.modIds) prespecifiedSlotByModId.set(id, family.slot)
  }
  const eligibleModIdsBySlot = Array.from({ length: BORDER_ROLL_SLOT_COUNT }, (_, slot) =>
    uniqueModIds.filter((id) => {
      const prespecifiedSlot = prespecifiedSlotByModId.get(id)
      return (
        prespecifiedSlot === undefined || prespecifiedSlot === slot || countsBySlot[slot][id] > 0
      )
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
    trainingProfile: 'single-profile',
    exportedAt: dataset.exportedAt,
    sampleCount: selectedSamples.length,
    sequenceCount,
    slotCount,
    trainingSampleCount: selectedSamples.length,
    trainingSlotCount: slotCount,
    borrowedNaturalBoardCount: 0,
    naturalBorrowWeight: 0,
    naturalBoardCount: dataset.samples.filter((sample) => sample.generation === 'natural').length,
    paidRerollBoardCount: dataset.samples.filter((sample) => sample.generation === 'paid-reroll')
      .length,
    confidence: confidenceFor(sequenceCount),
    priorPerMod: BORDER_ROLL_PRIOR_PER_MOD,
    modIds: uniqueModIds,
    observations: counts,
    borrowedObservations: Object.fromEntries(uniqueModIds.map((id) => [id, 0])),
    probabilities,
    slotObservationCounts,
    observationsBySlot: countsBySlot,
    eligibleModIdsBySlot,
    probabilitiesBySlot,
  }
}

/**
 * Estimate paid-reroll probabilities with all compatible rolls while keeping
 * confidence tied to paid Voyage sequences. Natural boards stabilize the very
 * sparse slot posteriors but can never move confidence out of low by themselves.
 */
export function buildBorrowedPaidRerollModel(
  dataset: BorderRollDatasetInput,
  modIds = BORDER_MODS.map((mod) => mod.id),
): BorderRollModel {
  const pooled = buildBorderRollModel(dataset, modIds, 'pooled')
  const paid = buildBorderRollModel(dataset, modIds, 'paid-reroll')
  const natural = buildBorderRollModel(dataset, modIds, 'natural')
  const observationsBySlot = paid.observationsBySlot.map(
    (paidSlot, slot) =>
      Object.fromEntries(
        paid.modIds.map((id) => [
          id,
          paidSlot[id] +
            BORDER_ROLL_NATURAL_BORROW_WEIGHT * (natural.observationsBySlot[slot][id] ?? 0),
        ]),
      ) as Record<string, number>,
  )
  const slotObservationCounts = paid.slotObservationCounts.map(
    (count, slot) =>
      count + BORDER_ROLL_NATURAL_BORROW_WEIGHT * natural.slotObservationCounts[slot],
  )
  const probabilitiesBySlot = pooled.eligibleModIdsBySlot.map((eligibleIds, slot) => {
    const eligible = new Set(eligibleIds)
    const denominator = slotObservationCounts[slot] + BORDER_ROLL_PRIOR_PER_MOD * eligibleIds.length
    return Object.fromEntries(
      paid.modIds.map((id) => [
        id,
        eligible.has(id)
          ? (observationsBySlot[slot][id] + BORDER_ROLL_PRIOR_PER_MOD) / denominator
          : 0,
      ]),
    ) as Record<string, number>
  })
  const weightedObservations = Object.fromEntries(
    paid.modIds.map((id) => [
      id,
      paid.observations[id] + BORDER_ROLL_NATURAL_BORROW_WEIGHT * (natural.observations[id] ?? 0),
    ]),
  ) as Record<string, number>
  const weightedSlotCount = paid.slotCount + BORDER_ROLL_NATURAL_BORROW_WEIGHT * natural.slotCount
  const probabilityDenominator = weightedSlotCount + BORDER_ROLL_PRIOR_PER_MOD * paid.modIds.length
  const probabilities = Object.fromEntries(
    paid.modIds.map((id) => [
      id,
      (weightedObservations[id] + BORDER_ROLL_PRIOR_PER_MOD) / probabilityDenominator,
    ]),
  )
  return {
    ...pooled,
    profile: 'paid-reroll',
    trainingProfile: 'pooled-borrowed',
    sampleCount: paid.sampleCount,
    sequenceCount: paid.sequenceCount,
    slotCount: paid.slotCount,
    confidence: paid.confidence,
    trainingSampleCount: pooled.sampleCount,
    trainingSlotCount: pooled.slotCount,
    borrowedNaturalBoardCount: natural.sampleCount,
    naturalBorrowWeight: BORDER_ROLL_NATURAL_BORROW_WEIGHT,
    observations: paid.observations,
    borrowedObservations: natural.observations,
    probabilities,
    slotObservationCounts,
    observationsBySlot,
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

function probabilitiesForPrior(model: BorderRollModel, priorPerMod: number) {
  return model.eligibleModIdsBySlot.map((eligibleIds, slot) => {
    const eligible = new Set(eligibleIds)
    const denominator = model.slotObservationCounts[slot] + priorPerMod * eligibleIds.length
    return Object.fromEntries(
      model.modIds.map((id) => [
        id,
        eligible.has(id)
          ? ((model.observationsBySlot[slot]?.[id] ?? 0) + priorPerMod) / denominator
          : 0,
      ]),
    ) as Record<string, number>
  })
}

function simulateForecast(
  model: BorderRollModel,
  contributions: readonly BorderContributionTable[],
  currentScore: number,
  draws: number,
  probabilitiesBySlot: Record<string, number>[],
  seedSuffix: string,
) {
  const distributions = contributions.map((_, slot) => {
    const probabilities = probabilitiesBySlot[slot] ?? model.probabilities
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
    stableSeed(`${model.version}:${model.exportedAt}:${contributions.length}:${seedSuffix}`),
  )
  const scores = Array.from({ length: draws }, () => {
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
  for (const score of scores) {
    if (score < currentScore - EPSILON) below += 1
    else if (score > currentScore + EPSILON) above += 1
    else equal += 1
  }
  return {
    distributions,
    expectedScore,
    scores,
    currentPercentile: (below + equal / 2) / draws,
    chanceNextRollBeatsCurrent: above / draws,
  }
}

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

  const point = simulateForecast(
    model,
    contributions,
    currentScore,
    draws,
    model.probabilitiesBySlot,
    `prior-${model.priorPerMod}`,
  )
  const sensitivity = BORDER_ROLL_PRIOR_SENSITIVITY.map((prior) =>
    simulateForecast(
      model,
      contributions,
      currentScore,
      draws,
      probabilitiesForPrior(model, prior),
      `prior-${prior}`,
    ),
  )
  const percentileValues = [
    point.currentPercentile,
    ...sensitivity.map((item) => item.currentPercentile),
  ]
  const improveValues = [
    point.chanceNextRollBeatsCurrent,
    ...sensitivity.map((item) => item.chanceNextRollBeatsCurrent),
  ]

  return {
    modelVersion: model.version,
    modelProfile: model.profile,
    modelConfidence: model.confidence,
    modelStructure: 'slot-aware',
    sampleCount: model.sampleCount,
    sequenceCount: model.sequenceCount,
    expectedScore: point.expectedScore,
    expectedFit: clamp01(point.expectedScore / ceiling),
    medianFit: clamp01(quantile(point.scores, 0.5) / ceiling),
    sixtiethPercentileFit: clamp01(quantile(point.scores, 0.6) / ceiling),
    currentPercentile: point.currentPercentile,
    currentPercentileRange: [Math.min(...percentileValues), Math.max(...percentileValues)],
    chanceNextRollBeatsCurrent: point.chanceNextRollBeatsCurrent,
    chanceNextRollBeatsCurrentRange: [Math.min(...improveValues), Math.max(...improveValues)],
    priorSensitivity: BORDER_ROLL_PRIOR_SENSITIVITY,
    borrowedNaturalBoardCount: model.borrowedNaturalBoardCount,
  }
}

/** Draw one experimental board from the same slot-aware distribution as the model. */
export function sampleBorderRoll(
  model: BorderRollModel,
  random: () => number = Math.random,
): string[] {
  return Array.from({ length: BORDER_ROLL_SLOT_COUNT }, (_, slot) => {
    const probabilities = model.probabilitiesBySlot[slot] ?? model.probabilities
    const ids = model.modIds.filter((id) => (probabilities[id] ?? 0) > 0)
    let cumulative = 0
    const draw = random()
    for (const id of ids) {
      cumulative += probabilities[id] ?? 0
      if (draw <= cumulative) return id
    }
    return ids[ids.length - 1]
  })
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
  const borrowedObservations = model.borrowedObservations[modId] ?? 0
  return {
    chance,
    evidence: observations > 0 ? 'observed' : borrowedObservations > 0 ? 'borrowed' : 'prior-only',
    observations,
    borrowedObservations,
    eligibleSlots: Array.from({ length: slots }, (_, slot) => slot).filter(
      (slot) => (model.probabilitiesBySlot[slot]?.[modId] ?? model.probabilities[modId]) > 0,
    ),
  }
}

export const BORDER_ROLL_MODEL = buildBorrowedPaidRerollModel(
  borderRollDatasetJson as BorderRollDatasetInput,
  BORDER_MODS.map((mod) => mod.id),
)
