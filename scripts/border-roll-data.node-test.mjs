import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  validateCanonicalDataset,
} from './border-roll-data.mjs'
import {
  BORDER_ROLL_COMMENT_MARKER,
  upsertBorderRollComment,
} from './upsert-border-roll-comment.mjs'
import {
  DATASET_PATH,
  RESEARCH_PATH,
  reconcileBorderRollDatasetPullRequest,
} from './reconcile-border-roll-dataset-pr.mjs'
import { replaceBorderRollLabels } from './replace-border-roll-labels.mjs'
import { validationDigestFromComments } from './fetch-accepted-border-roll-issues.mjs'
import { verifyCanonicalDataset } from './validate-canonical-border-roll-dataset.mjs'
import { coalesceQueuedIssues, remainingQueuedIssues } from './reconcile-border-roll-queue.mjs'

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
  samplingReason: 'gameplay',
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
const hashDataset = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex')
const withoutSampleFields = (payload, fields) => ({
  ...payload,
  samples: payload.samples.map((entry) =>
    Object.fromEntries(Object.entries(entry).filter(([field]) => !fields.has(field))),
  ),
})

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

test('accepts historical digests only while legacy fields remain absent', () => {
  const beforeVesper = sample(0)
  delete beforeVesper.vesperUpgradeCount
  delete beforeVesper.samplingReason
  const beforeVesperPayload = dataset([beforeVesper])
  const beforeVesperResult = validateBorderRollPayload(beforeVesperPayload, knownIds)
  const beforeVesperHash = hashDataset(
    withoutSampleFields(
      beforeVesperResult.dataset,
      new Set(['vesperUpgradeCount', 'samplingReason']),
    ),
  )

  const beforeSampling = sample(0)
  delete beforeSampling.samplingReason
  const beforeSamplingPayload = dataset([beforeSampling])
  const beforeSamplingResult = validateBorderRollPayload(beforeSamplingPayload, knownIds)
  const beforeSamplingHash = hashDataset(
    withoutSampleFields(beforeSamplingResult.dataset, new Set(['samplingReason'])),
  )

  for (const [number, body, acceptedHash] of [
    [60, issueBody(beforeVesperPayload), beforeVesperHash],
    [214, issueBody(beforeSamplingPayload), beforeSamplingHash],
  ]) {
    const built = buildCanonicalDataset([{ number, body, acceptedHash }], knownIds, {
      requireAcceptedDigest: true,
    })
    assert.equal(built.dataset.sampleCount, 1)
    assert.deepEqual(built.digestMismatches, [])
  }

  const editedBody = issueBody(
    dataset([sample(0, { vesperUpgradeCount: null, samplingReason: 'unknown' })]),
  )
  const edited = buildCanonicalDataset(
    [{ number: 60, body: editedBody, acceptedHash: beforeVesperHash }],
    knownIds,
    { requireAcceptedDigest: true },
  )
  assert.equal(edited.dataset, null)
  assert.equal(edited.digestMismatches[0].issueNumber, 60)
})

test('preserves randomized sampling labels and requires one label per Voyage', () => {
  const randomized = validateBorderRollPayload(
    dataset([
      sample(0, { samplingReason: 'randomized-research' }),
      sample(1, { samplingReason: 'randomized-research' }),
    ]),
    knownIds,
  )
  assert.equal(randomized.status, 'accepted')
  assert.equal(randomized.dataset.samples[0].samplingReason, 'randomized-research')
  assert.equal(
    validateBorderRollPayload(
      dataset([sample(0), sample(1, { samplingReason: 'randomized-research' })]),
      knownIds,
    ).status,
    'invalid',
  )
})

test('finds duplicate sample IDs in previously accepted issues', () => {
  const current = validateBorderRollPayload(dataset([sample(0)]), knownIds)
  const duplicates = findDuplicateSampleIds(
    current,
    [{ number: 41, body: issueBody(dataset([sample(0)])) }],
    knownIds,
    56,
  )

  assert.deepEqual(duplicates, [{ sampleId: 'roll-test-0', issueNumbers: [41], kind: 'identical' }])
})

test('classifies conflicting IDs after a serialized first acceptance', () => {
  const acceptedIssues = [{ number: 41, body: issueBody(dataset([sample(0)])) }]
  const conflicting = validateBorderRollPayload(
    dataset([sample(0, { borderModIds: [...borderModIds].reverse() })]),
    knownIds,
  )

  assert.deepEqual(findDuplicateSampleIds(conflicting, acceptedIssues, knownIds, 57), [
    { sampleId: 'roll-test-0', issueNumbers: [41], kind: 'conflict' },
  ])
})

