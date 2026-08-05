import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import {
  buildCanonicalDataset,
  DATASET_SCHEMA,
  findDuplicateSampleIds,
  loadKnownBorderIds,
  SAMPLE_SCHEMA,
  validateBorderRollIssueBody,
  validateBorderRollPayload,
} from './border-roll-data.mjs'
import {
  BORDER_ROLL_COMMENT_MARKER,
  upsertBorderRollComment,
} from './upsert-border-roll-comment.mjs'

const knownIds = await loadKnownBorderIds()
const borderModIds = [...knownIds].slice(0, 12)
const execFileAsync = promisify(execFile)

const sample = (rerollIndex = 0, overrides = {}) => ({
  schema: SAMPLE_SCHEMA,
  sampleId: `roll-test-${rerollIndex}`,
  sequenceId: 'voyage-test-sequence',
  capturedAt: `2026-08-01T12:0${rerollIndex}:00.000Z`,
  gamePatch: '3.29',
  vesperUpgradeCount: 3,
  generation: rerollIndex === 0 ? 'natural' : 'paid-reroll',
  rerollIndex,
  displayedNextRerollCost: [3_000, 6_000, 12_000][rerollIndex] ?? null,
  borderModIds,
  ...overrides,
})

const dataset = (samples) => ({
  schema: DATASET_SCHEMA,
  exportedAt: '2026-08-01T13:00:00.000Z',
  sampleCount: samples.length,
  samples,
})

