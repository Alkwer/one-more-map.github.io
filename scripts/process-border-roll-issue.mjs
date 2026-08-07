import { appendFile, readFile, writeFile } from 'node:fs/promises'
import {
  findDuplicateSampleIds,
  loadKnownBorderIds,
  validateBorderRollIssueBody,
} from './border-roll-data.mjs'

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const eventPath = argument('--event', process.env.GITHUB_EVENT_PATH)
const acceptedPath = argument('--accepted')
const resultPath = argument('--result')
const commentPath = argument('--comment')
if (!eventPath || !resultPath || !commentPath) {
  throw new Error('Usage: process-border-roll-issue --event FILE --result FILE --comment FILE')
}

const event = JSON.parse(await readFile(eventPath, 'utf8'))
const issue = event.issue
if (!issue || typeof issue.number !== 'number') throw new Error('Event does not contain an issue.')

const knownBorderIds = await loadKnownBorderIds()
const acceptedIssues = acceptedPath ? JSON.parse(await readFile(acceptedPath, 'utf8')) : []
let result = validateBorderRollIssueBody(issue.body, knownBorderIds)
const duplicates = findDuplicateSampleIds(result, acceptedIssues, knownBorderIds, issue.number)
if (duplicates.length > 0) result = { ...result, status: 'duplicate', duplicates }

const settings = {
  accepted: { label: 'border-roll:accepted', close: true, reason: 'completed' },
  partial: { label: 'border-roll:partial', close: true, reason: 'not planned' },
  duplicate: { label: 'border-roll:duplicate', close: true, reason: 'not planned' },
  invalid: { label: 'border-roll:invalid', close: false, reason: '' },
}[result.status]

const warnings = result.warnings.length
  ? `\n\nWarnings:\n${result.warnings.map((warning) => `- ${warning}`).join('\n')}`
  : ''
let comment
if (result.status === 'accepted') {
  const sequenceId = result.dataset.samples[0].sequenceId
  comment = `✅ Accepted ${result.dataset.sampleCount} roll${result.dataset.sampleCount === 1 ? '' : 's'} from complete Voyage sequence \`${sequenceId}\`.\n\nCanonical SHA-256: \`${result.hash}\`\n\nThe normalized samples will be included in the next dataset update. This issue is now closed.${warnings}`
} else if (result.status === 'partial') {
  const indexes = result.dataset.samples.map((sample) => sample.rerollIndex).join(', ')
  comment = `⚠️ The JSON is valid, but the submitted rolls (${indexes}) do not form a sequence starting at natural roll 0.\n\nThis observation is retained for reference but excluded from the canonical research dataset. This issue is now closed.${warnings}`
} else if (result.status === 'duplicate') {
  const conflicts = result.duplicates.filter(({ kind }) => kind === 'conflict')
  const references = (duplicates) =>
    duplicates
      .map(
        ({ sampleId, issueNumbers }) =>
          `\`${sampleId}\` (${issueNumbers.map((number) => `#${number}`).join(', ')})`,
      )
      .join('; ')
  comment = conflicts.length
    ? `⛔ This submission reuses accepted sample IDs with different normalized content: ${references(conflicts)}. Conflicting data was not accepted, so the canonical dataset remains buildable and this issue is now closed.`
    : `♻️ This submission repeats sample IDs already accepted in ${references(result.duplicates)}. No data was added, so this issue is now closed.`
} else {
  comment = `❌ This submission could not be accepted:\n\n${result.errors.map((error) => `- ${error}`).join('\n')}\n\nEdit the JSON in the issue body to trigger validation again.${warnings}`
}
comment = `<!-- border-roll-validation -->\n${comment}\n`

const output = { ...result, ...settings, issueNumber: issue.number }
await writeFile(resultPath, `${JSON.stringify(output, null, 2)}\n`)
await writeFile(commentPath, comment)

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `status=${result.status}\nlabel=${settings.label}\nclose=${settings.close}\nreason=${settings.reason}\n`,
  )
}