test('builds a stable deduplicated dataset from accepted issues', () => {
  const built = buildCanonicalDataset(
    [
      { number: 1, body: issueBody(dataset([sample(0), sample(1)])) },
      { number: 2, body: issueBody(dataset([sample(0), sample(1)])) },
    ],
    knownIds,
  )

  assert.equal(built.dataset.sampleCount, 2)
  assert.deepEqual(built.conflicts, [])
  assert.deepEqual(
    built.dataset.samples.map(({ sampleId }) => sampleId),
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

  assert.equal(built.dataset.sampleCount, 1001)
  assert.equal(new Set(built.dataset.samples.map(({ sampleId }) => sampleId)).size, 1001)
  assert.equal(built.dataset.samples[0].sampleId, 'roll-bulk-0')
  assert.equal(built.dataset.samples.at(-1).sampleId, 'roll-bulk-1000')
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

  assert.deepEqual(built, { dataset: null, conflicts: [] })
})

test('dataset CLI fails visibly instead of retaining a non-empty artifact for an empty corpus', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'border-roll-empty-'))
  const inputPath = join(directory, 'accepted.json')
  const outputPath = join(directory, 'dataset.json')
  const existing = JSON.stringify({ schema: DATASET_SCHEMA, sampleCount: 1 })
  await writeFile(inputPath, '[]')
  await writeFile(outputPath, existing)

  try {
    await assert.rejects(
      execFileAsync(
        process.execPath,
        ['scripts/build-border-roll-dataset.mjs', '--input', inputPath, '--output', outputPath],
        { cwd: process.cwd() },
      ),
      /Canonical border-roll source corpus is empty/,
    )
    assert.equal(await readFile(outputPath, 'utf8'), existing)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('keeps the earliest accepted sample when historical IDs conflict', () => {
  const first = sample(0)
  const conflicting = sample(0, { borderModIds: [...borderModIds].reverse() })
  const built = buildCanonicalDataset(
    [
      { number: 42, body: issueBody(dataset([conflicting])) },
      { number: 41, body: issueBody(dataset([first])) },
    ],
    knownIds,
  )

  assert.deepEqual(built.dataset.samples, [first])
  assert.deepEqual(built.conflicts, [
    { sampleId: 'roll-test-0', keptIssueNumber: 41, conflictingIssueNumber: 42 },
  ])
})

test('quarantines renamed accepted issues after their normalized body changes', () => {
  const originalBody = issueBody(dataset([sample(0)]))
  const accepted = validateBorderRollIssueBody(originalBody, knownIds)
  assert.equal(accepted.status, 'accepted')
  const changedBody = issueBody(dataset([sample(0, { borderModIds: [...borderModIds].reverse() })]))

  const built = buildCanonicalDataset(
    [
      {
        number: 242,
        title: 'renamed after acceptance',
        body: changedBody,
        acceptedHash: accepted.hash,
        labels: [{ name: 'bug' }, { name: 'border-roll:accepted' }],
      },
    ],
    knownIds,
    { requireAcceptedDigest: true },
  )

  assert.equal(built.dataset, null)
  assert.deepEqual(built.digestMismatches, [
    {
      issueNumber: 242,
      recordedHash: accepted.hash,
      currentHash: validateBorderRollIssueBody(changedBody, knownIds).hash,
    },
  ])
})

test('reads the latest canonical digest only from managed validation comments', () => {
  assert.equal(
    validationDigestFromComments([
      { body: 'Canonical SHA-256: `' + 'a'.repeat(64) + '`' },
      {
        body:
          '<!-- border-roll-validation -->\n✅ Accepted\nCanonical SHA-256: `' +
          'b'.repeat(64) +
          '`',
      },
    ]),
    'b'.repeat(64),
  )
})

test('dataset-only verification rejects malformed and non-canonical proposed data', () => {
  const body = issueBody(dataset([sample(0)]))
  const accepted = validateBorderRollIssueBody(body, knownIds)
  const acceptedIssues = [{ number: 1, body, acceptedHash: accepted.hash }]
  const canonical = buildCanonicalDataset(acceptedIssues, knownIds, {
    requireAcceptedDigest: true,
  }).dataset
  const verify = (value) =>
    verifyCanonicalDataset(`${JSON.stringify(value, null, 2)}\n`, acceptedIssues, knownIds)

  assert.equal(verify(canonical).ok, true)
  assert.equal(verify({ ...canonical, schema: undefined }).ok, false)
  assert.equal(verify({ ...canonical, sampleCount: 2 }).ok, false)
  assert.equal(
    verify({ ...canonical, samples: [...canonical.samples, canonical.samples[0]] }).ok,
    false,
  )
  assert.equal(
    verify({
      ...canonical,
      samples: [{ ...canonical.samples[0], sampleId: 'roll-unaccepted' }],
    }).ok,
    false,
  )
  assert.equal(
    verify({
      ...canonical,
      samples: [
        {
          ...canonical.samples[0],
          borderModIds: [...canonical.samples[0].borderModIds].reverse(),
        },
      ],
    }).ok,
    false,
  )
})

test('validates the actual canonical JSON independently', () => {
  const candidate = {
    schema: DATASET_SCHEMA,
    exportedAt: sample(0).capturedAt,
    sampleCount: 2,
    samples: [sample(0), sample(0)],
  }
  const result = validateCanonicalDataset(candidate, knownIds)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('sampleId values must be unique.'))
  assert.ok(result.errors.includes('sampleCount must equal samples.length.') === false)
})

