import { Buffer } from 'node:buffer'
import AxeBuilder from '@axe-core/playwright'
import {
  APP_PATH,
  COMPLETE_DIVINE_BORDER_PAYLOAD,
  DIVINE_BORDER_PAYLOAD,
  ENGLISH_CHART,
  INCOMPLETE_BORDER_SCAN_PAYLOAD,
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

test('lets low-investment strategies persist independent chart protections', async ({
  appPage,
}) => {
  await openApp(appPage)

  const alcAndGo = appPage.locator('.strat-card').filter({ hasText: 'Alc & Go' })
  await alcAndGo.getByRole('button', { name: 'Set active strategy' }).click()

  const protections = appPage.getByRole('group', {
    name: 'Protect charts for other strategies',
  })
  await expect(protections.getByLabel('Speedrun Strongboxes')).toBeChecked()
  await expect(protections.getByLabel('Divine strategies')).toBeChecked()
  await expect(protections.getByLabel('Meatfish')).toBeChecked()
  await expect(protections.getByLabel('Magic Ethereal')).toBeChecked()

  await protections.getByLabel('Meatfish').uncheck()
  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return stored.strategyReservations?.meatfish
      }),
    )
    .toBe(false)

  await appPage.reload()
  await expect(
    appPage
      .getByRole('group', { name: 'Protect charts for other strategies' })
      .getByLabel('Meatfish'),
  ).not.toBeChecked()
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
      name: /Border segment 1: .*Divine Orb/,
    }),
  ).toBeVisible()

  await pasteText(appPage, REROLL_COST_PAYLOAD)
  await expect(appPage.getByText('3/5', { exact: true })).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Decrease rerolls used' })).toBeEnabled()
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
})

test('keeps existing borders after an interrupted Windows OCR sweep', async ({ appPage }) => {
  await openApp(appPage)

  await pasteText(appPage, DIVINE_BORDER_PAYLOAD)
  const firstBorder = appPage.getByRole('button', {
    name: /Border segment 1: .*Divine Orb/,
  })
  await expect(firstBorder).toBeVisible()

  await pasteText(appPage, INCOMPLETE_BORDER_SCAN_PAYLOAD)

  await expect(firstBorder).toBeVisible()
  const importStatus = appPage.getByRole('region', { name: 'Import' }).getByRole('status')
  await expect(importStatus).toContainText('matched 11/12 border modifiers')
  await expect(importStatus).toContainText(
    'border scan incomplete (11/12 positions); kept existing borders',
  )
  await expect(importStatus).toContainText('OCR language en-US')
})

test('records only complete border rolls and keeps Voyage sequences distinct', async ({
  appPage,
}) => {
  await openApp(appPage)

  const research = appPage.locator('details.roll-research')
  await research.getByText(/Contribute border-roll data/).click()
  await expect(research.getByRole('button', { name: 'Save current roll' })).toBeDisabled()

  await pasteText(appPage, COMPLETE_DIVINE_BORDER_PAYLOAD)
  await expect(research.getByLabel('Voyage level')).toHaveCount(0)
  await expect(research.getByLabel('Roll number')).toHaveCount(0)
  await expect(research.getByLabel('Next cost shown')).toHaveCount(0)
  await expect(research.getByText('✓ All 12 borders ready')).toBeVisible()
  await expect(research.getByText(/Auto-saved natural board/)).toBeVisible()
  await expect(research.getByText(/Contribute border-roll data \(1 active\)/)).toBeVisible()
  await expect(research.getByRole('button', { name: 'Submit Voyage' })).toBeEnabled()

  await research.getByRole('button', { name: 'Save current roll' }).click()
  await expect(research.getByText(/Saved paid reroll 1/)).toBeVisible()
  await expect(research.getByText(/Contribute border-roll data \(2 active\)/)).toBeVisible()

  await research.getByRole('button', { name: 'Start next Voyage' }).click()
  await pasteText(appPage, COMPLETE_DIVINE_BORDER_PAYLOAD)
  await expect(research.getByText(/Auto-saved natural board/)).toBeVisible()
  await expect(research.getByText(/Contribute border-roll data \(3 active\)/)).toBeVisible()

  await research.getByRole('button', { name: 'Archive' }).click()
  await expect(
    research.getByText(/Contribute border-roll data \(1 active · 2 archived\)/),
  ).toBeVisible()
  await research.getByRole('button', { name: 'Show archived (1)' }).click()
  await expect(research.getByText('Archived', { exact: true })).toBeVisible()
  await research.getByRole('button', { name: 'Restore' }).click()
  await expect(research.getByText(/Contribute border-roll data \(3 active\)/)).toBeVisible()
  await expectNoAccessibilityViolations(appPage)

  const stored = await appPage.evaluate(() =>
    JSON.parse(localStorage.getItem('allflame-border-roll-research') ?? '{}'),
  )
  expect(stored.samples).toHaveLength(3)
  expect(stored.version).toBe(3)
  expect(stored.archivedSequenceIds).toEqual([])
  expect(stored.samples[0]).not.toHaveProperty('voyageLevel')
  expect(stored.samples[0].rerollIndex).toBe(0)
  expect(stored.samples[1].rerollIndex).toBe(1)
  expect(stored.samples[0].sequenceId).toBe(stored.samples[1].sequenceId)
  expect(stored.samples[1].sequenceId).not.toBe(stored.samples[2].sequenceId)
})