const issueBody = (payload) =>
  `Protocol confirmation.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``

test('loads the canonical border modifier IDs from the application source', () => {
  assert.equal(knownIds.size, 64)
  assert.ok(knownIds.has('b-pack-1'))
})

test('accepts one complete sequence and normalizes roll order', () => {
  const result = validateBorderRollPayload(dataset([sample(1), sample(0)]), knownIds)

  assert.equal(result.status, 'accepted')
  assert.deepEqual(
    result.dataset.samples.map(({ rerollIndex }) => rerollIndex),
    [0, 1],
  )
  assert.match(result.hash, /^[a-f0-9]{64}$/)
})

test('quarantines a structurally valid sequence that starts after the natural board', () => {
  const result = validateBorderRollPayload(sample(3), knownIds)

  assert.equal(result.status, 'partial')
  assert.equal(result.dataset.sampleCount, 1)
})

test('rejects unknown modifiers and malformed issue bodies', () => {
  const unknown = sample(0, { borderModIds: [...borderModIds.slice(0, 11), 'b-not-real'] })
  assert.equal(validateBorderRollPayload(unknown, knownIds).status, 'invalid')
  assert.equal(validateBorderRollIssueBody('no JSON here', knownIds).status, 'invalid')
})

test('tracks one valid Vesper upgrade count per sequence', () => {
  assert.equal(
    validateBorderRollPayload(sample(0, { vesperUpgradeCount: 6 }), knownIds).status,
    'invalid',
  )
  assert.equal(
    validateBorderRollPayload(dataset([sample(0), sample(1, { vesperUpgradeCount: 4 })]), knownIds)
      .status,
    'invalid',
  )
})

test('normalizes legacy samples without Vesper progress to unknown', () => {
  const legacy = sample(0)
  delete legacy.vesperUpgradeCount
  const result = validateBorderRollPayload(legacy, knownIds)

  assert.equal(result.status, 'accepted')
  assert.equal(result.dataset.samples[0].vesperUpgradeCount, null)
  assert.match(result.warnings[0], /legacy\/unknown/)
})

test('finds duplicate sample IDs in previously accepted issues', () => {
  const current = validateBorderRollPayload(dataset([sample(0)]), knownIds)
  const duplicates = findDuplicateSampleIds(
    current,
    [{ number: 41, body: issueBody(dataset([sample(0)])) }],
    knownIds,
    56,
  )

  assert.deepEqual(duplicates, [{ sampleId: 'roll-test-0', issueNumber: 41 }])
})

test('builds a stable deduplicated dataset from accepted issues', () => {
  const built = buildCanonicalDataset(
    [
      { number: 1, body: issueBody(dataset([sample(0), sample(1)])) },
      { number: 2, body: issueBody(dataset([sample(0), sample(1)])) },
    ],
    knownIds,
  )

  assert.equal(built.sampleCount, 2)
  assert.deepEqual(
    built.samples.map(({ sampleId }) => sampleId),
    ['roll-test-0', 'roll-test-1'],
  )
})

test('keeps every sample when the accepted corpus exceeds 1,000 issues', () => {
  const acceptedIssues = Array.from({ length: 1001 }, (_, index) => ({
    number: 1001 - index,
    body: issueBody(
      dataset([
        sample(0, {
          sampleId: `roll-bulk-${index}`,
          sequenceId: `voyage-bulk-${index}`,
          capturedAt: new Date(Date.UTC(2026, 7, 1, 0, 0, 0, index)).toISOString(),
        }),
      ]),
    ),
  }))

  const built = buildCanonicalDataset(acceptedIssues, knownIds)

  assert.equal(built.sampleCount, 1001)
  assert.equal(new Set(built.samples.map(({ sampleId }) => sampleId)).size, 1001)
  assert.equal(built.samples[0].sampleId, 'roll-bulk-0')
  assert.equal(built.samples.at(-1).sampleId, 'roll-bulk-1000')
})

test('excludes issues manually labelled as test data', () => {
  const built = buildCanonicalDataset(
    [
      {
        number: 56,
        body: issueBody(dataset([sample(0)])),
        labels: [{ name: 'border-roll:test' }],
      },
    ],
    knownIds,
  )

  assert.equal(built, null)
})

test('issue processor emits an accepted label, close decision, and audit comment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'border-roll-test-'))
  const eventPath = join(directory, 'event.json')
  const acceptedPath = join(directory, 'accepted.json')
  const resultPath = join(directory, 'result.json')
  const commentPath = join(directory, 'comment.md')
  try {
    await writeFile(
      eventPath,
      JSON.stringify({ issue: { number: 56, body: issueBody(dataset([sample(0)])) } }),
    )
    await writeFile(acceptedPath, '[]')
    await execFileAsync(
      process.execPath,
      [
        'scripts/process-border-roll-issue.mjs',
        '--event',
        eventPath,
        '--accepted',
        acceptedPath,
        '--result',
        resultPath,
        '--comment',
        commentPath,
      ],
      { cwd: process.cwd() },
    )

    const result = JSON.parse(await readFile(resultPath, 'utf8'))
    const comment = await readFile(commentPath, 'utf8')
    assert.equal(result.status, 'accepted')
    assert.equal(result.label, 'border-roll:accepted')
    assert.equal(result.close, true)
    assert.match(comment, /Canonical SHA-256/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('creates the validation comment when the issue has no bot marker comment', async () => {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options })
    if (!options.method) return Response.json([])
    return Response.json({ id: 101 }, { status: 201 })
  }

  const result = await upsertBorderRollComment({
    repository: 'example/voyage-solver',
    issueNumber: 56,
    token: 'test-token',
    body: `${BORDER_ROLL_COMMENT_MARKER}\nCurrent result`,
    fetchImpl,
  })

  assert.deepEqual(result, { action: 'created', commentId: 101 })
  assert.equal(requests.length, 2)
  assert.match(requests[0].url, /issues\/56\/comments\?per_page=100&page=1$/)
  assert.equal(requests[1].options.method, 'POST')
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    body: `${BORDER_ROLL_COMMENT_MARKER}\nCurrent result`,
  })
})

test('updates the bot validation comment while leaving user marker comments alone', async () => {
  const requests = []
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options })
    if (!options.method) {
      return Response.json([
        {
          id: 70,
          body: `${BORDER_ROLL_COMMENT_MARKER}\nUser-authored text`,
          user: { type: 'User' },
        },
        {
          id: 77,
          body: `${BORDER_ROLL_COMMENT_MARKER}\nPrevious result`,
          user: { type: 'Bot' },
        },
      ])
    }
    return Response.json({ id: 77 })
  }

  const result = await upsertBorderRollComment({
    repository: 'example/voyage-solver',
    issueNumber: 56,
    token: 'test-token',
    body: `${BORDER_ROLL_COMMENT_MARKER}\nUpdated result`,
    fetchImpl,
  })

  assert.deepEqual(result, { action: 'updated', commentId: 77 })
  assert.equal(requests.length, 2)
  assert.match(requests[1].url, /issues\/comments\/77$/)
  assert.equal(requests[1].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    body: `${BORDER_ROLL_COMMENT_MARKER}\nUpdated result`,
  })
})