test('managed edited and reopened issues revalidate after a title change', async () => {
  const workflow = await readFile('.github/workflows/process-border-roll-data.yml', 'utf8')
  assert.match(workflow, /types: \[opened, edited, reopened\]/)
  for (const label of ['accepted', 'partial', 'duplicate', 'invalid']) {
    assert.match(
      workflow,
      new RegExp(`contains\\(github\\.event\\.issue\\.labels.*border-roll:${label}`),
    )
  }
})

test('durable queue recovers B after A running, B pending, and C replaces the pending run', () => {
  const burst = [
    { number: 101, updated_at: '2026-08-12T10:00:00Z' },
    { number: 102, updated_at: '2026-08-12T10:00:01Z' },
    { number: 103, updated_at: '2026-08-12T10:00:02Z' },
    { number: 102, updated_at: '2026-08-12T10:00:03Z' },
  ]

  assert.deepEqual(
    coalesceQueuedIssues(burst).map(({ number }) => number),
    [101, 102, 103],
  )
  assert.deepEqual(
    remainingQueuedIssues(burst, [101, 103]).map(({ number }) => number),
    [102],
  )
})

test('queue workflows preserve global commit serialization and scheduled recovery', async () => {
  const [processor, queue, reconciler] = await Promise.all([
    readFile('.github/workflows/process-border-roll-data.yml', 'utf8'),
    readFile('.github/workflows/queue-border-roll-data.yml', 'utf8'),
    readFile('.github/workflows/reconcile-border-roll-queue.yml', 'utf8'),
  ])
  assert.match(processor, /group: border-roll-submission-validation/)
  assert.match(processor, /workflow_dispatch:/)
  assert.match(processor, /--remove-label "border-roll:queued"/)
  assert.match(queue, /--add-label "border-roll:queued"/)
  assert.doesNotMatch(queue, /concurrency:/)
  assert.match(reconciler, /cron: '\*\/5 \* \* \* \*'/)
  assert.match(reconciler, /reconcile-border-roll-queue\.mjs/)
})

test('workflow serializes submissions and rechecks duplicates at the commit point', async () => {
  const workflow = await readFile('.github/workflows/process-border-roll-data.yml', 'utf8')

  assert.match(workflow, /group: border-roll-submission-validation/)
  assert.match(workflow, /cancel-in-progress: false/)
  assert.match(workflow, /Re-fetch accepted submissions at commit point/)
  assert.ok(
    workflow.indexOf('Re-fetch accepted submissions at commit point') <
      workflow.indexOf('Apply result to issue'),
  )
})

