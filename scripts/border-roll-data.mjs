import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const SAMPLE_SCHEMA = 'allflame-border-roll/v2'
export const DATASET_SCHEMA = 'allflame-border-roll-dataset/v2'

const KNOWN_NEXT_COSTS = [3_000, 6_000, 12_000, 24_000, 48_000]
const ID_PATTERN = /^(?:roll|voyage)-[A-Za-z0-9-]{1,120}$/

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hashDataset = (dataset) => createHash('sha256').update(JSON.stringify(dataset)).digest('hex')
const omitSampleFields = (dataset, fields) => ({
  ...dataset,
  samples: dataset.samples.map((sample) =>
    Object.fromEntries(Object.entries(sample).filter(([field]) => !fields.has(field))),
  ),
})

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
    throw new Error(`JSON payload is invalid: ${error instanceof Error ? error.message : error}`, {
      cause: error,
    })
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
  let samplingReason = value.samplingReason
  if (samplingReason === undefined) {
    samplingReason = 'unknown'
    warnings.push(`${path}.samplingReason is missing; normalized to legacy/unknown.`)
  } else if (!['gameplay', 'randomized-research', 'unknown'].includes(samplingReason)) {
    errors.push(`${path}.samplingReason must be gameplay, randomized-research, or unknown.`)
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
    samplingReason,
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
  const samplingReasons = new Set(samples.map((sample) => sample.samplingReason))
  if (samplingReasons.size > 1) {
    errors.push('All samples in a Voyage must use the same sampling reason.')
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
  const hash = hashDataset(dataset)
  const acceptedHashCandidates = new Set([hash])
  const allSamplesOmit = (field) =>
    rawSamples.every((sample) => isRecord(sample) && sample[field] === undefined)

  // Accepted comments store the normalized dataset hash produced at validation time.
  // Older validators predate these fields, so reproduce their hashes only while the
  // current issue body still omits the corresponding fields. Adding or changing a
  // field after acceptance therefore remains a digest mismatch.
  if (allSamplesOmit('samplingReason')) {
    acceptedHashCandidates.add(hashDataset(omitSampleFields(dataset, new Set(['samplingReason']))))
    if (allSamplesOmit('vesperUpgradeCount')) {
      acceptedHashCandidates.add(
        hashDataset(omitSampleFields(dataset, new Set(['vesperUpgradeCount', 'samplingReason']))),
      )
    }
  }
  return {
    status: complete ? 'accepted' : 'partial',
    errors,
    warnings,
    dataset,
    hash,
    acceptedHashCandidates: [...acceptedHashCandidates],
  }
}

export function validateCanonicalDataset(payload, knownBorderIds) {
  const errors = []
  const warnings = []
  if (!isRecord(payload) || payload.schema !== DATASET_SCHEMA) {
    return { ok: false, errors: [`schema must be ${DATASET_SCHEMA}.`], warnings: [] }
  }
  if (typeof payload.exportedAt !== 'string' || !Number.isFinite(Date.parse(payload.exportedAt))) {
    errors.push('exportedAt must be an ISO-compatible timestamp.')
  }
  const rawSamples = Array.isArray(payload.samples) ? payload.samples : []
  if (!Array.isArray(payload.samples) || rawSamples.length === 0) {
    errors.push('samples must be a non-empty array.')
  }
  if (payload.sampleCount !== rawSamples.length) {
    errors.push('sampleCount must equal samples.length.')
  }
  const samples = rawSamples
    .map((sample, index) => normalizeSample(sample, index, knownBorderIds, errors, warnings))
    .filter(Boolean)
  const sampleIds = samples.map(({ sampleId }) => sampleId)
  if (new Set(sampleIds).size !== sampleIds.length) errors.push('sampleId values must be unique.')
  const canonical = [...samples].sort(
    (left, right) =>
      left.capturedAt.localeCompare(right.capturedAt) ||
      left.sequenceId.localeCompare(right.sequenceId) ||
      left.rerollIndex - right.rerollIndex ||
      left.sampleId.localeCompare(right.sampleId),
  )
  if (JSON.stringify(samples) !== JSON.stringify(canonical)) {
    errors.push('samples must use canonical ordering.')
  }
  if (samples.length > 0 && payload.exportedAt !== samples.at(-1).capturedAt) {
    errors.push('exportedAt must equal the final canonical sample timestamp.')
  }
  return { ok: errors.length === 0, errors, warnings }
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
    for (const sample of existing.dataset.samples) {
      const matches = accepted.get(sample.sampleId) ?? []
      matches.push({ issueNumber: issue.number, sample })
      accepted.set(sample.sampleId, matches)
    }
  }
  return result.dataset.samples
    .filter((sample) => accepted.has(sample.sampleId))
    .map((sample) => {
      const matches = accepted.get(sample.sampleId)
      return {
        sampleId: sample.sampleId,
        issueNumbers: [...new Set(matches.map(({ issueNumber }) => issueNumber))].sort(
          (left, right) => left - right,
        ),
        kind: matches.some(
          ({ sample: acceptedSample }) => JSON.stringify(acceptedSample) !== JSON.stringify(sample),
        )
          ? 'conflict'
          : 'identical',
      }
    })
}

export function buildCanonicalDataset(
  acceptedIssues,
  knownBorderIds,
  { requireAcceptedDigest = false } = {},
) {
  const samplesById = new Map()
  const conflicts = []
  const digestMismatches = []
  const orderedIssues = acceptedIssues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (left, right) =>
        (left.issue.number ?? Number.MAX_SAFE_INTEGER) -
          (right.issue.number ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
    )
    .map(({ issue }) => issue)
  for (const issue of orderedIssues) {
    if (isTestIssue(issue)) continue
    const result = validateBorderRollIssueBody(issue.body, knownBorderIds)
    if (result.status !== 'accepted' || !result.dataset) continue
    if (requireAcceptedDigest && !result.acceptedHashCandidates.includes(issue.acceptedHash)) {
      digestMismatches.push({
        issueNumber: issue.number,
        recordedHash: issue.acceptedHash ?? null,
        currentHash: result.hash,
      })
      continue
    }
    for (const sample of result.dataset.samples) {
      const previous = samplesById.get(sample.sampleId)
      if (previous && JSON.stringify(previous.sample) !== JSON.stringify(sample)) {
        conflicts.push({
          sampleId: sample.sampleId,
          keptIssueNumber: previous.issueNumber,
          conflictingIssueNumber: issue.number,
        })
        continue
      }
      if (!previous) samplesById.set(sample.sampleId, { sample, issueNumber: issue.number })
    }
  }
  const samples = [...samplesById.values()]
    .map(({ sample }) => sample)
    .sort(
      (left, right) =>
        left.capturedAt.localeCompare(right.capturedAt) ||
        left.sequenceId.localeCompare(right.sequenceId) ||
        left.rerollIndex - right.rerollIndex ||
        left.sampleId.localeCompare(right.sampleId),
    )
  const output = {
    dataset:
      samples.length === 0
        ? null
        : {
            schema: DATASET_SCHEMA,
            exportedAt: samples.at(-1).capturedAt,
            sampleCount: samples.length,
            samples,
          },
    conflicts,
  }
  if (requireAcceptedDigest) output.digestMismatches = digestMismatches
  return output
}
