import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const tool = process.argv[2]
const toolArguments = process.argv.slice(3)
const packageBins = {
  eslint: ['eslint/package.json', 'bin/eslint.js'],
  prettier: ['prettier/package.json', 'bin/prettier.cjs'],
}
if (!packageBins[tool]) {
  console.error('Usage: run-on-tracked-files <eslint|prettier> [arguments...]')
  process.exit(1)
}

const tracked = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  windowsHide: true,
})
if (tracked.error || tracked.status !== 0) {
  console.error(tracked.error?.message ?? tracked.stderr.trim() ?? 'git ls-files failed')
  process.exit(1)
}

const allFiles = tracked.stdout.split('\0').filter(Boolean)
const files =
  tool === 'eslint' ? allFiles.filter((file) => /\.(?:[cm]?js|tsx?)$/.test(file)) : allFiles
if (files.length === 0) {
  console.error(`No tracked files were selected for ${tool}.`)
  process.exit(1)
}

const require = createRequire(import.meta.url)
const [packageName, binPath] = packageBins[tool]
const executable = resolve(dirname(require.resolve(packageName)), binPath)
const result = spawnSync(process.execPath, [executable, ...toolArguments, ...files], {
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
