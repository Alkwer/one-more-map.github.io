import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const BASELINE_REF = argument('--baseline-ref') ?? '5da127d99125722301046ab56461574f73c67f1e'
const CURRENT_PATH = argument('--current-path')
const CURRENT_REF = argument('--current-ref') ?? process.argv[2] ?? 'origin/main'
const OUTPUT_PATH = argument('--output')
const PERMUTATIONS = 20_000

const POSITION_LABELS = [
  'Top 1',
  'Top 2',
  'Top 3',
  'Right 1',
  'Right 2',
  'Right 3',
  'Bottom 1',
  'Bottom 2',
  'Bottom 3',
  'Left 1',
  'Left 2',
  'Left 3',
]

function readAtRef(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' })
}

function commit(ref) {
  return execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim()
}

function readCurrent(path) {
  if (!CURRENT_PATH) return readAtRef(CURRENT_REF, path)
  return readFileSync(path === 'data/border-rolls-v2.json' ? CURRENT_PATH : path, 'utf8')
}

function parseMods(source) {
  const block = source.slice(
    source.indexOf('export const BORDER_MODS'),
    source.indexOf('export const voyageModById'),
  )
  const ids = [...block.matchAll(/\bid:\s*'(b-[a-z0-9-]+)'/g)].map((match) => match[1])
  const labels = Object.fromEntries(
    [
      ...block.matchAll(/\{\s*id:\s*'(b-[a-z0-9-]+)',[\s\S]*?short:\s*(?:'([^']*)'|"([^"]*)")/g),
    ].map((match) => [match[1], match[2] ?? match[3]]),
  )
  return { ids, labels }
}

const baselineDataset = JSON.parse(readAtRef(BASELINE_REF, 'data/border-rolls-v2.json'))
const currentDataset = JSON.parse(readCurrent('data/border-rolls-v2.json'))
const { ids: modIds, labels } = parseMods(readCurrent('src/data/mods.ts'))
const baselineSampleIds = new Set(baselineDataset.samples.map((sample) => sample.sampleId))
const incrementalSamples = currentDataset.samples.filter(
  (sample) => !baselineSampleIds.has(sample.sampleId),
)

function groupSequences(samples) {
  return Object.values(
    samples.reduce((groups, sample) => {
      ;(groups[sample.sequenceId] ??= []).push(sample)
      return groups
    }, {}),
  )
}

function counter(values) {
  const counts = {}
  for (const value of values) counts[String(value)] = (counts[String(value)] ?? 0) + 1
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function countMods(samples) {
  const counts = Object.fromEntries(modIds.map((id) => [id, 0]))
  for (const sample of samples) {
    for (const modId of sample.borderModIds) counts[modId] += 1
  }
  return counts
}

function profile(samples) {
  const sequences = groupSequences(samples)
  const natural = samples.filter((sample) => sample.generation === 'natural')
  const paid = samples.filter((sample) => sample.generation === 'paid-reroll')
  const counts = countMods(samples)
  return {
    boards: samples.length,
    sequences: sequences.length,
    slots: samples.length * 12,
    naturalBoards: natural.length,
    paidBoards: paid.length,
    paidSequences: new Set(paid.map((sample) => sample.sequenceId)).size,
    patches: counter(samples.map((sample) => sample.gamePatch)),
    vesperUpgradeCounts: counter(
      samples.map((sample) =>
        sample.vesperUpgradeCount === null ? 'unknown' : sample.vesperUpgradeCount,
      ),
    ),
    samplingReasons: counter(samples.map((sample) => sample.samplingReason ?? 'unknown')),
    observedMods: modIds.filter((id) => counts[id] > 0).length,
    unseenMods: modIds.filter((id) => counts[id] === 0).length,
  }
}

function duplicateProfile(samples) {
  const pairMatches = (sample) => {
    const counts = counter(sample.borderModIds)
    return Object.values(counts).reduce((sum, count) => sum + (count * (count - 1)) / 2, 0)
  }
  const duplicateBoards = samples.filter(
    (sample) => new Set(sample.borderModIds).size < sample.borderModIds.length,
  )
  return {
    boards: samples.length,
    boardsWithDuplicate: duplicateBoards.length,
    boardRate: samples.length === 0 ? null : duplicateBoards.length / samples.length,
    matchingPairs: samples.reduce((sum, sample) => sum + pairMatches(sample), 0),
    meanDistinctMods:
      samples.length === 0
        ? null
        : samples.reduce((sum, sample) => sum + new Set(sample.borderModIds).size, 0) /
          samples.length,
  }
}

function share(counts, id, slotCount) {
  return slotCount === 0 ? 0 : counts[id] / slotCount
}

function totalVariation(leftSamples, rightSamples) {
  const left = countMods(leftSamples)
  const right = countMods(rightSamples)
  const leftSlots = leftSamples.length * 12
  const rightSlots = rightSamples.length * 12
  return (
    0.5 *
    modIds.reduce(
      (sum, id) => sum + Math.abs(share(left, id, leftSlots) - share(right, id, rightSlots)),
      0,
    )
  )
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffle(values, random) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function naturalDriftPermutation(baselineSamples, newSamples) {
  const oldNatural = baselineSamples.filter((sample) => sample.generation === 'natural')
  const newNatural = newSamples.filter((sample) => sample.generation === 'natural')
  const combined = [...oldNatural, ...newNatural]
  const observed = totalVariation(oldNatural, newNatural)
  const random = mulberry32(20260815)
  let atLeastObserved = 0
  const simulated = []
  for (let index = 0; index < PERMUTATIONS; index += 1) {
    const permuted = shuffle(combined, random)
    const statistic = totalVariation(
      permuted.slice(0, oldNatural.length),
      permuted.slice(oldNatural.length),
    )
    simulated.push(statistic)
    if (statistic >= observed) atLeastObserved += 1
  }
  simulated.sort((left, right) => left - right)
  const quantile = (probability) => simulated[Math.floor((simulated.length - 1) * probability)]
  return {
    oldNaturalBoards: oldNatural.length,
    newNaturalBoards: newNatural.length,
    observedTotalVariation: observed,
    shuffledMedian: quantile(0.5),
    shuffled95Interval: [quantile(0.025), quantile(0.975)],
    upperTailP: (atLeastObserved + 1) / (PERMUTATIONS + 1),
    permutations: PERMUTATIONS,
  }
}

function matchedGenerationTest(samples) {
  const sequences = groupSequences(samples).filter((sequence) =>
    sequence.some((sample) => sample.generation === 'paid-reroll'),
  )
  const observed = totalVariation(
    sequences.flatMap((sequence) => sequence.filter((sample) => sample.generation === 'natural')),
    sequences.flatMap((sequence) =>
      sequence.filter((sample) => sample.generation === 'paid-reroll'),
    ),
  )
  let assignments = 0
  let atLeastObserved = 0

  function enumerate(sequenceIndex, naturalSamples, paidSamples) {
    if (sequenceIndex === sequences.length) {
      assignments += 1
      if (totalVariation(naturalSamples, paidSamples) >= observed - 1e-12) {
        atLeastObserved += 1
      }
      return
    }
    const sequence = sequences[sequenceIndex]
    for (let naturalIndex = 0; naturalIndex < sequence.length; naturalIndex += 1) {
      enumerate(
        sequenceIndex + 1,
        naturalSamples.concat(sequence[naturalIndex]),
        paidSamples.concat(sequence.filter((_, index) => index !== naturalIndex)),
      )
    }
  }

  enumerate(0, [], [])
  return {
    matchedSequences: sequences.length,
    observedTotalVariation: observed,
    exactAssignments: assignments,
    upperTailP: atLeastObserved / assignments,
  }
}

function pearson(left, right) {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
  let numerator = 0
  let leftSquares = 0
  let rightSquares = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftSquares += leftDelta ** 2
    rightSquares += rightDelta ** 2
  }
  return numerator / Math.sqrt(leftSquares * rightSquares)
}

const specialSlotFamilies = {
  'Currency / currency drops': {
    slot: 1,
    ids: new Set([
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
    ]),
  },
  Rarity: { slot: 4, ids: new Set(['b-rarity-1', 'b-rarity-2', 'b-rarity-3']) },
  Scarabs: { slot: 7, ids: new Set(['b-scarab-1', 'b-scarab-2', 'b-scarab-3']) },
  Experience: { slot: 10, ids: new Set(['b-exp-1', 'b-exp-2', 'b-exp-3']) },
}

const candidateSlotMasks = {
  'Rare / rare-per-connection': {
    slots: new Set([5, 6, 7, 8, 11]),
    slotLabel: 'Pięć segmentów dotykających dolnego rzędu',
    ids: new Set(['b-rare-1', 'b-rare-2', 'b-rare-3', 'b-rareconn-1', 'b-rareconn-2']),
  },
  'At least magic': {
    slots: new Set([0, 1, 2, 3, 9]),
    slotLabel: 'Pięć segmentów dotykających górnego rzędu',
    ids: new Set(['b-minmagic']),
  },
}

function specialSlotProfile(samples) {
  return Object.entries(specialSlotFamilies).map(([family, definition]) => {
    const positions = Array(12).fill(0)
    const violations = []
    for (const sample of samples) {
      sample.borderModIds.forEach((modId, position) => {
        if (!definition.ids.has(modId)) return
        positions[position] += 1
        if (position !== definition.slot) {
          violations.push({
            sampleId: sample.sampleId,
            sequenceId: sample.sequenceId,
            capturedAt: sample.capturedAt,
            generation: sample.generation,
            modId,
            label: labels[modId] ?? modId,
            expectedPosition: POSITION_LABELS[definition.slot],
            observedPosition: POSITION_LABELS[position],
          })
        }
      })
    }
    const observed = positions.reduce((sum, count) => sum + count, 0)
    return {
      family,
      expectedPosition: POSITION_LABELS[definition.slot],
      observed,
      inExpectedSlot: positions[definition.slot],
      matchRate: observed === 0 ? null : positions[definition.slot] / observed,
      violations,
    }
  })
}

function rerollCostProfile(samples) {
  const byIndex = {}
  for (const sample of samples) {
    const index = String(sample.rerollIndex)
    const cost = String(sample.displayedNextRerollCost)
    ;(byIndex[index] ??= {})[cost] = ((byIndex[index] ?? {})[cost] ?? 0) + 1
  }
  return byIndex
}

function candidateMaskProfile(samples) {
  return Object.entries(candidateSlotMasks).map(([family, definition]) => {
    const positions = Array(12).fill(0)
    for (const sample of samples) {
      sample.borderModIds.forEach((modId, position) => {
        if (definition.ids.has(modId)) positions[position] += 1
      })
    }
    const observed = positions.reduce((sum, count) => sum + count, 0)
    const inMask = [...definition.slots].reduce((sum, slot) => sum + positions[slot], 0)
    return {
      family,
      candidateMask: definition.slotLabel,
      observed,
      inMask,
      matchRate: observed === 0 ? null : inMask / observed,
      positions,
    }
  })
}

function multiplicityProfile(samples) {
  const cases = samples.map((sample) => {
    const counts = counter(sample.borderModIds)
    const [modId, count] = Object.entries(counts).sort(
      ([leftId, leftCount], [rightId, rightCount]) =>
        rightCount - leftCount || leftId.localeCompare(rightId),
    )[0]
    return { sample, modId, count }
  })
  const maximum = Math.max(...cases.map((entry) => entry.count))
  return {
    boards: samples.length,
    maximumCopiesOnOneBoard: maximum,
    boardsWithAtLeastThreeCopies: cases.filter((entry) => entry.count >= 3).length,
    boardsWithAtLeastFourCopies: cases.filter((entry) => entry.count >= 4).length,
    maximumCases: cases
      .filter((entry) => entry.count === maximum)
      .map(({ sample, modId, count }) => ({
        capturedAt: sample.capturedAt,
        generation: sample.generation,
        modId,
        label: labels[modId] ?? modId,
        copies: count,
      })),
  }
}

function wilsonUpper(successes, trials, z = 1.959963984540054) {
  if (trials === 0) return null
  const rate = successes / trials
  const denominator = 1 + (z * z) / trials
  const center = (rate + (z * z) / (2 * trials)) / denominator
  const halfWidth =
    (z * Math.sqrt((rate * (1 - rate)) / trials + (z * z) / (4 * trials * trials))) / denominator
  return center + halfWidth
}

function validateDataset(dataset) {
  const errors = []
  if (dataset.sampleCount !== dataset.samples.length) errors.push('sampleCount mismatch')
  if (new Set(dataset.samples.map((sample) => sample.sampleId)).size !== dataset.samples.length) {
    errors.push('duplicate sampleId')
  }
  for (const sequence of groupSequences(dataset.samples)) {
    const indexes = sequence.map((sample) => sample.rerollIndex).sort((left, right) => left - right)
    if (indexes.some((value, index) => value !== index)) errors.push('non-contiguous sequence')
    if (new Set(sequence.map((sample) => sample.gamePatch)).size !== 1) {
      errors.push('mixed patch within sequence')
    }
    if (new Set(sequence.map((sample) => sample.vesperUpgradeCount)).size !== 1) {
      errors.push('mixed Vesper count within sequence')
    }
    if (new Set(sequence.map((sample) => sample.samplingReason)).size !== 1) {
      errors.push('mixed sampling reason within sequence')
    }
  }
  for (const sample of dataset.samples) {
    if (sample.borderModIds.length !== 12) errors.push('board without 12 slots')
    if (sample.borderModIds.some((id) => !modIds.includes(id))) errors.push('unknown modifier id')
    const expected = sample.rerollIndex === 0 ? 'natural' : 'paid-reroll'
    if (sample.generation !== expected) errors.push('generation/rerollIndex mismatch')
  }
  const latest = [...dataset.samples]
    .map((sample) => sample.capturedAt)
    .sort((left, right) => left.localeCompare(right))
    .at(-1)
  if (dataset.exportedAt !== latest) errors.push('exportedAt is not latest capture')
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

const baselineCounts = countMods(baselineDataset.samples)
const incrementalCounts = countMods(incrementalSamples)
const currentCounts = countMods(currentDataset.samples)
const baselineTopEight = [...modIds]
  .sort((left, right) => baselineCounts[right] - baselineCounts[left] || left.localeCompare(right))
  .slice(0, 8)
const slotShare = (counts, samples, selectedIds) =>
  selectedIds.reduce((sum, id) => sum + counts[id], 0) / (samples.length * 12)
const newlyObservedMods = modIds
  .filter((id) => baselineCounts[id] === 0 && currentCounts[id] > 0)
  .map((id) => ({ modId: id, label: labels[id] ?? id, newSlots: incrementalCounts[id] }))

const currentPaid = currentDataset.samples.filter((sample) => sample.generation === 'paid-reroll')
const currentDivineBoards = currentDataset.samples.filter((sample) =>
  sample.borderModIds.includes('b-divine'),
).length
const currentPaidDivineBoards = currentPaid.filter((sample) =>
  sample.borderModIds.includes('b-divine'),
).length
const currentNatural = currentDataset.samples.filter((sample) => sample.generation === 'natural')
const fixedSlotByModId = new Map()
for (const definition of Object.values(specialSlotFamilies)) {
  for (const id of definition.ids) fixedSlotByModId.set(id, definition.slot)
}
const observedSlotsByModId = Object.fromEntries(modIds.map((id) => [id, new Set()]))
for (const sample of currentDataset.samples) {
  sample.borderModIds.forEach((id, slot) => observedSlotsByModId[id].add(slot))
}
const divineEligibleSlots = Array.from({ length: 12 }, (_, slot) => slot).filter((slot) => {
  const fixedSlot = fixedSlotByModId.get('b-divine')
  return fixedSlot === undefined || fixedSlot === slot || observedSlotsByModId['b-divine'].has(slot)
})
const eligibleCountBySlot = Array.from(
  { length: 12 },
  (_, slot) =>
    modIds.filter((id) => {
      const fixedSlot = fixedSlotByModId.get(id)
      return fixedSlot === undefined || fixedSlot === slot || observedSlotsByModId[id].has(slot)
    }).length,
)
const divinePriorOnlyBoardChance = divineEligibleSlots.reduce((chanceAbsent, slot) => {
  const weightedObservations = currentPaid.length + 0.5 * currentNatural.length
  const probability = 1 / (weightedObservations + eligibleCountBySlot[slot])
  return chanceAbsent * (1 - probability)
}, 1)
const normalizeHistoricalSample = (sample) => ({
  ...sample,
  samplingReason: sample.samplingReason ?? 'unknown',
})
const stableStringify = (value) =>
  JSON.stringify(value, (_key, nested) => {
    if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) return nested
    return Object.fromEntries(
      Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)),
    )
  })

