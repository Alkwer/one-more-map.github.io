import { execFile } from 'node:child_process'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export const AUTOMATION_BRANCH_PREFIX = 'automation/border-roll-dataset-'
export const DATASET_PATH = 'data/border-rolls-v2.json'

const execFileAsync = promisify(execFile)

const commandRunner = async (command, args, { allowFailure = false } = {}) => {
  try {
    const { stdout = '', stderr = '' } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    const result = {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
      exitCode: typeof error.code === 'number' ? error.code : 1,
    }
    if (allowFailure) return result
    throw error
  }
}

const botAuthored = (pull) => {
  const login = pull.author?.login?.toLowerCase() ?? ''
  return pull.author?.is_bot === true || login.includes('github-actions') || login.endsWith('[bot]')
}

export const isManagedAutomationPull = (pull, repositoryOwner) =>
  pull.headRefName?.startsWith(AUTOMATION_BRANCH_PREFIX) &&
  pull.isCrossRepository !== true &&
  pull.headRepositoryOwner?.login?.toLowerCase() === repositoryOwner.toLowerCase() &&
  botAuthored(pull)

const normalizeApiPull = (pull, repository) => {
  const headRepository = pull.head?.repo?.full_name ?? null
  return {
    number: pull.number,
    url: pull.html_url ?? pull.url,
    headRefName: pull.head?.ref ?? pull.headRefName,
    headRepositoryOwner: {
      login: pull.head?.repo?.owner?.login ?? pull.headRepositoryOwner?.login ?? '',
    },
    isCrossRepository:
      headRepository === null
        ? (pull.isCrossRepository ?? true)
        : headRepository.toLowerCase() !== repository.toLowerCase(),
    author: {
      login: pull.user?.login ?? pull.author?.login ?? '',
      is_bot: pull.user ? pull.user.type === 'Bot' : pull.author?.is_bot === true,
    },
  }
}

const listOpenPulls = async (run, repository) => {
  const result = await run('gh', [
    'api',
    '--paginate',
    '--slurp',
    `repos/${repository}/pulls?state=open&per_page=100`,
  ])
  const pages = JSON.parse(result.stdout)
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error('GitHub open-pull enumeration did not return paginated arrays')
  }
  return pages.flat().map((pull) => normalizeApiPull(pull, repository))
}

const appendSummary = async (io, summaryPath, status, detail) => {
  const summary = `### Border-roll dataset automation\n\nStatus: **${status}**\n\n${detail}\n`
  if (summaryPath) await io.appendFile(summaryPath, summary)
  return summary
}

