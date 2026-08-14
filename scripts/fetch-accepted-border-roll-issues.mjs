import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  BORDER_ROLL_COMMENT_MARKER,
  isTrustedBorderRollValidationComment,
} from './border-roll-validation-comment.mjs'

const DIGEST = /Canonical SHA-256:\s*`([a-f0-9]{64})`/i

export function validationRecordFromComments(comments) {
  if (!Array.isArray(comments)) return null

  const trusted = comments.filter(isTrustedBorderRollValidationComment)
  if (trusted.length !== 1) return null

  const comment = trusted[0]
  const markerCount = comment.body.split(BORDER_ROLL_COMMENT_MARKER).length - 1
  const digestMatches = [...comment.body.matchAll(new RegExp(DIGEST.source, 'gi'))]
  if (markerCount !== 1 || digestMatches.length !== 1) return null

  return {
    commentId: comment.id,
    digest: digestMatches[0][1].toLowerCase(),
  }
}

export const validationDigestFromComments = (comments) =>
  validationRecordFromComments(comments)?.digest ?? null

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
    const validationRecord = validationRecordFromComments(commentPages.flat())
    accepted.push({
      number: issue.number,
      body: issue.body,
      labels: issue.labels,
      acceptedHash: validationRecord?.digest ?? null,
      validationCommentId: validationRecord?.commentId ?? null,
    })
  }
  accepted.sort((left, right) => left.number - right.number)
  await writeFile(outputPath, `${JSON.stringify(accepted, null, 2)}\n`)
}
