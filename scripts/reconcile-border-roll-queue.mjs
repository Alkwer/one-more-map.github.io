import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export function coalesceQueuedIssues(issues) {
  const latest = new Map()
  for (const issue of issues) {
    if (!Number.isInteger(issue?.number) || issue.pull_request) continue
    const previous = latest.get(issue.number)
    if (!previous || String(previous.updated_at ?? '') <= String(issue.updated_at ?? '')) {
      latest.set(issue.number, issue)
    }
  }
  return [...latest.values()].sort((left, right) => left.number - right.number)
}

export function remainingQueuedIssues(queuedIssues, completedIssueNumbers) {
  const completed = new Set(completedIssueNumbers)
  return coalesceQueuedIssues(queuedIssues).filter((issue) => !completed.has(issue.number))
}

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = argument('--repo')
  if (!repository) throw new Error('Usage: reconcile-border-roll-queue --repo OWNER/REPO')
  const execFileAsync = promisify(execFile)
  const { stdout } = await execFileAsync(
    'gh',
    [
      'api',
      '--method',
      'GET',
      '--paginate',
      '--slurp',
      '-f',
      'state=all',
      '-f',
      'per_page=100',
      '-f',
      'labels=border-roll:queued',
      `repos/${repository}/issues`,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  const issues = coalesceQueuedIssues(JSON.parse(stdout).flat())
  for (const issue of issues) {
    await execFileAsync('gh', [
      'workflow',
      'run',
      'process-border-roll-data.yml',
      '--repo',
      repository,
      '-f',
      `issue_number=${issue.number}`,
    ])
  }
  console.log(`Dispatched ${issues.length} queued border-roll issue(s).`)
}
