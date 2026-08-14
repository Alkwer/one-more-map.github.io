import { expect, test } from '@playwright/test'

const failingProbeMarker = 'PLAYWRIGHT_EXIT_PROBE_BROWSER_STARTED_7A3956F7'
const expectedFailureSignature = 'PLAYWRIGHT_EXIT_PROBE_EXPECTED_FAILURE_E44D809A'

test.skip(
  process.env.PLAYWRIGHT_EXIT_PROBE !== '1',
  'The intentional failure only runs from check-playwright-exit.mjs',
)

test('fails after the intended Chromium page starts', async ({ browserName, page }) => {
  expect(browserName).toBe('chromium')
  await page.goto('about:blank')
  console.log(failingProbeMarker)
  throw new Error(expectedFailureSignature)
})