test('dataset workflow finds and updates a managed PR after more than 100 external lookalikes', async () => {
  const calls = []
  let writtenDataset = null
  let summary = ''
  const pull = {
    number: 88,
    url: 'https://github.com/example/voyage-solver/pull/88',
    headRefName: 'automation/border-roll-dataset-100',
    headRepositoryOwner: { login: 'example' },
    isCrossRepository: false,
    author: { login: 'app/github-actions', is_bot: true },
  }
  const lookalikes = Array.from({ length: 101 }, (_, index) => ({
    number: 1_000 + index,
    url: `https://github.com/example/voyage-solver/pull/${1_000 + index}`,
    headRefName: `automation/border-roll-dataset-fork-${index}`,
    headRepositoryOwner: { login: `attacker-${index}` },
    isCrossRepository: true,
    author: { login: `attacker-${index}`, is_bot: false },
  }))
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options })
    if (command === 'gh' && args[0] === 'api' && args.includes('--slurp')) {
      return {
        stdout: JSON.stringify([lookalikes.slice(0, 100), [lookalikes[100], pull]]),
        stderr: '',
        exitCode: 0,
      }
    }
    if (command === 'gh' && args[0] === 'api') {
      return { stdout: 'data/border-rolls-v2.json\nRESEARCH.md\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'status') {
      return {
        stdout: ' M data/border-rolls-v2.json\n M RESEARCH.md\n',
        stderr: '',
        exitCode: 0,
      }
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1].endsWith('^{tree}')) {
      return { stdout: 'old-tree\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'rev-parse') {
      return { stdout: 'remote-commit\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'write-tree') {
      return { stdout: 'new-tree\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'diff') {
      return { stdout: '', stderr: '', exitCode: 1 }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }
  const io = {
    readFile: async (path) => (path === DATASET_PATH ? '{"sampleCount":2}\n' : 'research\n'),
    writeFile: async (path, contents) => {
      if (path === DATASET_PATH) writtenDataset = contents
    },
    appendFile: async (_path, contents) => {
      summary += contents
    },
  }

  const result = await reconcileBorderRollDatasetPullRequest({
    run,
    io,
    env: {
      GITHUB_REPOSITORY: 'example/voyage-solver',
      GITHUB_RUN_ID: '200',
      GITHUB_STEP_SUMMARY: 'summary.md',
    },
  })

  assert.equal(result.status, 'updated')
  assert.equal(writtenDataset, '{"sampleCount":2}\n')
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'git' &&
        args[0] === 'add' &&
        args.includes(DATASET_PATH) &&
        args.includes(RESEARCH_PATH),
    ),
  )
  assert.match(summary, /Status: \*\*updated\*\*/)
  assert.match(summary, /Ignored 101 external or unmanaged lookalike PR/)
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'gh' &&
        args[0] === 'api' &&
        args.includes('--paginate') &&
        args.includes('--slurp'),
    ),
  )
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'git' &&
        args[0] === 'switch' &&
        args.includes('origin/main') &&
        args.includes('automation/border-roll-dataset-100'),
    ),
  )
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'git' &&
        args[0] === 'push' &&
        args.includes(
          '--force-with-lease=refs/heads/automation/border-roll-dataset-100:remote-commit',
        ),
    ),
  )
  assert.equal(
    calls.some(({ command, args }) => command === 'gh' && args[0] === 'pr' && args[1] === 'create'),
    false,
  )
})

