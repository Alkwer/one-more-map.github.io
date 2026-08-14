import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  expectedFailureSignature,
  failingProbeMarker,
  verifyFailingProbeResult,
} from './check-playwright-exit.mjs'

const exitOne = (output) => ({ code: 1, signal: null, output })

test('accepts the exact expected failing probe exit-1 output', () => {
  assert.doesNotThrow(() =>
    verifyFailingProbeResult(
      exitOne(
        [
          'Running 1 test using 1 worker',
          `\u001b[32m${failingProbeMarker}\u001b[39m`,
          `  Error: ${expectedFailureSignature}`,
          '1 failed',
        ].join('\r\n'),
      ),
    ),
  )
})

test('rejects an unrelated exit-1 after the browser-start marker', () => {
  assert.throws(
    () =>
      verifyFailingProbeResult(
        exitOne(`
Running 1 test using 1 worker
${failingProbeMarker}
Error: unrelated assertion failure
1 failed
`),
      ),
    /did not emit the exact expected failure/,
  )
})

test('rejects a missing browser executable exit-1', () => {
  assert.throws(
    () =>
      verifyFailingProbeResult(
        exitOne(`
Error: browserType.launch: Executable doesn't exist at C:\\playwright\\chromium.exe
1 failed
`),
      ),
    /did not emit the exact browser-start marker/,
  )
})

test('rejects browser launch and configuration exit-1 outputs', () => {
  const unrelatedFailures = [
    'Error: browserType.launch: Process exited before connecting',
    'Error: playwright.config.ts could not be loaded',
  ]

  for (const output of unrelatedFailures) {
    assert.throws(
      () => verifyFailingProbeResult(exitOne(output)),
      /did not emit the exact browser-start marker/,
    )
  }
})
