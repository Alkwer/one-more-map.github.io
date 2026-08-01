import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { buildCanonicalDataset, loadKnownBorderIds } from './border-roll-data.mjs'

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const inputPath = argument('--input')
const outputPath = argument('--output')
if (!inputPath || !outputPath) {
  throw new Error('Usage: build-border-roll-dataset --input FILE --output FILE')
}

const acceptedIssues = JSON.parse(await readFile(inputPath, 'utf8'))
const knownBorderIds = await loadKnownBorderIds()
const dataset = buildCanonicalDataset(acceptedIssues, knownBorderIds)
if (!dataset) {
  console.log('No accepted complete Voyage sequences were found; dataset was not changed.')
  process.exit(0)
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`)
console.log(`Wrote ${dataset.sampleCount} canonical samples to ${outputPath}.`)