test('archives a Voyage only after the automatic outbox receives a success response', async ({
  appPage,
}) => {
  const sequenceId = 'voyage-submitted-e2e'
  const sample = {
    schema: 'allflame-border-roll/v2',
    sampleId: 'roll-submitted-e2e',
    sequenceId,
    capturedAt: '2026-08-01T18:43:24.435Z',
    gamePatch: '3.29',
    generation: 'natural',
    rerollIndex: 0,
    displayedNextRerollCost: 3000,
    borderModIds: [
      'b-crabboss',
      'b-curr-1',
      'b-minmagic',
      'b-anchor-2',
      'b-mag-2',
      'b-izaro',
      'b-rare-1',
      'b-rare-1',
      'b-crabs-2',
      'b-locker',
      'b-locker',
      'b-mag-3',
    ],
  }

  await appPage.route(
    'https://allflame-border-roll-intake.green-loom-6865.chatgpt.site/api/border-rolls',
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          },
        })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': ORIGIN },
        body: JSON.stringify({
          status: 'created',
          issueNumber: 999,
          issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/999',
        }),
      })
    },
  )
  await appPage.addInitScript(
    ({ queuedSample, queuedSequenceId }) => {
      localStorage.setItem(
        'allflame-border-roll-research',
        JSON.stringify({
          version: 3,
          activeSequenceId: 'voyage-next-e2e',
          samples: [queuedSample],
          archivedSequenceIds: [],
        }),
      )
      localStorage.setItem(
        'allflame-border-roll-submission',
        JSON.stringify({
          version: 1,
          settings: { enabled: true, submissionKey: 'e2e-private-key' },
          queue: [
            {
              sequenceId: queuedSequenceId,
              queuedAt: '2026-08-01T18:46:08.655Z',
              dataset: {
                schema: 'allflame-border-roll-dataset/v2',
                exportedAt: '2026-08-01T18:46:08.655Z',
                sampleCount: 1,
                samples: [queuedSample],
              },
            },
          ],
        }),
      )
    },
    { queuedSample: sample, queuedSequenceId: sequenceId },
  )

  await openApp(appPage)
  const research = appPage.locator('details.roll-research')
  await expect(
    research.getByText(/Contribute border-roll data \(0 active · 1 archived\)/),
  ).toBeVisible()
  await research.getByText(/Contribute border-roll data/).click()
  await expect(research.getByText('0 Voyage sequences queued')).toBeVisible()
  await expect(research.getByText(/Submitted Voyage .* as issue #999/)).toBeVisible()
  await expect(
    research.getByText('All submitted Voyage sequences are archived locally.'),
  ).toBeVisible()

  const stored = await appPage.evaluate(() =>
    JSON.parse(localStorage.getItem('allflame-border-roll-research') ?? '{}'),
  )
  expect(stored.samples).toHaveLength(1)
  expect(stored.archivedSequenceIds).toEqual([sequenceId])
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
  await borderSearch.fill('Divine Orb')
  await appPage.keyboard.press('Enter')
  const filledBorder = appPage.getByRole('button', { name: /Border segment 1: .*Divine Orb/ })
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

test('steps through chart copying and preserves a confirmed Voyage survivor', async ({
  appPage,
}) => {
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)
  await pasteText(appPage, KOREAN_CHART)

  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()
  await appPage
    .getByRole('button', { name: 'Select 해병 고역 산호 암초 해도 for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 8, row 3, column 2: empty' }).click()

  const preserveButton = appPage.getByRole('button', {
    name: /Preserve Armoured Coral Reef Chart of Ice in row 3, column 1/,
  })
  await preserveButton.focus()
  await appPage.keyboard.press('Space')
  await appPage.getByRole('button', { name: /Copy into game/ }).click()
  await expect(appPage.getByText(/Step 1 of 2/)).toBeVisible()
  await appPage.getByRole('button', { name: /Copy & next/ }).click()
  await expect(appPage.getByText(/Step 2 of 2/)).toBeVisible()
  await appPage.getByRole('button', { name: /Copy last & finish/ }).click()
  await expect(appPage.getByText(/Place into game in this order/)).toHaveCount(0)

  await appPage.getByRole('button', { name: /Finish Voyage/ }).click()
  await expect(appPage.getByText(/Preserved chart 1 of 1/)).toBeVisible()
  await appPage.getByRole('button', { name: /Kept it/ }).click()

  await expect(appPage.getByText('Voyage finished: consumed 1 chart, kept 1')).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }),
  ).toBeVisible()
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
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
