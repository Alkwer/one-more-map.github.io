import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertBundleBudgets,
  collectCompleteStartupKeys,
  collectEntrySurfaceKeys,
  COMPLETE_STARTUP_GZIP_BUDGET,
  ENTRY_SURFACE_GZIP_BUDGET,
} from './check-initial-bundle-budget.mjs'

const manifest = {
  'index.html': {
    file: 'assets/index-hash.js',
    isEntry: true,
    dynamicImports: ['react-dom/client.js', 'src/App.tsx'],
  },
  'react-dom/client.js': {
    file: 'assets/client-hash.js',
    imports: ['index.html'],
  },
  'src/App.tsx': {
    file: 'assets/App-hash.js',
    imports: ['_shared.js'],
    dynamicImports: ['src/components/Tutorial.tsx'],
  },
  '_shared.js': { file: 'assets/shared-hash.js' },
  'src/components/Tutorial.tsx': { file: 'assets/Tutorial-hash.js' },
}

test('derives initial chunks from manifest relationships, not hashed filenames', () => {
  assert.deepEqual(
    [...collectEntrySurfaceKeys(manifest)].sort(),
    ['index.html', 'react-dom/client.js', 'src/App.tsx'].sort(),
  )
  assert.deepEqual(
    [...collectCompleteStartupKeys(manifest)].sort(),
    ['_shared.js', 'index.html', 'react-dom/client.js', 'src/App.tsx'].sort(),
  )
  assert.equal(collectCompleteStartupKeys(manifest).has('src/components/Tutorial.tsx'), false)
})

test('reports a controlled entry or eager-dependency budget regression', () => {
  assert.doesNotThrow(() =>
    assertBundleBudgets({
      entrySurface: { gzipBytes: ENTRY_SURFACE_GZIP_BUDGET },
      completeStartup: { gzipBytes: COMPLETE_STARTUP_GZIP_BUDGET },
    }),
  )
  assert.throws(
    () =>
      assertBundleBudgets({
        entrySurface: { gzipBytes: ENTRY_SURFACE_GZIP_BUDGET + 1 },
        completeStartup: { gzipBytes: COMPLETE_STARTUP_GZIP_BUDGET + 1 },
      }),
    /Initial bundle budget exceeded: entry surfaces are .*; complete startup is/,
  )
})