const listChangedFiles = async (run, repository, pullNumber) => {
  const result = await run('gh', [
    'api',
    '--paginate',
    `repos/${repository}/pulls/${pullNumber}/files`,
    '--jq',
    '.[].filename',
  ])
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const closePull = async (run, repository, pull, comment, { deleteBranch = true } = {}) => {
  const args = ['pr', 'close', String(pull.number), '--repo', repository, '--comment', comment]
  if (deleteBranch) args.push('--delete-branch')
  await run('gh', args)
}

const configureGitAuthor = async (run) => {
  await run('git', ['config', 'user.name', 'github-actions[bot]'])
  await run('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ])
}

const createPull = async ({ run, io, repository, runId, desiredDataset }) => {
  const branch = `${AUTOMATION_BRANCH_PREFIX}${runId}`
  await run('git', ['switch', '--discard-changes', '-c', branch, 'origin/main'])
  await io.writeFile(DATASET_PATH, desiredDataset)
  await run('git', ['add', DATASET_PATH])
  await configureGitAuthor(run)
  await run('git', ['commit', '-m', 'Update border-roll research dataset'])
  await run('git', ['push', '--set-upstream', 'origin', branch])
  const created = await run('gh', [
    'pr',
    'create',
    '--repo',
    repository,
    '--base',
    'main',
    '--head',
    branch,
    '--title',
    'Update border-roll research dataset',
    '--body',
    '<!-- border-roll-dataset-automation -->\nAutomated, deterministic rebuild from closed issues labelled `border-roll:accepted`. The source samples were schema-validated and deduplicated before this PR was created.',
  ])
  return { branch, url: created.stdout.trim() }
}

export const reconcileBorderRollDatasetPullRequest = async ({
  run = commandRunner,
  io = { appendFile, readFile, writeFile },
  env = process.env,
} = {}) => {
  const repository = env.GITHUB_REPOSITORY
  const runId = env.GITHUB_RUN_ID
  if (!repository || !runId) {
    throw new Error('GITHUB_REPOSITORY and GITHUB_RUN_ID are required')
  }

  const repositoryOwner = repository.split('/')[0]
  const desiredDataset = await io.readFile(DATASET_PATH, 'utf8')
  const status = await run('git', ['status', '--porcelain', '--', DATASET_PATH])
  const datasetChanged = status.stdout.trim().length > 0
  const prefixedPulls = (await listOpenPulls(run, repository)).filter((pull) =>
    pull.headRefName?.startsWith(AUTOMATION_BRANCH_PREFIX),
  )
  const managedPulls = prefixedPulls
    .filter((pull) => isManagedAutomationPull(pull, repositoryOwner))
    .sort((left, right) => left.number - right.number)
  const unmanagedPulls = prefixedPulls.filter(
    (pull) => !isManagedAutomationPull(pull, repositoryOwner),
  )

  if (unmanagedPulls.length > 0 && env.GITHUB_STEP_SUMMARY) {
    await io.appendFile(
      env.GITHUB_STEP_SUMMARY,
      `> Ignored ${unmanagedPulls.length} external or unmanaged lookalike PR(s): ${unmanagedPulls.map(({ url }) => url).join(', ')}.\n\n`,
    )
  }

  for (const pull of managedPulls) {
    const changedFiles = await listChangedFiles(run, repository, pull.number)
    const unexpectedFiles = changedFiles.filter((file) => file !== DATASET_PATH)
    if (unexpectedFiles.length > 0) {
      const detail = `Refused to overwrite ${pull.url}; it also changes: ${unexpectedFiles.join(', ')}.`
      const summary = await appendSummary(io, env.GITHUB_STEP_SUMMARY, 'blocked', detail)
      return { status: 'blocked', summary, exitCode: 1 }
    }
  }

  if (!datasetChanged) {
    for (const pull of managedPulls) {
      await closePull(
        run,
        repository,
        pull,
        'The deterministic rebuild now matches `main`; this automation PR is superseded.',
      )
    }
    const statusName = managedPulls.length > 0 ? 'superseded' : 'unchanged'
    const detail =
      managedPulls.length > 0
        ? `Closed ${managedPulls.length} obsolete automation PR(s); the accepted dataset is already on main.`
        : 'The accepted dataset already matches main; no pull request is needed.'
    const summary = await appendSummary(io, env.GITHUB_STEP_SUMMARY, statusName, detail)
    return { status: statusName, summary, exitCode: 0 }
  }

  await run('git', ['fetch', 'origin', 'main'])
  let primary = managedPulls[0]
  const extras = managedPulls.slice(1)

  if (primary) {
    const branchRef = `refs/heads/${primary.headRefName}`
    const remoteRef = `refs/remotes/origin/${primary.headRefName}`
    const fetched = await run('git', ['fetch', 'origin', `${branchRef}:${remoteRef}`], {
      allowFailure: true,
    })
    if (fetched.exitCode !== 0) {
      await closePull(
        run,
        repository,
        primary,
        'The automation branch is missing or unreadable; a fresh PR will supersede it.',
        { deleteBranch: false },
      )
      primary = null
    }
  }

  if (!primary) {
    const created = await createPull({ run, io, repository, runId, desiredDataset })
    for (const pull of extras) {
      await closePull(run, repository, pull, `Superseded by ${created.url}.`)
    }
    const summary = await appendSummary(
      io,
      env.GITHUB_STEP_SUMMARY,
      'created',
      `Opened ${created.url} from \`${created.branch}\`.`,
    )
    return { status: 'created', summary, exitCode: 0, url: created.url }
  }

  const branch = primary.headRefName
  const remoteRef = `refs/remotes/origin/${branch}`
  const remoteCommit = (await run('git', ['rev-parse', remoteRef])).stdout.trim()
  const remoteTree = (await run('git', ['rev-parse', `${remoteRef}^{tree}`])).stdout.trim()
  await run('git', ['switch', '--discard-changes', '-C', branch, 'origin/main'])
  await io.writeFile(DATASET_PATH, desiredDataset)
  await run('git', ['add', DATASET_PATH])
  const desiredTree = (await run('git', ['write-tree'])).stdout.trim()

  if (desiredTree === remoteTree) {
    for (const pull of extras) {
      await closePull(run, repository, pull, `Superseded by ${primary.url}.`)
    }
    const summary = await appendSummary(
      io,
      env.GITHUB_STEP_SUMMARY,
      'unchanged',
      `${primary.url} already contains the complete accepted dataset on the current main tree.`,
    )
    return { status: 'unchanged', summary, exitCode: 0, url: primary.url }
  }

  const staged = await run('git', ['diff', '--cached', '--quiet'], { allowFailure: true })
  if (staged.exitCode === 0) {
    await closePull(
      run,
      repository,
      primary,
      'The deterministic rebuild now matches `main`; this automation PR is superseded.',
    )
    for (const pull of extras) {
      await closePull(run, repository, pull, 'The accepted dataset is already on `main`.')
    }
    const summary = await appendSummary(
      io,
      env.GITHUB_STEP_SUMMARY,
      'superseded',
      'Closed obsolete automation PRs; the accepted dataset is already on main.',
    )
    return { status: 'superseded', summary, exitCode: 0 }
  }

  await configureGitAuthor(run)
  await run('git', ['commit', '-m', 'Update border-roll research dataset'])
  const pushed = await run(
    'git',
    [
      'push',
      `--force-with-lease=refs/heads/${branch}:${remoteCommit}`,
      'origin',
      `HEAD:refs/heads/${branch}`,
    ],
    { allowFailure: true },
  )
  if (pushed.exitCode !== 0) {
    const detail = `Could not safely update ${primary.url}; its branch changed during this run. A later run will retry.`
    const summary = await appendSummary(io, env.GITHUB_STEP_SUMMARY, 'blocked', detail)
    return { status: 'blocked', summary, exitCode: 1, url: primary.url }
  }

  for (const pull of extras) {
    await closePull(run, repository, pull, `Superseded by ${primary.url}.`)
  }
  const summary = await appendSummary(
    io,
    env.GITHUB_STEP_SUMMARY,
    'updated',
    `Rebuilt ${primary.url} from the current main branch with every accepted sample.`,
  )
  return { status: 'updated', summary, exitCode: 0, url: primary.url }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const result = await reconcileBorderRollDatasetPullRequest()
  process.stdout.write(result.summary)
  process.exitCode = result.exitCode
}