const results = {
  source: {
    baselineRef: BASELINE_REF,
    baselineCommit: commit(BASELINE_REF),
    baselineExportedAt: baselineDataset.exportedAt,
    currentRef: CURRENT_PATH ? `working-tree:${CURRENT_PATH}` : CURRENT_REF,
    currentCommit: commit(CURRENT_PATH ? 'HEAD' : CURRENT_REF),
    currentWorkingTree: Boolean(CURRENT_PATH),
    currentExportedAt: currentDataset.exportedAt,
  },
  dataQuality: {
    validation: validateDataset(currentDataset),
    canonicalModifiers: modIds.length,
    incrementalSampleIdsUnique:
      incrementalSamples.length === new Set(incrementalSamples.map((s) => s.sampleId)).size,
    baselineSampleIdsRetained: baselineDataset.samples.every((sample) =>
      currentDataset.samples.some((candidate) => candidate.sampleId === sample.sampleId),
    ),
    baselineSemanticallyRetainedAfterLegacyNormalization: baselineDataset.samples.every((sample) =>
      currentDataset.samples.some(
        (candidate) =>
          candidate.sampleId === sample.sampleId &&
          stableStringify(normalizeHistoricalSample(candidate)) ===
            stableStringify(normalizeHistoricalSample(sample)),
      ),
    ),
  },
  profile: {
    baseline: profile(baselineDataset.samples),
    incremental: profile(incrementalSamples),
    current: profile(currentDataset.samples),
  },
  stability: {
    baselineTopEight: baselineTopEight.map((id) => ({ modId: id, label: labels[id] ?? id })),
    baselineTopEightSlotShare: slotShare(baselineCounts, baselineDataset.samples, baselineTopEight),
    incrementalBaselineTopEightSlotShare: slotShare(
      incrementalCounts,
      incrementalSamples,
      baselineTopEight,
    ),
    currentBaselineTopEightSlotShare: slotShare(
      currentCounts,
      currentDataset.samples,
      baselineTopEight,
    ),
    modifierSharePearsonOldVsIncremental: pearson(
      modIds.map((id) => baselineCounts[id] / (baselineDataset.samples.length * 12)),
      modIds.map((id) => incrementalCounts[id] / (incrementalSamples.length * 12)),
    ),
    naturalBoardDriftTest: naturalDriftPermutation(baselineDataset.samples, incrementalSamples),
    newlyObservedMods,
  },
  generationComparison: matchedGenerationTest(currentDataset.samples),
  slotStructure: {
    baseline: specialSlotProfile(baselineDataset.samples),
    incremental: specialSlotProfile(incrementalSamples),
    current: specialSlotProfile(currentDataset.samples),
  },
  duplicates: {
    baseline: duplicateProfile(baselineDataset.samples),
    incremental: duplicateProfile(incrementalSamples),
    current: duplicateProfile(currentDataset.samples),
  },
  multiplicity: {
    baseline: multiplicityProfile(baselineDataset.samples),
    incremental: multiplicityProfile(incrementalSamples),
    current: multiplicityProfile(currentDataset.samples),
  },
  rerollCosts: rerollCostProfile(currentDataset.samples),
  candidateSlotMasks: {
    baseline: candidateMaskProfile(baselineDataset.samples),
    incremental: candidateMaskProfile(incrementalSamples),
    current: candidateMaskProfile(currentDataset.samples),
    note: 'Exploratory hypotheses discovered on the current corpus; preregister before treating future replication as confirmatory.',
  },
  divine: {
    allBoards: currentDataset.samples.length,
    allBoardHits: currentDivineBoards,
    allBoardAppearance95Upper: wilsonUpper(currentDivineBoards, currentDataset.samples.length),
    paidBoards: currentPaid.length,
    paidBoardHits: currentPaidDivineBoards,
    paidBoardAppearance95Upper: wilsonUpper(currentPaidDivineBoards, currentPaid.length),
    shippedModelPriorOnlyBoardChance: 1 - divinePriorOnlyBoardChance,
    shippedModelEligibleSlots: divineEligibleSlots,
  },
  chartRows: {
    cohortGrowth: [
      {
        cohort: 'Poprzednia analiza',
        boards: baselineDataset.samples.length,
        sequences: groupSequences(baselineDataset.samples).length,
        paidBoards: baselineDataset.samples.filter((sample) => sample.generation === 'paid-reroll')
          .length,
      },
      {
        cohort: 'Nowy przyrost',
        boards: incrementalSamples.length,
        sequences: groupSequences(incrementalSamples).length,
        paidBoards: incrementalSamples.filter((sample) => sample.generation === 'paid-reroll')
          .length,
      },
      {
        cohort: 'Obecny korpus',
        boards: currentDataset.samples.length,
        sequences: groupSequences(currentDataset.samples).length,
        paidBoards: currentPaid.length,
      },
    ],
    topEightStability: [
      {
        cohort: 'Poprzednia próba',
        slotShare: slotShare(baselineCounts, baselineDataset.samples, baselineTopEight),
        slots: baselineDataset.samples.length * 12,
        boards: baselineDataset.samples.length,
      },
      {
        cohort: 'Nowe plansze',
        slotShare: slotShare(incrementalCounts, incrementalSamples, baselineTopEight),
        slots: incrementalSamples.length * 12,
        boards: incrementalSamples.length,
      },
      {
        cohort: 'Łącznie',
        slotShare: slotShare(currentCounts, currentDataset.samples, baselineTopEight),
        slots: currentDataset.samples.length * 12,
        boards: currentDataset.samples.length,
      },
    ],
  },
}

const serializedResults = `${JSON.stringify(results, null, 2)}\n`
if (OUTPUT_PATH) writeFileSync(OUTPUT_PATH, serializedResults)
else process.stdout.write(serializedResults)
