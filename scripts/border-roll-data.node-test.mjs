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
import { reconcileBorderRollDatasetPullRequest } from './reconcile-border-roll-dataset-pr.mjs'

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
      return { stdout: 'data/border-rolls-v2.json\n', stderr: '', exitCode: 0 }
    }
    if (command === 'git' && args[0] === 'status') {
      return { stdout: ' M data/border-rolls-v2.json\n', stderr: '', exitCode: 0 }
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
    readFile: async () => '{"sampleCount":2}\n',
    writeFile: async (_path, contents) => {
      writtenDataset = contents
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
      return { stdout: 'data/border-rolls-v2.json\nREADME.md\n', stderr: '', exitCode: 0 }
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
