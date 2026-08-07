import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const vitestPackagePath = require.resolve('vitest/package.json')
const vitestPackage = JSON.parse(readFileSync(vitestPackagePath, 'utf8'))
const vitestCli = resolve(dirname(vitestPackagePath), vitestPackage.bin.vitest)

function listedFiles(config) {
  const result = spawnSync(
    process.execPath,
    [vitestCli, 'list', '--filesOnly', '--no-color', '--config', config],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  )
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ?? result.stderr.trim() ?? `Vitest list failed for ${config}`,
    )
  }
  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => relative(root, resolve(root, file)).replaceAll('\\', '/'))
}

const defaultFiles = listedFiles('vitest.config.ts')
assert.ok(defaultFiles.length > 0, 'Default Vitest discovery returned no files')
for (const file of defaultFiles) {
  assert.match(
    file,
    /^(?:src\/.+\.(?:test|spec)\.(?:ts|tsx)|tests\/[^/]+\.(?:test|spec)\.(?:ts|tsx))$/,
    `Default Vitest discovery escaped the supported roots: ${file}`,
  )
}

const performanceFiles = listedFiles('vitest.performance.config.ts')
assert.deepEqual(performanceFiles, ['tests/performance/solver-performance-budget.test.ts'])

console.log(
  `Validation scope is stable: ${defaultFiles.length} default test files and 1 performance file.`,
)
