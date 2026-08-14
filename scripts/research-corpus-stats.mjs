import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const DEFAULT_DATASET_PATH = 'data/border-rolls-v2.json'
export const DEFAULT_RESEARCH_PATH = 'RESEARCH.md'
export const RESEARCH_STATS_START = '<!-- border-roll-corpus-stats:start -->'
export const RESEARCH_STATS_END = '<!-- border-roll-corpus-stats:end -->'

const normalizeSummary = (value) => value.trim().replace(/\s+/g, ' ')

export function deriveResearchCorpusStats(dataset) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.samples)) {
    throw new Error('Canonical border-roll dataset must contain a samples array.')
  }
  if (dataset.sampleCount !== dataset.samples.length) {
    throw new Error('Canonical border-roll sampleCount must equal samples.length.')
  }
  if (typeof dataset.exportedAt !== 'string' || Number.isNaN(Date.parse(dataset.exportedAt))) {
    throw new Error('Canonical border-roll dataset must have a valid exportedAt timestamp.')
  }

  const voyageIds = new Set()
  const paidVoyageIds = new Set()
  let naturalBoards = 0
  let paidRerolls = 0

  for (const [index, sample] of dataset.samples.entries()) {
    if (!sample || typeof sample.sequenceId !== 'string' || sample.sequenceId.length === 0) {
      throw new Error(`Canonical border-roll sample ${index} must have a sequenceId.`)
    }
    voyageIds.add(sample.sequenceId)
    if (sample.generation === 'natural') {
      naturalBoards += 1
    } else if (sample.generation === 'paid-reroll') {
      paidRerolls += 1
      paidVoyageIds.add(sample.sequenceId)
    } else {
      throw new Error(
        `Canonical border-roll sample ${index} has unsupported generation ${JSON.stringify(sample.generation)}.`,
      )
    }
  }

  return {
    exportedDate: new Date(dataset.exportedAt).toISOString().slice(0, 10),
    boards: dataset.samples.length,
    voyages: voyageIds.size,
    naturalBoards,
    paidRerolls,
    paidSequences: paidVoyageIds.size,
  }
}

export const renderResearchCorpusSummary = (stats) =>
  `The canonical ${stats.exportedDate} export contains ${stats.boards} boards from ${stats.voyages} Voyages: ` +
  `${stats.naturalBoards} natural boards and ${stats.paidRerolls} paid rerolls from ${stats.paidSequences} paid sequences.`

const locateStatsBlock = (researchText) => {
  const start = researchText.indexOf(RESEARCH_STATS_START)
  const end = researchText.indexOf(RESEARCH_STATS_END, start + RESEARCH_STATS_START.length)
  if (start === -1 || end === -1) return null
  if (
    researchText.indexOf(RESEARCH_STATS_START, start + RESEARCH_STATS_START.length) !== -1 ||
    researchText.indexOf(RESEARCH_STATS_END, end + RESEARCH_STATS_END.length) !== -1
  ) {
    throw new Error('RESEARCH.md must contain exactly one generated corpus-statistics block.')
  }
  return {
    start,
    end: end + RESEARCH_STATS_END.length,
    contentStart: start + RESEARCH_STATS_START.length,
    contentEnd: end,
  }
}

export function verifyResearchCorpusStats(researchText, dataset) {
  const stats = deriveResearchCorpusStats(dataset)
  const expected = renderResearchCorpusSummary(stats)
  const block = locateStatsBlock(researchText)
  if (!block) {
    return {
      ok: false,
      stats,
      expected,
      actual: null,
      error: 'RESEARCH.md is missing the generated corpus-statistics markers.',
    }
  }

  const actual = normalizeSummary(researchText.slice(block.contentStart, block.contentEnd))
  const ok = actual === normalizeSummary(expected)
  return {
    ok,
    stats,
    expected,
    actual,
    error: ok ? null : 'RESEARCH.md corpus statistics do not match the canonical dataset.',
  }
}

export function synchronizeResearchCorpusStats(researchText, dataset) {
  const stats = deriveResearchCorpusStats(dataset)
  const block = locateStatsBlock(researchText)
  if (!block) {
    throw new Error('RESEARCH.md is missing the generated corpus-statistics markers.')
  }
  const newline = researchText.includes('\r\n') ? '\r\n' : '\n'
  const summary = renderResearchCorpusSummary(stats).replace(
    ' natural boards and ',
    ` natural${newline}boards and `,
  )
  const replacement = [RESEARCH_STATS_START, '', summary, RESEARCH_STATS_END].join(newline)
  return researchText.slice(0, block.start) + replacement + researchText.slice(block.end)
}

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const datasetPath = argument('--dataset', DEFAULT_DATASET_PATH)
  const researchPath = argument('--research', DEFAULT_RESEARCH_PATH)
  const [datasetText, researchText] = await Promise.all([
    readFile(datasetPath, 'utf8'),
    readFile(researchPath, 'utf8'),
  ])
  const dataset = JSON.parse(datasetText)

  if (process.argv.includes('--write')) {
    const synchronized = synchronizeResearchCorpusStats(researchText, dataset)
    if (synchronized !== researchText) await writeFile(researchPath, synchronized)
    console.log(
      synchronized === researchText
        ? 'RESEARCH.md corpus statistics are already synchronized.'
        : 'Synchronized RESEARCH.md corpus statistics from the canonical dataset.',
    )
  } else {
    const result = verifyResearchCorpusStats(researchText, dataset)
    if (!result.ok) {
      console.error(result.error)
      console.error(`Expected: ${result.expected}`)
      if (result.actual !== null) console.error(`Actual: ${result.actual}`)
      process.exitCode = 1
    } else {
      console.log('RESEARCH.md corpus statistics match the canonical dataset.')
    }
  }
}
