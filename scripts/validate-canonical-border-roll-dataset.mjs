import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  buildCanonicalDataset,
  loadKnownBorderIds,
  validateCanonicalDataset,
} from './border-roll-data.mjs'

export function verifyCanonicalDataset(proposedText, acceptedIssues, knownBorderIds) {
  let proposed
  try {
    proposed = JSON.parse(proposedText)
  } catch (error) {
    return { ok: false, errors: [`Dataset JSON is invalid: ${error.message}`] }
  }
  const validation = validateCanonicalDataset(proposed, knownBorderIds)
  if (!validation.ok) return validation

  const { dataset, digestMismatches } = buildCanonicalDataset(acceptedIssues, knownBorderIds, {
    requireAcceptedDigest: true,
  })
  if (digestMismatches.length > 0) {
    return {
      ok: false,
      errors: [
        `Accepted source digest mismatch: ${digestMismatches
          .map(({ issueNumber }) => `#${issueNumber}`)
          .join(', ')}`,
      ],
    }
  }
  if (!dataset) return { ok: false, errors: ['Canonical accepted corpus is empty.'] }
  const expectedText = `${JSON.stringify(dataset, null, 2)}\n`
  if (proposedText !== expectedText) {
    return {
      ok: false,
      errors: ['Proposed dataset is not a byte-for-byte canonical rebuild of accepted issues.'],
    }
  }
  return { ok: true, errors: [] }
}

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const acceptedPath = argument('--accepted', process.env.BORDER_ROLL_ACCEPTED_PATH)
  const datasetPath = argument('--dataset', 'data/border-rolls-v2.json')
  if (!acceptedPath) throw new Error('BORDER_ROLL_ACCEPTED_PATH or --accepted is required.')
  const [proposedText, acceptedText, knownBorderIds] = await Promise.all([
    readFile(datasetPath, 'utf8'),
    readFile(acceptedPath, 'utf8'),
    loadKnownBorderIds(),
  ])
  const result = verifyCanonicalDataset(proposedText, JSON.parse(acceptedText), knownBorderIds)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  console.log('Dataset matches the complete accepted corpus byte-for-byte.')
}
