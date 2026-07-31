import { Buffer } from 'node:buffer'
import {
  APP_PATH,
  DIVINE_BORDER_PAYLOAD,
  ENGLISH_CHART,
  KOREAN_CHART,
  ORIGIN,
  UNKNOWN_SHAPE_CHART,
  expect,
  makeCrossingChartBatch,
  openApp,
  pasteText,
  test,
} from './support'

const libraryHeading = (page: Parameters<typeof openApp>[0]) =>
  page.locator('.library .panel-title').filter({ hasText: 'Chart Library' })

test('globally imports English, Korean, and border clipboard payloads', async ({ appPage }) => {
  const workerUrls: string[] = []
  appPage.on('worker', (worker) => workerUrls.push(worker.url()))
  await openApp(appPage)

  await pasteText(appPage, ENGLISH_CHART)
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
  ).toBeVisible()

  await pasteText(appPage, KOREAN_CHART)
  await expect(libraryHeading(appPage)).toContainText('(2)')
  await expect(
    appPage.getByRole('button', { name: 'Select 해병 고역 산호 암초 해도 for placement' }),
  ).toBeVisible()

  await pasteText(appPage, 'ordinary prose that must not be intercepted')
  await expect(libraryHeading(appPage)).toContainText('(2)')

  await pasteText(appPage, DIVINE_BORDER_PAYLOAD)
  await expect(
    appPage.getByRole('button', {
      name: /Border segment 1: .*Divine Orbs/,
    }),
  ).toBeVisible()
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
})

test('recovers an unknown shape and places it on the board with the keyboard', async ({
  appPage,
}) => {
  await openApp(appPage)
  await pasteText(appPage, UNKNOWN_SHAPE_CHART)

  await expect(appPage.getByText(/needs shape confirmation/)).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Solve (0 charts)' })).toBeDisabled()

  const unresolvedChart = appPage.getByRole('button', {
    name: 'Confirm shape for Armoured Coral Reef Chart of Ice',
  })
  await unresolvedChart.focus()
  await expect(unresolvedChart).toBeFocused()
  await appPage.keyboard.press('Enter')

  await appPage.getByLabel('Chart shape').selectOption('Corner')
  await expect(appPage.getByRole('button', { name: 'Solve (1 charts)' })).toBeEnabled()

  const resolvedChart = appPage.getByRole('button', {
    name: 'Select Armoured Coral Reef Chart of Ice for placement',
  })
  await resolvedChart.focus()
  await appPage.keyboard.press('Enter')

  const startCell = appPage.getByRole('button', { name: 'Board cell 7 (start): empty' })
  await startCell.focus()
  await expect(startCell).toBeFocused()
  await appPage.keyboard.press('Enter')

  const placedCell = appPage.getByRole('button', {
    name: 'Board cell 7 (start): Armoured Coral Reef Chart of Ice',
  })
  await expect(placedCell).toBeVisible()
  await expect(placedCell.locator('.path-bar.n')).toBeVisible()
  await expect(placedCell.locator('.path-bar.e')).toBeVisible()

  await placedCell.getByTitle('Rotate').focus()
  await appPage.keyboard.press('Enter')
  await expect(placedCell.locator('.path-bar.n')).toHaveCount(0)
  await expect(placedCell.locator('.path-bar.s')).toBeVisible()

  const firstBorder = appPage.getByRole('button', { name: 'Border segment 1: No border' })
  await firstBorder.focus()
  await appPage.keyboard.press('Enter')
  await appPage.getByPlaceholder('Search border mods…').fill('Divine Orbs')
  await appPage.keyboard.press('Enter')
  await expect(
    appPage.getByRole('button', { name: /Border segment 1: .*Divine Orbs/ }),
  ).toBeVisible()
})

test('cancels a stale solve, completes in the worker, and applies a result', async ({
  appPage,
}) => {
  await appPage.addInitScript({
    content: `
      (() => {
        const NativeWorker = window.Worker
        window.Worker = class DelayedWorker extends NativeWorker {
          postMessage(...args) {
            setTimeout(() => {
              try { super.postMessage(...args) } catch { /* terminated request */ }
            }, 300)
          }
        }
      })()
    `,
  })
  const workerUrls: string[] = []
  appPage.on('worker', (worker) => workerUrls.push(worker.url()))
  await openApp(appPage)
  await pasteText(appPage, makeCrossingChartBatch(9))
  await expect(libraryHeading(appPage)).toContainText('(9)')

  const solveButton = appPage.getByRole('button', { name: 'Solve (9 charts)' })
  await solveButton.click()
  await expect(appPage.getByRole('button', { name: 'Solving…' })).toBeVisible()

  await appPage.getByLabel('Charts can be rotated').uncheck()
  await expect(solveButton).toBeVisible()
  await appPage.waitForTimeout(450)
  await expect(appPage.locator('.results .result')).toHaveCount(0)

  await solveButton.click()
  const firstResult = appPage.locator('.results .result').first()
  await expect(firstResult).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
  await firstResult.click()

  const boardCells = appPage.locator('.tile[role="button"]')
  await expect(boardCells).toHaveCount(9)
  await expect
    .poll(async () => {
      const labels = await boardCells.evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute('aria-label')),
      )
      return labels.filter((label) => label?.endsWith(': empty')).length
    })
    .toBe(0)

  const firstCell = boardCells.nth(0)
  const secondCell = boardCells.nth(1)
  const firstLabel = await firstCell.getAttribute('aria-label')
  const secondLabel = await secondCell.getAttribute('aria-label')
  const firstChartName = firstLabel!.replace(/^Board cell 1: /, '')
  const secondChartName = secondLabel!.replace(/^Board cell 2: /, '')
  await firstCell.focus()
  await appPage.keyboard.press('Enter')
  await secondCell.focus()
  await appPage.keyboard.press('Enter')
  await expect(firstCell).toHaveAttribute('aria-label', `Board cell 1: ${secondChartName}`)
  await expect(secondCell).toHaveAttribute('aria-label', `Board cell 2: ${firstChartName}`)
})

test('round-trips JSON, reports invalid files, and reloads a share link', async ({
  appPage,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN })
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)

  const downloadPromise = appPage.waitForEvent('download')
  await appPage.getByRole('button', { name: 'Export' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()

  appPage.once('dialog', (dialog) => dialog.accept())
  await appPage.getByRole('button', { name: 'Reset' }).click()
  await expect(libraryHeading(appPage)).toContainText('(0)')

  const fileInput = appPage.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  })
  await expect(
    appPage.getByText('Invalid or incompatible state file: file does not contain valid JSON'),
  ).toBeVisible()

  await fileInput.setInputFiles(downloadPath!)
  await expect(appPage.getByText('State loaded from JSON', { exact: true })).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')

  await appPage.getByRole('button', { name: 'Share layout' }).click()
  await expect(appPage.getByRole('button', { name: 'Link copied!' })).toBeVisible()
  const shareUrl = await appPage.evaluate(() => navigator.clipboard.readText())
  expect(shareUrl).toContain(`${ORIGIN}${APP_PATH}#`)

  await appPage.evaluate(() => localStorage.removeItem('allflame-voyage-solver'))
  await appPage.goto(shareUrl)
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
  ).toBeVisible()
})
