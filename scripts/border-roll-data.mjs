import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const SAMPLE_SCHEMA = 'allflame-border-roll/v2'
export const DATASET_SCHEMA = 'allflame-border-roll-dataset/v2'

const KNOWN_NEXT_COSTS = [3_000, 6_000, 12_000, 24_000, 48_000]
const ID_PATTERN = /^(?:roll|voyage)-[A-Za-z0-9-]{1,120}$/

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export async function loadKnownBorderIds(sourcePath = 'src/data/mods.ts') {
  const source = await readFile(sourcePath, 'utf8')
  const ids = new Set([...source.matchAll(/\bid:\s*'(b-[a-z0-9-]+)'/g)].map((match) => match[1]))
  if (ids.size === 0) throw new Error(`No canonical border IDs found in ${sourcePath}.`)
  return ids
}

export function extractJsonPayload(body) {
  if (typeof body !== 'string') throw new Error('Issue body is missing.')
  const blocks = [...body.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/gi)]
  if (blocks.length !== 1) {
    throw new Error(`Expected exactly one fenced JSON block; found ${blocks.length}.`)
  }
  try {
    return JSON.parse(blocks[0][1])
  } catch (error) {
    throw new Error(`JSON payload is invalid: ${error instanceof Error ? error.message : error}`)
  }
}

