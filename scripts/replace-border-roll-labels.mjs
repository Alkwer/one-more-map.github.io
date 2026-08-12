import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

export const PROCESSING_LABELS = [
  'border-roll:accepted',
  'border-roll:partial',
  'border-roll:duplicate',
  'border-roll:invalid',
]

export async function replaceBorderRollLabels({
  currentLabels,
  resultLabel,
  applyLabels,
  readLabels,
}) {
  if (!PROCESSING_LABELS.includes(resultLabel)) {
    throw new Error(`Unsupported border-roll result label: ${resultLabel}`)
  }
  const unrelated = currentLabels.filter((label) => !PROCESSING_LABELS.includes(label))
  const desired = [...new Set([...unrelated, resultLabel])]
  await applyLabels(desired)

  const verified = await readLabels()
  const processing = verified.filter((label) => PROCESSING_LABELS.includes(label))
  const missingUnrelated = unrelated.filter((label) => !verified.includes(label))
  if (processing.length !== 1 || processing[0] !== resultLabel || missingUnrelated.length > 0) {
    throw new Error(
      `Border-roll label replacement was not confirmed (wanted ${resultLabel}; found ${processing.join(', ') || 'none'}).`,
    )
  }
  return verified
}

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = argument('--repo')
  const issueNumber = argument('--issue')
  const resultLabel = argument('--label')
  if (!repository || !issueNumber || !resultLabel) {
    throw new Error(
      'Usage: replace-border-roll-labels --repo OWNER/REPO --issue NUMBER --label LABEL',
    )
  }

  const execFileAsync = promisify(execFile)
  const endpoint = `repos/${repository}/issues/${issueNumber}`
  const readLabels = async () => {
    const { stdout } = await execFileAsync('gh', ['api', endpoint, '--jq', '.labels[].name'])
    return stdout.split(/\r?\n/).filter(Boolean)
  }
  const currentLabels = await readLabels()
  await replaceBorderRollLabels({
    currentLabels,
    resultLabel,
    readLabels,
    applyLabels: async (labels) => {
      await execFileAsync('gh', [
        'api',
        '--method',
        'PATCH',
        endpoint,
        ...labels.flatMap((label) => ['-f', `labels[]=${label}`]),
      ])
    },
  })
}
