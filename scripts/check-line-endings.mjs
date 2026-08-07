import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const write = process.argv.includes('--write')

const result = spawnSync('git', ['ls-files', '--eol', '-z'], {
  encoding: 'utf8',
  windowsHide: true,
})

if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? result.stderr.trim() ?? 'git ls-files --eol failed')
  process.exit(1)
}

const invalid = []
let checked = 0
for (const record of result.stdout.split('\0')) {
  if (!record) continue
  const separator = record.indexOf('\t')
  if (separator < 0) continue
  const attributes = record.slice(0, separator).trim().split(/\s+/)
  const path = record.slice(separator + 1)
  const indexEol = attributes.find((value) => value.startsWith('i/'))?.slice(2)
  const worktreeEol = attributes.find((value) => value.startsWith('w/'))?.slice(2)
  if (indexEol === '-text' || worktreeEol === '-text') continue
  if (indexEol === 'none' && worktreeEol === 'none') continue
  checked += 1
  if (indexEol !== 'lf' || worktreeEol !== 'lf') {
    if (write && worktreeEol !== 'lf') {
      const contents = readFileSync(path, 'utf8')
      writeFileSync(path, contents.replace(/\r\n?/g, '\n'))
    }
    invalid.push(`${path} (index: ${indexEol ?? 'unknown'}, worktree: ${worktreeEol ?? 'unknown'})`)
  }
}

if (invalid.length > 0) {
  if (write) {
    console.log(`Normalized ${invalid.length} tracked text files to LF.`)
    process.exit(0)
  }
  console.error('Tracked text files must use LF line endings:')
  for (const entry of invalid) console.error(`- ${entry}`)
  process.exit(1)
}

console.log(`Line endings are LF for ${checked} tracked text files.`)
