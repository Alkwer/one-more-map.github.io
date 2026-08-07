import { defineConfig, devices } from '@playwright/test'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const host = '127.0.0.1'
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const origin = `http://${host}:${port}`
const require = createRequire(import.meta.url)
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const previewCommand = `"${process.execPath}" "${viteCli}" preview --outDir staging --host ${host} --port ${port} --strictPort`

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: `${origin}/allflame-voyage-solver/`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Keep Vite directly under Playwright's managed shell. The npm.cmd wrapper
    // can retain a Windows process-tree handle after the tests have finished.
    command: previewCommand,
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
