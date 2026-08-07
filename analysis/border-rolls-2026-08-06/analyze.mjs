import { execFileSync } from 'node:child_process'

const DEFAULT_REF = 'origin/main'
const SIMULATIONS = 20_000
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

const refIndex = process.argv.indexOf('--ref')
const gitRef = refIndex >= 0 ? process.argv[refIndex + 1] : DEFAULT_REF
if (!gitRef) throw new Error('--ref requires a Git ref')

function readAtRef(path) {
  return execFileSync('git', ['show', `${gitRef}:${path}`], { encoding: 'utf8' })
}

const dataset = JSON.parse(readAtRef('data/border-rolls-v2.json'))
const modSource = readAtRef('src/data/mods.ts')
const borderBlock = modSource.slice(
  modSource.indexOf('export const BORDER_MODS'),
  modSource.indexOf('export const voyageModById'),
)
const modIds = [...borderBlock.matchAll(/\bid:\s*'(b-[a-z0-9-]+)'/g)].map((match) => match[1])
const shortLabels = Object.fromEntries(
  [...borderBlock.matchAll(/\{\s*id:\s*'(b-[a-z0-9-]+)',[\s\S]*?short:\s*(?:'([^']*)'|"([^"]*)")/g)].map(
    (match) => [match[1], match[2] ?? match[3]],
  ),
)

function countSlots(samples, transform = (value) => value) {
  const categories = [...new Set(modIds.map(transform))]
  const counts = Object.fromEntries(categories.map((category) => [category, 0]))
  for (const sample of samples) {
    for (const modId of sample.borderModIds) counts[transform(modId)] += 1
  }
  return counts
}

function wilson(successes, trials, z = 1.959963984540054) {
  if (trials === 0) return [null, null]
  const rate = successes / trials
  const denominator = 1 + (z * z) / trials
  const center = (rate + (z * z) / (2 * trials)) / denominator
  const halfWidth =
    (z * Math.sqrt((rate * (1 - rate)) / trials + (z * z) / (4 * trials * trials))) /
    denominator
  return [center - halfWidth, center + halfWidth]
}

function pairMatches(sample) {
  const counts = {}
  for (const modId of sample.borderModIds) counts[modId] = (counts[modId] ?? 0) + 1
  return Object.values(counts).reduce((total, count) => total + (count * (count - 1)) / 2, 0)
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function shuffled(values, random) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function quantile(sortedValues, probability) {
  return sortedValues[Math.floor(probability * (sortedValues.length - 1))]
}

function duplicateProfile(samples) {
  return {
    boards: samples.length,
    boardsWithDuplicate: samples.filter((sample) => pairMatches(sample) > 0).length,
    matchingPairs: samples.reduce((total, sample) => total + pairMatches(sample), 0),
    meanDistinctMods:
      samples.reduce((total, sample) => total + new Set(sample.borderModIds).size, 0) /
      samples.length,
  }
}

function duplicateShuffleTest(samples, simulations = SIMULATIONS) {
  const random = mulberry32(2_026_080_6)
  const flat = samples.flatMap((sample) => sample.borderModIds)
  const observed = samples.reduce((total, sample) => total + pairMatches(sample), 0)
  const simulated = []
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const values = shuffled(flat, random)
    let matchingPairs = 0
    for (let boardIndex = 0; boardIndex < samples.length; boardIndex += 1) {
      matchingPairs += pairMatches({
        borderModIds: values.slice(boardIndex * 12, boardIndex * 12 + 12),
      })
    }
    simulated.push(matchingPairs)
  }
  simulated.sort((left, right) => left - right)
  return {
    observedMatchingPairs: observed,
    shuffledMean: simulated.reduce((total, value) => total + value, 0) / simulations,
    shuffled95Interval: [quantile(simulated, 0.025), quantile(simulated, 0.975)],
    upperTailP: (simulated.filter((value) => value >= observed).length + 1) / (simulations + 1),
    simulations,
  }
}

function totalVariation(naturalSamples, paidSamples) {
  const naturalCounts = countSlots(naturalSamples)
  const paidCounts = countSlots(paidSamples)
  const naturalSlots = naturalSamples.length * 12
  const paidSlots = paidSamples.length * 12
  return (
    0.5 *
    modIds.reduce(
      (total, modId) =>
        total + Math.abs(naturalCounts[modId] / naturalSlots - paidCounts[modId] / paidSlots),
      0,
    )
  )
}

function matchedGenerationTest(samples) {
  const sequences = Object.values(
    samples.reduce((groups, sample) => {
      ;(groups[sample.sequenceId] ??= []).push(sample)
      return groups
    }, {}),
  ).filter((sequence) => sequence.some((sample) => sample.generation === 'paid-reroll'))

  const observed = totalVariation(
    sequences.flatMap((sequence) =>
      sequence.filter((sample) => sample.generation === 'natural'),
    ),
    sequences.flatMap((sequence) =>
      sequence.filter((sample) => sample.generation === 'paid-reroll'),
    ),
  )

  let assignments = 0
  let atLeastObserved = 0
  function enumerate(sequenceIndex, naturalSamples, paidSamples) {
    if (sequenceIndex === sequences.length) {
      assignments += 1
      if (totalVariation(naturalSamples, paidSamples) >= observed - 1e-12) atLeastObserved += 1
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

const familyOf = (modId) => modId.replace(/-\d$/, '')

function slotAssociationStatistic(rows, transform = (value) => value) {
  const categories = [...new Set(modIds.map(transform))]
  const totals = Object.fromEntries(categories.map((category) => [category, 0]))
  const byPosition = Array.from({ length: 12 }, () =>
    Object.fromEntries(categories.map((category) => [category, 0])),
  )
  for (const row of rows) {
    row.forEach((modId, position) => {
      const category = transform(modId)
      totals[category] += 1
      byPosition[position][category] += 1
    })
  }
  let statistic = 0
  for (let position = 0; position < 12; position += 1) {
    for (const category of categories) {
      const expected = totals[category] / 12
      if (expected > 0) {
        statistic += ((byPosition[position][category] - expected) ** 2) / expected
      }
    }
  }
  return statistic
}

function slotAssociationTest(samples, simulations = SIMULATIONS) {
  const random = mulberry32(6_080_820_26)
  const observed = slotAssociationStatistic(
    samples.map((sample) => sample.borderModIds),
    familyOf,
  )
  const simulated = []
  for (let simulation = 0; simulation < simulations; simulation += 1) {
    simulated.push(
      slotAssociationStatistic(
        samples.map((sample) => shuffled(sample.borderModIds, random)),
        familyOf,
      ),
    )
  }
  simulated.sort((left, right) => left - right)
  return {
    observedStatistic: observed,
    shuffledMedian: quantile(simulated, 0.5),
    shuffled95Interval: [quantile(simulated, 0.025), quantile(simulated, 0.975)],
    upperTailP: (simulated.filter((value) => value >= observed).length + 1) / (simulations + 1),
    simulations,
  }
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
  Rarity: {
    slot: 4,
    ids: new Set(['b-rarity-1', 'b-rarity-2', 'b-rarity-3']),
  },
  Scarabs: {
    slot: 7,
    ids: new Set(['b-scarab-1', 'b-scarab-2', 'b-scarab-3']),
  },
  Experience: {
    slot: 10,
    ids: new Set(['b-exp-1', 'b-exp-2', 'b-exp-3']),
  },
}

function specialSlotProfile(samples) {
  const rows = []
  let observed = 0
  let inExpectedSlot = 0
  for (const [family, definition] of Object.entries(specialSlotFamilies)) {
    const positions = Array(12).fill(0)
    const modCounts = {}
    for (const sample of samples) {
      sample.borderModIds.forEach((modId, position) => {
        if (!definition.ids.has(modId)) return
        positions[position] += 1
        modCounts[modId] = (modCounts[modId] ?? 0) + 1
        observed += 1
        if (position === definition.slot) inExpectedSlot += 1
      })
    }
    rows.push({
      family,
      expectedPosition: POSITION_LABELS[definition.slot],
      observed: positions.reduce((total, count) => total + count, 0),
      inExpectedSlot: positions[definition.slot],
      positions,
      modCounts,
    })
  }
  return { observed, inExpectedSlot, rows }
}

const samples = dataset.samples
const naturalSamples = samples.filter((sample) => sample.generation === 'natural')
const paidSamples = samples.filter((sample) => sample.generation === 'paid-reroll')
const sequences = Object.values(
  samples.reduce((groups, sample) => {
    ;(groups[sample.sequenceId] ??= []).push(sample)
    return groups
  }, {}),
)
const allCounts = countSlots(samples)
const naturalCounts = countSlots(naturalSamples)
const paidCounts = countSlots(paidSamples)

const topMods = modIds
  .map((modId) => ({
    modId,
    label: shortLabels[modId] ?? modId,
    slots: allCounts[modId],
    slotShare: allCounts[modId] / (samples.length * 12),
    naturalSlots: naturalCounts[modId],
    paidSlots: paidCounts[modId],
    boards: samples.filter((sample) => sample.borderModIds.includes(modId)).length,
    sequences: sequences.filter((sequence) =>
      sequence.some((sample) => sample.borderModIds.includes(modId)),
    ).length,
  }))
  .sort((left, right) => right.slots - left.slots || left.modId.localeCompare(right.modId))

const paidSequenceCount = new Set(paidSamples.map((sample) => sample.sequenceId)).size
const divinePosteriorSlotProbability = 1 / (paidSamples.length * 12 + modIds.length)

const results = {
  source: {
    gitRef,
    datasetExportedAt: dataset.exportedAt,
    commit: execFileSync('git', ['rev-parse', gitRef], { encoding: 'utf8' }).trim(),
  },
  profile: {
    boards: samples.length,
    sequences: sequences.length,
    slots: samples.length * 12,
    naturalBoards: naturalSamples.length,
    paidBoards: paidSamples.length,
    paidSequences: paidSequenceCount,
    patches: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.gamePatch))].map((patch) => [
        patch,
        samples.filter((sample) => sample.gamePatch === patch).length,
      ]),
    ),
    vesperUpgradeCounts: Object.fromEntries(
      [...new Set(samples.map((sample) => sample.vesperUpgradeCount))].map((value) => [
        value === null ? 'unknown' : String(value),
        samples.filter((sample) => sample.vesperUpgradeCount === value).length,
      ]),
    ),
    canonicalModCount: modIds.length,
    observedModCount: topMods.filter((entry) => entry.slots > 0).length,
    unseenModCount: topMods.filter((entry) => entry.slots === 0).length,
  },
  concentration: {
    uniformSlotBenchmark: 1 / modIds.length,
    uniformBoardAppearanceBenchmark: 1 - (1 - 1 / modIds.length) ** 12,
    topEightSlotShare:
      topMods.slice(0, 8).reduce((total, entry) => total + entry.slots, 0) /
      (samples.length * 12),
    topMods: topMods.slice(0, 15),
  },
  slotStructure: {
    permutation: slotAssociationTest(samples),
    specialFamilies: specialSlotProfile(samples),
    first21: specialSlotProfile(samples.slice(0, 21)),
    afterFirst21: specialSlotProfile(samples.slice(21)),
  },
  duplicates: {
    all: duplicateProfile(samples),
    natural: duplicateProfile(naturalSamples),
    paid: duplicateProfile(paidSamples),
    paidShuffleTest: duplicateShuffleTest(paidSamples),
  },
  generationComparison: matchedGenerationTest(samples),
  costs: Object.fromEntries(
    [...new Set(samples.map((sample) => sample.rerollIndex))].map((rerollIndex) => [
      String(rerollIndex),
      Object.fromEntries(
        [...new Set(samples.filter((sample) => sample.rerollIndex === rerollIndex).map((sample) => sample.displayedNextRerollCost))].map(
          (cost) => [
            String(cost),
            samples.filter(
              (sample) =>
                sample.rerollIndex === rerollIndex && sample.displayedNextRerollCost === cost,
            ).length,
          ],
        ),
      ),
    ]),
  ),
  divine: {
    observedAllSlots: allCounts['b-divine'],
    observedPaidSlots: paidCounts['b-divine'],
    empiricalBoardAppearance: 0,
    empiricalBoardAppearance95Upper: wilson(0, samples.length)[1],
    modelPosteriorSlotProbability: divinePosteriorSlotProbability,
    modelPosteriorBoardChance: 1 - (1 - divinePosteriorSlotProbability) ** 12,
    note: 'The non-zero model estimate is entirely induced by the symmetric Dirichlet(1) prior.',
  },
}

console.log(JSON.stringify(results, null, 2))
