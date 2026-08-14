import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  deriveResearchCorpusStats,
  synchronizeResearchCorpusStats,
  verifyResearchCorpusStats,
} from './research-corpus-stats.mjs'

const datasetUrl = new URL('../data/border-rolls-v2.json', import.meta.url)
const researchUrl = new URL('../RESEARCH.md', import.meta.url)

const readActualCorpus = async () => {
  const [datasetText, researchText] = await Promise.all([
    readFile(datasetUrl, 'utf8'),
    readFile(researchUrl, 'utf8'),
  ])
  return { dataset: JSON.parse(datasetText), researchText }
}

test('derives every published corpus count from sample records', () => {
  const dataset = {
    exportedAt: '2026-08-14T01:02:03.000Z',
    sampleCount: 4,
    samples: [
      { sequenceId: 'voyage-a', generation: 'natural' },
      { sequenceId: 'voyage-a', generation: 'paid-reroll' },
      { sequenceId: 'voyage-a', generation: 'paid-reroll' },
      { sequenceId: 'voyage-b', generation: 'natural' },
    ],
  }

  assert.deepEqual(deriveResearchCorpusStats(dataset), {
    exportedDate: '2026-08-14',
    boards: 4,
    voyages: 2,
    naturalBoards: 2,
    paidRerolls: 2,
    paidSequences: 1,
  })
})

test('the actual RESEARCH.md summary matches the canonical dataset', async () => {
  const { dataset, researchText } = await readActualCorpus()
  const result = verifyResearchCorpusStats(researchText, dataset)

  assert.equal(result.ok, true, result.error)
  assert.equal(synchronizeResearchCorpusStats(researchText, dataset), researchText)
})

test('detects controlled documentation drift and the generator repairs it', async () => {
  const { dataset, researchText } = await readActualCorpus()
  const stats = deriveResearchCorpusStats(dataset)
  const drifted = researchText.replace(`${stats.boards} boards`, `${stats.boards + 1} boards`)

  const drift = verifyResearchCorpusStats(drifted, dataset)
  assert.equal(drift.ok, false)
  assert.match(drift.error, /do not match/)

  const repaired = synchronizeResearchCorpusStats(drifted, dataset)
  assert.equal(verifyResearchCorpusStats(repaired, dataset).ok, true)
})
