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

function trackedTestLikeFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim() ?? 'git ls-files failed')
  }
  return result.stdout
    .split('\0')
    .filter((file) => /\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
    .sort()
}

function isDefaultTest(file) {
  return (
    /^src\/.+\.(?:test|spec)\.(?:ts|tsx)$/.test(file) ||
    (/^tests\/.+\.(?:test|spec)\.(?:ts|tsx)$/.test(file) &&
      !file.startsWith('tests/fixtures/') &&
      !file.startsWith('tests/performance/'))
  )
}

const defaultFiles = listedFiles('vitest.config.ts')
assert.ok(defaultFiles.length > 0, 'Default Vitest discovery returned no files')
for (const file of defaultFiles) {
  assert.ok(isDefaultTest(file), `Default Vitest discovery escaped the supported roots: ${file}`)
}

const trackedFiles = trackedTestLikeFiles()
const expectedDefaultFiles = trackedFiles.filter(isDefaultTest)
assert.deepEqual(
  [...defaultFiles].sort(),
  expectedDefaultFiles,
  'Default Vitest discovery must include every tracked intended test exactly once',
)

const nestedCanary = 'tests/integration/validation-scope-nested.test.ts'
assert.ok(
  defaultFiles.includes(nestedCanary),
  `Nested intended test is undiscovered: ${nestedCanary}`,
)

const nestedCheckoutFixture = 'tests/fixtures/nested-checkout/.worktrees/example/e2e/app.spec.ts'
assert.ok(
  trackedFiles.includes(nestedCheckoutFixture),
  `Nested checkout fixture is missing: ${nestedCheckoutFixture}`,
)
assert.ok(
  !defaultFiles.includes(nestedCheckoutFixture),
  `Nested checkout fixture escaped into default discovery: ${nestedCheckoutFixture}`,
)

const performanceFiles = listedFiles('vitest.performance.config.ts')
assert.deepEqual(performanceFiles, [
  'tests/performance/import-worker-boundary.test.ts',
  'tests/performance/solver-performance-budget.test.ts',
])

console.log(
  `Validation scope is stable: ${defaultFiles.length} tracked default test files and ${performanceFiles.length} performance files.`,
)