test('dataset workflow ignores fork and manual lookalikes while creating a managed PR', async () => {
  const calls = []
  let summary = ''
  const run = async (command, args) => {
    calls.push({ command, args })
    if (command === 'git' && args[0] === 'status') {
      return { stdout: ' M data/border-rolls-v2.json\n', stderr: '', exitCode: 0 }
    }
    if (command === 'gh' && args[0] === 'api' && args.includes('--slurp')) {
      return {
        stdout: JSON.stringify([
          [
            {
              number: 89,
              url: 'https://github.com/example/voyage-solver/pull/89',
              headRefName: 'automation/border-roll-dataset-manual',
              headRepositoryOwner: { login: 'example' },
              isCrossRepository: false,
              author: { login: 'maintainer', is_bot: false },
            },
            {
              number: 90,
              url: 'https://github.com/example/voyage-solver/pull/90',
              headRefName: 'automation/border-roll-dataset-fork',
              headRepositoryOwner: { login: 'external' },
              isCrossRepository: true,
              author: { login: 'external', is_bot: false },
            },
          ],
        ]),
        stderr: '',
        exitCode: 0,
      }
    }
    if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
      return {
        stdout: 'https://github.com/example/voyage-solver/pull/91\n',
        stderr: '',
        exitCode: 0,
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  const result = await reconcileBorderRollDatasetPullRequest({
    run,
    io: {
      readFile: async () => '{"sampleCount":2}\n',
      writeFile: async () => {},
      appendFile: async (_path, contents) => {
        summary += contents
      },
    },
    env: {
      GITHUB_REPOSITORY: 'example/voyage-solver',
      GITHUB_RUN_ID: '201',
      GITHUB_STEP_SUMMARY: 'summary.md',
    },
  })

  assert.equal(result.status, 'created')
  assert.equal(result.exitCode, 0)
  assert.match(summary, /Ignored 2 external or unmanaged lookalike PR/)
  assert.match(summary, /Status: \*\*created\*\*/)
  assert.ok(
    calls.some(({ command, args }) => command === 'gh' && args[0] === 'pr' && args[1] === 'create'),
  )
  assert.equal(
    calls.some(
      ({ command, args }) =>
        command === 'git' &&
        args[0] === 'push' &&
        args.some((argument) => argument.startsWith('--force-with-lease')),
    ),
    false,
  )
})

test('dataset workflow still blocks a managed bot PR that changes unexpected files', async () => {
  const calls = []
  let summary = ''
  const managed = {
    number: 92,
    url: 'https://github.com/example/voyage-solver/pull/92',
    headRefName: 'automation/border-roll-dataset-unsafe',
    headRepositoryOwner: { login: 'example' },
    isCrossRepository: false,
    author: { login: 'github-actions[bot]', is_bot: true },
  }
  const run = async (command, args) => {
    calls.push({ command, args })
    if (command === 'git' && args[0] === 'status') {
      return { stdout: ' M data/border-rolls-v2.json\n', stderr: '', exitCode: 0 }
    }
    if (command === 'gh' && args[0] === 'api' && args.includes('--slurp')) {
      return { stdout: JSON.stringify([[managed]]), stderr: '', exitCode: 0 }
    }
    if (command === 'gh' && args[0] === 'api') {
      return {
        stdout: 'data/border-rolls-v2.json\nRESEARCH.md\nREADME.md\n',
        stderr: '',
        exitCode: 0,
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  const result = await reconcileBorderRollDatasetPullRequest({
    run,
    io: {
      readFile: async () => '{"sampleCount":2}\n',
      writeFile: async () => {},
      appendFile: async (_path, contents) => {
        summary += contents
      },
    },
    env: {
      GITHUB_REPOSITORY: 'example/voyage-solver',
      GITHUB_RUN_ID: '202',
      GITHUB_STEP_SUMMARY: 'summary.md',
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.exitCode, 1)
  assert.match(summary, /also changes: README\.md/)
  assert.equal(
    calls.some(({ command, args }) => command === 'git' && args[0] === 'push'),
    false,
  )
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

test('issue processor rejects a conflicting accepted ID with an audit comment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'border-roll-conflict-test-'))
  const eventPath = join(directory, 'event.json')
  const acceptedPath = join(directory, 'accepted.json')
  const resultPath = join(directory, 'result.json')
  const commentPath = join(directory, 'comment.md')
  try {
    const conflict = sample(0, { borderModIds: [...borderModIds].reverse() })
    await writeFile(
      eventPath,
      JSON.stringify({ issue: { number: 57, body: issueBody(dataset([conflict])) } }),
    )
    await writeFile(
      acceptedPath,
      JSON.stringify([{ number: 41, body: issueBody(dataset([sample(0)])) }]),
    )
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
    assert.equal(result.status, 'duplicate')
    assert.equal(result.label, 'border-roll:duplicate')
    assert.equal(result.duplicates[0].kind, 'conflict')
    assert.match(comment, /different normalized content/)
    assert.match(comment, /canonical dataset remains buildable/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('processing-label replacement fails closed when an accepted label cannot be removed', async () => {
  const original = ['bug', 'border-roll:accepted']
  let labels = [...original]
  let commentUpdated = false

  await assert.rejects(
    replaceBorderRollLabels({
      currentLabels: original,
      resultLabel: 'border-roll:invalid',
      applyLabels: async () => {
        // Fault injection: the API claims success but retains accepted while
        // also applying the proposed invalid label.
        labels = [...original, 'border-roll:invalid']
      },
      readLabels: async () => labels,
    }).then(() => {
      commentUpdated = true
    }),
    /label replacement was not confirmed/,
  )

  assert.equal(commentUpdated, false)
  assert.ok(labels.includes('bug'))
  assert.ok(labels.includes('border-roll:accepted'))
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
