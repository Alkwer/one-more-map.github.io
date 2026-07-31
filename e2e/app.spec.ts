import { Buffer } from 'node:buffer'
import AxeBuilder from '@axe-core/playwright'
import {
  APP_PATH,
  COMPLETE_DIVINE_BORDER_PAYLOAD,
  DIVINE_BORDER_PAYLOAD,
  ENGLISH_CHART,
  KOREAN_CHART,
  REROLL_COST_PAYLOAD,
  ORIGIN,
  UNKNOWN_SHAPE_CHART,
  expect,
  makeCrossingChartBatch,
  openApp,
  pasteText,
  test,
} from './support'

type AppPage = Parameters<typeof openApp>[0]

const libraryHeading = (page: AppPage) =>
  page.getByRole('heading', { level: 2, name: /Chart Library/ })

async function expectNoAccessibilityViolations(page: AppPage) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(
    violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([])
}

test('exposes the primary screen structure and visible focus in both themes', async ({
  appPage,
}) => {
  await openApp(appPage)

  await expect(appPage.getByRole('main')).toBeVisible()
  await expect(appPage.getByRole('heading', { level: 2, name: /Chart Library/ })).toBeVisible()
  await expect(appPage.getByRole('heading', { level: 2, name: 'Import' })).toBeVisible()
  await expect(appPage.getByRole('heading', { level: 2, name: 'Voyage Board' })).toBeVisible()
  await expect(appPage.getByRole('heading', { level: 2, name: 'Diagnostics' })).toBeVisible()
  await expectNoAccessibilityViolations(appPage)

  const themeButton = appPage.locator('.theme-link')
  await themeButton.focus()
  await expect(themeButton).toHaveCSS('outline-color', 'rgb(231, 215, 171)')
  await expect(themeButton).toHaveCSS('outline-width', '2px')

  await themeButton.click()
  await expect(appPage.locator('body')).toHaveClass(/theme-harvest/)
  await themeButton.focus()
  await expect(themeButton).toHaveCSS('outline-color', 'rgb(0, 0, 0)')
  await expect(themeButton).toHaveCSS('outline-width', '3px')
  await expect(themeButton).toHaveCSS('box-shadow', /rgb\(255, 255, 255\)/)
})

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

  await pasteText(appPage, REROLL_COST_PAYLOAD)
  await expect(appPage.getByText('1/5', { exact: true })).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Decrease rerolls used' })).toBeEnabled()
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
})

test('records only complete border rolls and keeps Voyage sequences distinct', async ({
  appPage,
}) => {
  await openApp(appPage)

  const research = appPage.locator('details.roll-research')
  await research.getByText(/Contribute border-roll data/).click()
  await expect(research.getByRole('button', { name: 'Save current roll' })).toBeDisabled()

  await pasteText(appPage, COMPLETE_DIVINE_BORDER_PAYLOAD)
  await research.getByLabel('Voyage level').fill('83')
  await expect(research.getByText('✓ All 12 borders ready')).toBeVisible()
  await research.getByRole('button', { name: 'Save current roll' }).click()
  await expect(research.getByText(/Saved complete roll: 12 modifiers/)).toBeVisible()
  await expect(research.getByText(/Contribute border-roll data \(1 saved\)/)).toBeVisible()

  await research.getByRole('button', { name: 'Save current roll' }).click()
  await expect(research.getByText(/already saved/)).toBeVisible()

  await research.getByRole('button', { name: 'Start next Voyage' }).click()
  await research.getByRole('button', { name: 'Save current roll' }).click()
  await expect(research.getByText(/Contribute border-roll data \(2 saved\)/)).toBeVisible()
  await expectNoAccessibilityViolations(appPage)

  const stored = await appPage.evaluate(() =>
    JSON.parse(localStorage.getItem('allflame-border-roll-research') ?? '{}'),
  )
  expect(stored.samples).toHaveLength(2)
  expect(stored.samples[0].sequenceId).not.toBe(stored.samples[1].sequenceId)
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

  const startCell = appPage.getByRole('button', {
    name: 'Board cell 7, row 3, column 1, start: empty',
  })
  await startCell.focus()
  await expect(startCell).toBeFocused()
  await appPage.keyboard.press('Enter')

  const placedCell = appPage.getByRole('button', {
    name: /Board cell 7, row 3, column 1, start: Armoured Coral Reef Chart of Ice; occupied/,
  })
  await expect(placedCell).toBeVisible()
  await expect(placedCell.locator('.path-bar.n')).toBeVisible()
  await expect(placedCell.locator('.path-bar.e')).toBeVisible()

  const preserveButton = appPage.getByRole('button', {
    name: /Preserve Armoured Coral Reef Chart of Ice in row 3, column 1/,
  })
  await preserveButton.focus()
  await appPage.keyboard.press('Space')
  await expect(
    appPage.getByRole('button', {
      name: /Stop preserving Armoured Coral Reef Chart of Ice in row 3, column 1/,
    }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(placedCell).toHaveAccessibleName(/; preserved$/)

  const rotateButton = appPage.getByRole('button', {
    name: /Rotate Armoured Coral Reef Chart of Ice in row 3, column 1; current rotation 0 degrees/,
  })
  await rotateButton.focus()
  await appPage.keyboard.press('Enter')
  await expect(placedCell).toHaveAccessibleName(/rotation 90 degrees/)
  await expect(placedCell.locator('.path-bar.n')).toHaveCount(0)
  await expect(placedCell.locator('.path-bar.s')).toBeVisible()

  const firstBorder = appPage.getByRole('button', { name: 'Border segment 1: No border' })
  await firstBorder.focus()
  await appPage.keyboard.press('Space')
  const borderSearch = appPage.getByRole('textbox', { name: 'Search border modifiers' })
  await expect(borderSearch).toBeFocused()
  await expectNoAccessibilityViolations(appPage)
  await appPage.keyboard.press('Escape')
  await expect(firstBorder).toBeFocused()
  await expect(appPage.getByRole('dialog')).toHaveCount(0)

  await appPage.keyboard.press('Enter')
  await borderSearch.fill('Divine Orbs')
  await appPage.keyboard.press('Enter')
  const filledBorder = appPage.getByRole('button', { name: /Border segment 1: .*Divine Orbs/ })
  await expect(filledBorder).toBeFocused()
  await expect(filledBorder).toBeVisible()

  const removeButton = appPage.getByRole('button', {
    name: /Remove Armoured Coral Reef Chart of Ice from row 3, column 1/,
  })
  await removeButton.focus()
  await appPage.keyboard.press('Space')
  await expect(
    appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }),
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

  const boardCells = appPage.locator('.tile-select')
  await expect(boardCells).toHaveCount(9)
  await expect
    .poll(async () => {
      const names = await boardCells.evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute('data-chart-name')),
      )
      return names.filter(Boolean).length
    })
    .toBe(9)

  const firstCell = boardCells.nth(0)
  const secondCell = boardCells.nth(1)
  const firstChartName = await firstCell.getAttribute('data-chart-name')
  const secondChartName = await secondCell.getAttribute('data-chart-name')
  await firstCell.focus()
  await appPage.keyboard.press('Enter')
  await secondCell.focus()
  await appPage.keyboard.press('Enter')
  await expect(firstCell).toHaveAttribute('data-chart-name', secondChartName!)
  await expect(secondCell).toHaveAttribute('data-chart-name', firstChartName!)
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

  const shareButton = appPage.getByRole('button', { name: 'Share layout' })
  await shareButton.click()
  await expect(shareButton).toContainText('Link copied!')
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