function normalizeSample(value, index, knownBorderIds, errors, warnings) {
  const path = `samples[${index}]`
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`)
    return null
  }

  if (value.schema !== SAMPLE_SCHEMA) errors.push(`${path}.schema must be ${SAMPLE_SCHEMA}.`)
  if (typeof value.sampleId !== 'string' || !ID_PATTERN.test(value.sampleId)) {
    errors.push(`${path}.sampleId is invalid.`)
  }
  if (typeof value.sequenceId !== 'string' || !ID_PATTERN.test(value.sequenceId)) {
    errors.push(`${path}.sequenceId is invalid.`)
  }
  if (typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))) {
    errors.push(`${path}.capturedAt must be an ISO-compatible timestamp.`)
  }
  if (
    typeof value.gamePatch !== 'string' ||
    value.gamePatch.trim().length === 0 ||
    value.gamePatch.length > 32
  ) {
    errors.push(`${path}.gamePatch must be a non-empty string up to 32 characters.`)
  }
  let vesperUpgradeCount = value.vesperUpgradeCount
  if (vesperUpgradeCount === undefined) {
    vesperUpgradeCount = null
    warnings.push(`${path}.vesperUpgradeCount is missing; normalized to legacy/unknown.`)
  } else if (
    vesperUpgradeCount !== null &&
    (!Number.isInteger(vesperUpgradeCount) || vesperUpgradeCount < 0 || vesperUpgradeCount > 5)
  ) {
    errors.push(`${path}.vesperUpgradeCount must be an integer from 0 to 5 or null.`)
  }
  if (!Number.isInteger(value.rerollIndex) || value.rerollIndex < 0 || value.rerollIndex > 20) {
    errors.push(`${path}.rerollIndex must be an integer from 0 to 20.`)
  }
  const expectedGeneration = value.rerollIndex === 0 ? 'natural' : 'paid-reroll'
  if (value.generation !== expectedGeneration) {
    errors.push(
      `${path}.generation must be ${expectedGeneration} for rerollIndex ${value.rerollIndex}.`,
    )
  }
  if (
    value.displayedNextRerollCost !== null &&
    (!Number.isInteger(value.displayedNextRerollCost) || value.displayedNextRerollCost < 0)
  ) {
    errors.push(`${path}.displayedNextRerollCost must be a non-negative integer or null.`)
  }
  if (!Array.isArray(value.borderModIds) || value.borderModIds.length !== 12) {
    errors.push(`${path}.borderModIds must contain exactly 12 values.`)
  } else {
    value.borderModIds.forEach((id, borderIndex) => {
      if (typeof id !== 'string' || !knownBorderIds.has(id)) {
        errors.push(`${path}.borderModIds[${borderIndex}] is not a canonical border modifier ID.`)
      }
    })
  }

  if (
    Number.isInteger(value.rerollIndex) &&
    KNOWN_NEXT_COSTS[value.rerollIndex] !== undefined &&
    value.displayedNextRerollCost !== KNOWN_NEXT_COSTS[value.rerollIndex]
  ) {
    warnings.push(
      `${path}.displayedNextRerollCost differs from the known ${KNOWN_NEXT_COSTS[value.rerollIndex]} cost; the observation was retained.`,
    )
  }

  if (errors.some((error) => error.startsWith(`${path}.`) || error.startsWith(`${path} `))) {
    return null
  }
  return {
    schema: SAMPLE_SCHEMA,
    sampleId: value.sampleId,
    sequenceId: value.sequenceId,
    capturedAt: new Date(value.capturedAt).toISOString(),
    gamePatch: value.gamePatch.trim(),
    vesperUpgradeCount,
    generation: value.generation,
    rerollIndex: value.rerollIndex,
    displayedNextRerollCost: value.displayedNextRerollCost,
    borderModIds: [...value.borderModIds],
  }
}

export function validateBorderRollPayload(payload, knownBorderIds) {
  const errors = []
  const warnings = []
  let exportedAt
  let rawSamples

  if (isRecord(payload) && payload.schema === SAMPLE_SCHEMA) {
    exportedAt = payload.capturedAt
    rawSamples = [payload]
  } else if (isRecord(payload) && payload.schema === DATASET_SCHEMA) {
    exportedAt = payload.exportedAt
    rawSamples = payload.samples
    if (typeof exportedAt !== 'string' || !Number.isFinite(Date.parse(exportedAt))) {
      errors.push('exportedAt must be an ISO-compatible timestamp.')
    }
    if (!Array.isArray(rawSamples) || rawSamples.length === 0 || rawSamples.length > 21) {
      errors.push('samples must contain between 1 and 21 rolls from one Voyage.')
      rawSamples = []
    }
    if (payload.sampleCount !== rawSamples.length) {
      errors.push('sampleCount must equal samples.length.')
    }
  } else {
    errors.push(`schema must be ${SAMPLE_SCHEMA} or ${DATASET_SCHEMA}.`)
    rawSamples = []
  }

  const samples = rawSamples
    .map((sample, index) => normalizeSample(sample, index, knownBorderIds, errors, warnings))
    .filter(Boolean)

  const sampleIds = samples.map((sample) => sample.sampleId)
  if (new Set(sampleIds).size !== sampleIds.length) errors.push('sampleId values must be unique.')

  const sequenceIds = new Set(samples.map((sample) => sample.sequenceId))
  if (sequenceIds.size > 1) errors.push('A submission must contain exactly one Voyage sequence.')
  const patches = new Set(samples.map((sample) => sample.gamePatch))
  if (patches.size > 1) errors.push('All samples in a Voyage must use the same game patch.')
  const vesperUpgradeCounts = new Set(samples.map((sample) => sample.vesperUpgradeCount))
  if (vesperUpgradeCounts.size > 1) {
    errors.push('All samples in a Voyage must use the same Vesper upgrade count.')
  }
  const indexes = samples.map((sample) => sample.rerollIndex)
  if (new Set(indexes).size !== indexes.length) errors.push('rerollIndex values must be unique.')

  if (errors.length > 0) return { status: 'invalid', errors, warnings, dataset: null, hash: null }

  samples.sort((left, right) => left.rerollIndex - right.rerollIndex)
  const complete = samples.every((sample, index) => sample.rerollIndex === index)
  const dataset = {
    schema: DATASET_SCHEMA,
    exportedAt: new Date(exportedAt).toISOString(),
    sampleCount: samples.length,
    samples,
  }
  const hash = createHash('sha256').update(JSON.stringify(dataset)).digest('hex')
  return {
    status: complete ? 'accepted' : 'partial',
    errors,
    warnings,
    dataset,
    hash,
  }
}

export function validateBorderRollIssueBody(body, knownBorderIds) {
  try {
    return validateBorderRollPayload(extractJsonPayload(body), knownBorderIds)
  } catch (error) {
    return {
      status: 'invalid',
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      dataset: null,
      hash: null,
    }
  }
}

const isTestIssue = (issue) =>
  Array.isArray(issue.labels) &&
  issue.labels.some((label) =>
    typeof label === 'string' ? label === 'border-roll:test' : label?.name === 'border-roll:test',
  )

export function findDuplicateSampleIds(result, acceptedIssues, knownBorderIds, currentIssueNumber) {
  if (!result.dataset) return []
  const accepted = new Map()
  for (const issue of acceptedIssues) {
    if (issue.number === currentIssueNumber || isTestIssue(issue)) continue
    const existing = validateBorderRollIssueBody(issue.body, knownBorderIds)
    if (existing.status !== 'accepted' || !existing.dataset) continue
    for (const sample of existing.dataset.samples) accepted.set(sample.sampleId, issue.number)
  }
  return result.dataset.samples
    .filter((sample) => accepted.has(sample.sampleId))
    .map((sample) => ({ sampleId: sample.sampleId, issueNumber: accepted.get(sample.sampleId) }))
}

export function buildCanonicalDataset(acceptedIssues, knownBorderIds) {
  const samplesById = new Map()
  for (const issue of acceptedIssues) {
    if (isTestIssue(issue)) continue
    const result = validateBorderRollIssueBody(issue.body, knownBorderIds)
    if (result.status !== 'accepted' || !result.dataset) continue
    for (const sample of result.dataset.samples) {
      const previous = samplesById.get(sample.sampleId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(sample)) {
        throw new Error(`Conflicting accepted samples use ID ${sample.sampleId}.`)
      }
      samplesById.set(sample.sampleId, sample)
    }
  }
  const samples = [...samplesById.values()].sort(
    (left, right) =>
      left.capturedAt.localeCompare(right.capturedAt) ||
      left.sequenceId.localeCompare(right.sequenceId) ||
      left.rerollIndex - right.rerollIndex ||
      left.sampleId.localeCompare(right.sampleId),
  )
  if (samples.length === 0) return null
  return {
    schema: DATASET_SCHEMA,
    exportedAt: samples.at(-1).capturedAt,
    sampleCount: samples.length,
    samples,
  }
}
