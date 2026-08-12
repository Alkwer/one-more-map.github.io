import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const MARKER = '<!-- border-roll-validation -->'
const DIGEST = /Canonical SHA-256:\s*`([a-f0-9]{64})`/i

export function validationDigestFromComments(comments) {
  for (const comment of [...comments].reverse()) {
    if (typeof comment?.body !== 'string' || !comment.body.includes(MARKER)) continue
    return comment.body.match(DIGEST)?.[1]?.toLowerCase() ?? null
  }
  return null
}

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = argument('--repo')
  const outputPath = argument('--output')
  if (!repository || !outputPath) {
    throw new Error('Usage: fetch-accepted-border-roll-issues --repo OWNER/REPO --output FILE')
  }
  const execFileAsync = promisify(execFile)
  const api = async (args) => {
    const { stdout } = await execFileAsync('gh', ['api', ...args], { maxBuffer: 32 * 1024 * 1024 })
    return JSON.parse(stdout)
  }
  const pages = await api([
    '--method',
    'GET',
    '--paginate',
    '--slurp',
    '-f',
    'state=all',
    '-f',
    'per_page=100',
    '-f',
    'labels=border-roll:accepted',
    `repos/${repository}/issues`,
  ])
  const issues = pages.flat().filter((issue) => !issue.pull_request)
  const accepted = []
  for (const issue of issues) {
    const commentPages = await api([
      '--paginate',
      '--slurp',
      `repos/${repository}/issues/${issue.number}/comments?per_page=100`,
    ])
    accepted.push({
      number: issue.number,
      body: issue.body,
      labels: issue.labels,
      acceptedHash: validationDigestFromComments(commentPages.flat()),
    })
  }
  accepted.sort((left, right) => left.number - right.number)
  await writeFile(outputPath, `${JSON.stringify(accepted, null, 2)}\n`)
}
