import { Buffer } from 'node:buffer'
import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { MAX_IMPORT_TEXT_LENGTH } from '../src/logic/importBudget'
import { defaultState, serializeState } from '../src/logic/storage'
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

const BORDER_RESEARCH_STORAGE_KEY = 'allflame-border-roll-research'
const BORDER_SUBMISSION_STORAGE_KEY = 'allflame-border-roll-submission'
const BORDER_MOD_IDS = [
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
]

const borderResearchSample = (sequenceId: string, sampleId: string) => ({
  schema: 'allflame-border-roll/v2',
  sampleId,
  sequenceId,
  capturedAt: '2026-08-08T12:00:00.000Z',
  gamePatch: '3.29.2',
  vesperUpgradeCount: 4,
  generation: 'natural',
  rerollIndex: 0,
  displayedNextRerollCost: 3000,
  borderModIds: BORDER_MOD_IDS,
})

async function failAuxiliaryWrites(page: AppPage, storageKey: string) {
  await page.evaluate((blockedKey) => {
    const originalSetItem = Storage.prototype.setItem
    const controlledWindow = window as typeof window & { restoreAuxiliaryWrites?: () => void }
    controlledWindow.restoreAuxiliaryWrites = () => {
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value: originalSetItem,
      })
    }
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (key === blockedKey) throw new DOMException('storage full', 'QuotaExceededError')
        return originalSetItem.call(this, key, value)
      },
    })
  }, storageKey)
}

async function restoreAuxiliaryWrites(page: AppPage) {
  await page.evaluate(() => {
    const controlledWindow = window as typeof window & { restoreAuxiliaryWrites?: () => void }
    controlledWindow.restoreAuxiliaryWrites?.()
  })
}

const libraryHeading = (page: AppPage) =>
  page.getByRole('heading', { level: 2, name: /Chart Library/ })

const chartPayload = (name: string, area: string, implicit: string) =>
  ENGLISH_CHART.replace('Armoured Coral Reef Chart of Ice', name)
    .replace('Undersea Groves', area)
    .replace("20% increased Dead Man's Sulphur found in this Area", implicit)
    .replace('Chart Shape: Corner', 'Chart Shape: Crossing')

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

async function expectAccessibleModal(page: AppPage, trigger: Locator, dialogName: string | RegExp) {
  await trigger.focus()
  await expect(trigger).toBeFocused()
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: dialogName })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-dialog-initial-focus]')).toBeFocused()
  await expect(page.locator('main')).toHaveJSProperty('inert', true)
  await expectNoAccessibilityViolations(page)

  const focusable = dialog.locator(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  await page.keyboard.press('Shift+Tab')
  await expect(focusable.last()).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(focusable.first()).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.locator('main')).toHaveJSProperty('inert', false)
}

test('stays usable when browser storage access is blocked', async ({ appPage }) => {
  await appPage.addInitScript(() => {
    for (const method of ['getItem', 'setItem'] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    }
  })

  await openApp(appPage)
  await expect(appPage.locator('.app')).toBeVisible()
  await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await appPage.getByRole('button', { name: 'Switch to list view' }).click()
  await expect(appPage.getByRole('button', { name: 'Switch to grid view' })).toBeVisible()
})

test('warns and offers recovery when autosave starts failing after load', async ({ appPage }) => {
  await appPage.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem
    const controlledWindow = window as typeof window & { failAutosaveWrites: boolean }
    controlledWindow.failAutosaveWrites = false
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value(this: Storage, key: string, value: string) {
        if (controlledWindow.failAutosaveWrites) {
          throw new DOMException('storage full', 'QuotaExceededError')
        }
        return originalSetItem.call(this, key, value)
      },
    })
  })

  await openApp(appPage)
  await expect
    .poll(() => appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver') !== null))
    .toBe(true)
  await appPage.evaluate(() => {
    ;(window as typeof window & { failAutosaveWrites: boolean }).failAutosaveWrites = true
  })

  await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
  const warning = appPage.getByRole('alert').filter({ hasText: 'Autosave failed' })
  await expect(warning).toContainText('current changes are not durable')
  await expect(warning).toContainText('Browser storage is full.')
  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return saved.pool?.length ?? 0
      }),
    )
    .toBe(0)

  const downloadPromise = appPage.waitForEvent('download')
  await warning.getByRole('button', { name: 'Export recovery JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('voyage-solver-unsaved-recovery.json')

  await warning.getByRole('button', { name: 'Dismiss until next change' }).click()
  await expect(warning).toHaveCount(0)
  await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
  await expect(warning).toBeVisible()

  await appPage.evaluate(() => {
    ;(window as typeof window & { failAutosaveWrites: boolean }).failAutosaveWrites = false
  })
  await warning.getByRole('button', { name: 'Retry save' }).click()
  await expect(warning).toHaveCount(0)
  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return saved.pool?.length ?? 0
      }),
    )
    .toBe(2)
})

test('flushes a pending autosave before an immediate reload', async ({ appPage }) => {
  await appPage.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 300 ? 30_000 : timeout,
        ...args,
      )) as typeof window.setTimeout
  })

  await openApp(appPage)
  await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
  await expect(libraryHeading(appPage)).toContainText('(1)')

  await appPage.reload()

  await expect(libraryHeading(appPage)).toContainText('(1)')
})

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

test('keeps every modal workflow labelled, contained, dismissible, and focus-safe', async ({
  appPage,
}) => {
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)

  await expectAccessibleModal(
    appPage,
    appPage.getByRole('button', { name: 'Open how it works guide' }),
    'Plan your Voyage',
  )
  await expectAccessibleModal(
    appPage,
    appPage.getByRole('button', { name: 'Mods' }),
    'Chart Modifiers',
  )
  await expectAccessibleModal(appPage, appPage.getByRole('button', { name: 'Updates' }), 'Updates')
  await expectAccessibleModal(
    appPage,
    appPage.getByRole('button', { name: /TUTORIAL/ }),
    /What this site does/,
  )
  await expectAccessibleModal(
    appPage,
    appPage.getByRole('button', { name: /Save charts for strategies/ }),
    /Keep charts for strategies/,
  )
  await expectAccessibleModal(
    appPage,
    appPage.getByRole('button', { name: '📋 Plan' }),
    'Session Plan',
  )

  const updatesTrigger = appPage.getByRole('button', { name: 'Updates' })
  await updatesTrigger.click()
  await appPage.locator('.onboard-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(updatesTrigger).toBeFocused()

  await updatesTrigger.click()
  await appPage
    .getByRole('dialog', { name: 'Updates' })
    .getByRole('button', { name: 'Done' })
    .click()
  await expect(updatesTrigger).toBeFocused()
})

test('moves focus from automatic first-run onboarding to the first header action', async ({
  appPage,
}) => {
  await appPage.addInitScript(() => localStorage.removeItem('onboarding-seen'))
  await openApp(appPage)

  const onboarding = appPage.getByRole('dialog', { name: 'Plan your Voyage' })
  await expect(onboarding.locator('[data-dialog-initial-focus]')).toBeFocused()
  await appPage.keyboard.press('Escape')
  await expect(onboarding).toHaveCount(0)
  await expect(appPage.getByRole('button', { name: /TUTORIAL/ })).toBeFocused()
})

test.describe('importer update notice', () => {
  test.use({ ahkNoticeSeen: false })

  test('appears once for returning users and preserves normal interaction after dismissal', async ({
    appPage,
  }) => {
    await openApp(appPage)

    const notice = appPage.getByRole('dialog', { name: /Importer updated/ })
    await expect(notice).toBeVisible()
    await expect(notice.locator('[data-dialog-initial-focus]')).toBeFocused()
    await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
    await expectNoAccessibilityViolations(appPage)
    await expect(notice).toContainText('two pages')
    await expect(notice).toContainText('Shift+F7')
    const downloadLink = notice.getByRole('link', { name: /Download the updated script/ })
    await expect
      .poll(() =>
        downloadLink.evaluate((element) => new URL((element as HTMLAnchorElement).href).pathname),
      )
      .toBe(`${APP_PATH}voyage-import.ahk`)
    expect(await appPage.evaluate(() => localStorage.getItem('announce-ahk-page2'))).toBeNull()

    const focusable = notice.locator(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    await appPage.keyboard.press('Shift+Tab')
    await expect(focusable.last()).toBeFocused()
    await appPage.keyboard.press('Tab')
    await expect(focusable.first()).toBeFocused()

    await notice.getByRole('button', { name: 'Got it' }).click()
    await expect(notice).toHaveCount(0)
    await expect(appPage.locator('main')).toHaveJSProperty('inert', false)
    await expect(appPage.getByRole('button', { name: /TUTORIAL/ })).toBeFocused()
    expect(await appPage.evaluate(() => localStorage.getItem('announce-ahk-page2'))).toBe('1')

    await appPage.reload()
    await expect(notice).toHaveCount(0)
    await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
    await expect(libraryHeading(appPage)).toContainText('(1)')
  })
})

test('reports partial and blocked additions at the 250-chart library boundary', async ({
  appPage,
}) => {
  const seededState = defaultState()
  seededState.pool = Array.from({ length: 249 }, (_, index) => ({
    uid: `capacity-${index}`,
    name: `Capacity Chart ${index + 1}`,
    level: 83,
    edges: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    modIds: [],
    shape: 'Crossing' as const,
    shapeResolved: true,
  }))
  const serializedState = serializeState(seededState)
  await appPage.addInitScript((raw) => {
    localStorage.setItem('allflame-voyage-solver', raw)
  }, serializedState)

  await openApp(appPage)
  await expect(libraryHeading(appPage)).toContainText('(249)')

  await appPage.getByRole('button', { name: '🎲 Demo ×25' }).click()
  await expect(libraryHeading(appPage)).toContainText('(250)')
  const importStatus = appPage.locator('.import-panel').getByRole('status')
  await expect(importStatus).toContainText(
    'Added 1 random demo chart; skipped 24 because the 250-chart library limit was reached',
  )

  await appPage.getByRole('button', { name: '🎲 Demo ×25' }).click()
  await expect(importStatus).toContainText(
    'Added 0 random demo charts; skipped 25 because the 250-chart library limit was reached',
  )
  await expect(libraryHeading(appPage)).toContainText('(250)')

  const addChart = appPage.getByRole('button', { name: '+ Add chart' })
  await expect(addChart).toBeDisabled()
  await expect(appPage.getByText(/Library is full \(250-chart limit\)/).first()).toBeVisible()

  await appPage.getByRole('button', { name: 'Open how it works guide' }).click()
  const onboarding = appPage.getByRole('dialog', { name: 'Plan your Voyage' })
  await expect(
    onboarding.getByRole('button', { name: 'Try it with 25 demo charts' }),
  ).toBeDisabled()
  await expect(onboarding).toContainText(
    'The library is full (250-chart limit). Remove a chart before adding demo charts.',
  )
  await expect(onboarding).toBeVisible()
})

test('lets low-investment strategies persist independent chart protections', async ({
  appPage,
}) => {
  await openApp(appPage)

  const alcAndGo = appPage.locator('.strat-card').filter({ hasText: 'Alc & Go' })
  await alcAndGo.getByRole('button', { name: 'Set active strategy' }).click()

  const protections = appPage.getByRole('group', {
    name: 'Protect chart types',
  })
  await expect(protections.getByLabel('Generic Strongboxes (+1 / +2-4 / +5)')).toBeChecked()
  await expect(protections.getByLabel("Diviner's Strongboxes")).toBeChecked()
  await expect(protections.getByLabel('Giant Starfish')).toBeChecked()
  await expect(protections.getByLabel('Rare Monsters in all Voyage Areas')).toBeChecked()
  await expect(protections.getByLabel('Rare Monsters in adjacent Areas')).toBeChecked()

  await protections.getByLabel('Giant Starfish').uncheck()
  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return stored.strategyReservations?.starfish
      }),
    )
    .toBe(false)

  await appPage.reload()
  await expect(
    appPage.getByRole('group', { name: 'Protect chart types' }).getByLabel('Giant Starfish'),
  ).not.toBeChecked()
})

test('searches, edits, summarizes, and persists a custom keeper type', async ({ appPage }) => {
  await openApp(appPage)
  const barrelChart = ENGLISH_CHART.replace(
    "20% increased Dead Man's Sulphur found in this Area",
    'Adjacent Areas contain 16-20 additional Clusters of Mysterious Barrels',
  )
  await pasteText(appPage, barrelChart)

  await appPage.getByRole('button', { name: /Save charts for strategies/ }).click()
  const search = appPage.getByRole('textbox', { name: 'Search chart types to add' })
  await search.fill('Barrels')
  await appPage.getByRole('button', { name: /Barrels \(any tier\).*adjacent/ }).click()
  await expect(appPage.getByRole('button', { name: 'Remove Barrels (any tier)' })).toBeVisible()

  await search.fill('Lantern')
  await appPage.getByRole('button', { name: /Next/ }).click()
  await expect(search).toHaveValue('')
  await appPage.getByRole('button', { name: /Back/ }).click()
  await appPage.getByRole('button', { name: 'Remove Barrels (any tier)' }).click()
  await expect(appPage.getByRole('button', { name: 'Remove Barrels (any tier)' })).toHaveCount(0)

  await search.fill('Barrels')
  await appPage.getByRole('button', { name: /Barrels \(any tier\).*adjacent/ }).click()
  while (await appPage.getByRole('button', { name: /Next/ }).count()) {
    await appPage.getByRole('button', { name: /Next/ }).click()
  }
  await expect(
    appPage.locator('.sw-row.summary').filter({ hasText: 'Divine Border Rares' }),
  ).toContainText('banking 1 now')
  await appPage.getByRole('button', { name: /Save keep counts/ }).click()

  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return Object.entries(stored.pieceKeeps ?? {}).find(([key]) =>
          key.startsWith('custom:divine-border-rares:adj-barrel-'),
        )?.[1]
      }),
    )
    .toBe(1)

  await appPage.reload()
  await appPage.getByRole('button', { name: /Save charts for strategies/ }).click()
  await expect(appPage.getByRole('button', { name: 'Remove Barrels (any tier)' })).toBeVisible()
})

test('completes the Save Wizard at 320px without horizontal overflow', async ({ appPage }) => {
  await appPage.setViewportSize({ width: 320, height: 568 })
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)
  await appPage.getByRole('button', { name: /Save charts for strategies/ }).click()

  const dialog = appPage.getByRole('dialog', { name: /Keep charts for strategies/ })
  const expectNoHorizontalOverflow = async () => {
    expect(
      await appPage.evaluate(() => {
        const wizard = document.querySelector<HTMLElement>('.save-wizard')
        if (!wizard) throw new Error('Save Wizard is not open')
        return {
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          dialog: wizard.scrollWidth - wizard.clientWidth,
        }
      }),
    ).toEqual({ document: 0, dialog: 0 })
  }

  await expect(dialog).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Cancel' })).toBeVisible()

  let visitedSteps = 0
  while (await appPage.getByRole('button', { name: /Next/ }).count()) {
    visitedSteps++
    expect(visitedSteps).toBeLessThanOrEqual(10)
    const firstRow = dialog.locator('.sw-row').first()
    await expect(firstRow.locator('.sw-name')).toBeVisible()
    await expect(firstRow.locator('.sw-mod')).toBeVisible()
    await expect(firstRow.locator('.sw-stepper')).toBeVisible()
    await expectNoHorizontalOverflow()
    await appPage.getByRole('button', { name: /Next/ }).click()
  }

  expect(visitedSteps).toBeGreaterThan(0)
  await expect(appPage.getByRole('button', { name: /Save keep counts/ })).toBeVisible()
  await expectNoHorizontalOverflow()
  await appPage.getByRole('button', { name: /Save keep counts/ }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    await appPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
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
  await expect(
    appPage.getByLabel('Voyage Recommendation').getByText('3/5', { exact: true }),
  ).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Decrease rerolls used' })).toBeEnabled()
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
})

test('exposes chart details to keyboard and screen-reader navigation', async ({ appPage }) => {
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)

  const chartName = 'Armoured Coral Reef Chart of Ice'
  const libraryChart = appPage.getByRole('button', {
    name: `Select ${chartName} for placement`,
  })
  const descriptionId = await libraryChart.getAttribute('aria-describedby')
  expect(descriptionId).toBeTruthy()
  const description = appPage.locator(`[id="${descriptionId}"]`)
  await expect(description).toContainText('Area Level: 63 · Corner')
  await expect(description).toContainText('+20% Item Quantity')
  await expect(description).toContainText('Weighted value:')
  await expect(libraryChart).toHaveAccessibleName(`Select ${chartName} for placement`)

  await libraryChart.focus()
  await expect(appPage.locator('.poe-tooltip')).toContainText(chartName)
  await expect(appPage.locator('.poe-tooltip')).toContainText('Area Level: 63 · Corner')
  await appPage.keyboard.press('Escape')
  await expect(appPage.locator('.poe-tooltip')).toHaveCount(0)

  await appPage.locator('body').click({ position: { x: 2, y: 2 } })
  await libraryChart.hover()
  await expect(appPage.locator('.poe-tooltip')).toContainText('+20% Item Quantity')
  await appPage.mouse.move(0, 0)
  await expect(appPage.locator('.poe-tooltip')).toHaveCount(0)

  await libraryChart.click()
  await appPage.getByRole('button', { name: /Board cell 1,.*empty/ }).click()
  const boardChart = appPage.locator('[data-chart-name="Armoured Coral Reef Chart of Ice"]')
  const boardDescriptionId = await boardChart.getAttribute('aria-describedby')
  expect(boardDescriptionId).toBeTruthy()
  await expect(appPage.locator(`[id="${boardDescriptionId}"]`)).toContainText('Weighted value:')
  await boardChart.focus()
  await expect(appPage.locator('.poe-tooltip')).toContainText('20% increased Dead Man')
  await appPage.keyboard.press('Tab')
  await expect(appPage.locator('.poe-tooltip')).toHaveCount(0)
})

test('provides touch-only detail controls without placing or deleting charts', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen', '1')
    localStorage.setItem('announce-ahk-page2', '1')
  })
  await openApp(page)
  await pasteText(page, ENGLISH_CHART)

  const chartName = 'Armoured Coral Reef Chart of Ice'
  const libraryChart = page.getByRole('button', {
    name: `Select ${chartName} for placement`,
  })
  const inspectLibrary = page.getByRole('button', {
    name: `Inspect details for ${chartName}`,
  })
  await expect(inspectLibrary).toBeVisible()
  await inspectLibrary.tap()
  await expect(page.locator('.poe-tooltip')).toContainText('Area Level: 63 · Corner')
  await expect(libraryChart).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: /Board cell 1,.*empty/ })).toBeVisible()
  await inspectLibrary.tap()
  await expect(page.locator('.poe-tooltip')).toHaveCount(0)

  await libraryChart.tap()
  await page.getByRole('button', { name: /Board cell 1,.*empty/ }).tap()
  const boardChart = page.locator('[data-chart-name="Armoured Coral Reef Chart of Ice"]')
  await expect(boardChart).toBeVisible()
  const inspectBoard = page
    .getByRole('group', { name: `Actions for ${chartName}` })
    .getByRole('button', { name: `Inspect details for ${chartName}` })
  await expect(inspectBoard).toBeVisible()
  await inspectBoard.tap({ position: { x: 8, y: 8 } })
  await expect(page.locator('.poe-tooltip')).toContainText('Weighted value:')
  await expect(boardChart).toBeVisible()
})

test('rejects an oversized chart paste before it can monopolize the main thread', async ({
  appPage,
}) => {
  await openApp(appPage)
  const oversized = `Item Class: Chart\n${'x'.repeat(MAX_IMPORT_TEXT_LENGTH)}`
  const dispatchMilliseconds = await appPage.evaluate((clipboardText) => {
    const data = new DataTransfer()
    data.setData('text/plain', clipboardText)
    const started = performance.now()
    document.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    )
    return performance.now() - started
  }, oversized)

  expect(dispatchMilliseconds).toBeLessThan(500)
  await expect(appPage.locator('.import-panel').getByRole('status')).toContainText(
    `maximum size is ${MAX_IMPORT_TEXT_LENGTH.toLocaleString('en-US')} characters`,
  )
  await expect(appPage.getByRole('textbox', { name: 'Chart or border import text' })).toHaveValue(
    '',
  )
  await expect(libraryHeading(appPage)).toContainText('(0)')
})

test('clears stale chart and board-cell selections after removals', async ({ appPage }) => {
  await openApp(appPage)
  const firstName = 'Selection Crossing One'
  const secondName = 'Selection Crossing Two'
  await pasteText(
    appPage,
    [
      chartPayload(firstName, 'Undersea Groves', '25% increased number of Rare Monsters'),
      chartPayload(secondName, 'Undersea Groves', '25% increased number of Rare Monsters'),
    ].join('\n'),
  )

  const firstCard = appPage.getByRole('button', {
    name: `Select ${firstName} for placement`,
  })
  const firstCell = appPage.locator('.tile-select').nth(0)
  const secondCell = appPage.locator('.tile-select').nth(1)

  await firstCard.click()
  await appPage.getByRole('button', { name: `Delete ${firstName}` }).click()
  await firstCell.click()
  await expect(
    appPage.getByRole('alert').filter({ hasText: 'Your latest change was kept out' }),
  ).toHaveCount(0)
  await expect(firstCell).not.toHaveAttribute('data-chart-name')

  await pasteText(
    appPage,
    chartPayload(firstName, 'Undersea Groves', '25% increased number of Rare Monsters'),
  )
  await appPage.getByRole('button', { name: `Select ${firstName} for placement` }).click()
  await firstCell.click()
  await appPage.getByRole('button', { name: `Select ${secondName} for placement` }).click()
  await secondCell.click()
  await expect(firstCell).toHaveAttribute('data-chart-name', firstName)
  await expect(secondCell).toHaveAttribute('data-chart-name', secondName)

  await firstCell.click()
  await appPage.getByRole('button', { name: new RegExp(`Remove ${firstName} from`) }).click()
  await secondCell.click()

  await expect(firstCell).not.toHaveAttribute('data-chart-name')
  await expect(secondCell).toHaveAttribute('data-chart-name', secondName)
})

test('blocks overlong single-chart copies without advancing the placement sequence', async ({
  appPage,
}) => {
  await openApp(appPage)
  const longName = `Overlong ${'X'.repeat(220)}`
  await pasteText(
    appPage,
    chartPayload(longName, 'Undersea Groves', '25% increased number of Rare Monsters'),
  )
  await appPage.getByRole('button', { name: `Select ${longName} for placement` }).click()
  await appPage.locator('.tile-select').nth(0).click()

  await appPage.getByRole('button', { name: `Copy in-game search for ${longName}` }).click()
  await expect(appPage.locator('.tile-copy-fallback')).toContainText(
    'Exact chart search exceeds the 250-character in-game limit',
  )
  await expect(
    appPage.getByRole('textbox', { name: `Manual in-game search for ${longName}` }),
  ).toHaveCount(0)

  await appPage.getByRole('button', { name: '📋 Copy into game' }).click()
  await expect(appPage.getByText(/Step 1 of 1/)).toBeVisible()
  await appPage.getByRole('button', { name: '📋 Copy last & finish' }).click()

  await expect(appPage.getByText(/Step 1 of 1/)).toBeVisible()
  await expect(appPage.getByRole('button', { name: 'Search exceeds in-game limit' })).toBeDisabled()
  await expect(appPage.getByText('Manual copy search')).toHaveCount(0)
  expect(
    await appPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})

test('plans the complete corner Divine composition with two feeders and six Rares', async ({
  appPage,
}) => {
  await openApp(appPage)

  const charts = [
    chartPayload(
      'Sea Pillars Crossing',
      'Sea Pillars',
      "20% increased Dead Man's Sulphur found in this Area",
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      chartPayload(
        `Starfish Feeder ${index + 1}`,
        'Undersea Groves',
        'Adjacent Areas contains 4-5 additional Giant Starfish',
      ),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      chartPayload(
        `Rare Crossing ${index + 1}`,
        'Undersea Groves',
        '25% increased number of Rare Monsters',
      ),
    ),
  ]
  await pasteText(appPage, charts.join('\n'))
  await pasteText(appPage, DIVINE_BORDER_PAYLOAD)
  await expect(libraryHeading(appPage)).toContainText('(9)')

  await appPage.getByRole('button', { name: '📋 Plan' }).click()
  const planner = appPage.locator('.session-plan')
  const readyDivine = planner.locator('.plan-row.ready').filter({ hasText: 'Divine Border Rares' })

  await expect(readyDivine).toContainText('pieces ready - run this board')
  await expect(
    planner.locator('.plan-row.waiting').filter({ hasText: 'Divine Border Rares' }),
  ).toHaveCount(0)
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
  await research.getByRole('combobox', { name: /Vesper upgrades/ }).selectOption('4')

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
  expect(stored.version).toBe(5)
  expect(stored.vesperUpgradeCount).toBe(4)
  expect(stored.randomizedResearchEnabled).toBe(false)
  expect(stored.activeSequenceSamplingReason).toBe('gameplay')
  expect(stored.archivedSequenceIds).toEqual([])
  expect(stored.samples[0]).not.toHaveProperty('voyageLevel')
  expect(stored.samples[0].vesperUpgradeCount).toBe(4)
  expect(stored.samples[0].samplingReason).toBe('gameplay')
  expect(stored.samples[0].rerollIndex).toBe(0)
  expect(stored.samples[1].rerollIndex).toBe(1)
  expect(stored.samples[0].sequenceId).toBe(stored.samples[1].sequenceId)
  expect(stored.samples[1].sequenceId).not.toBe(stored.samples[2].sequenceId)
})

test('does not report research actions as saved when their storage write fails', async ({
  appPage,
}) => {
  const activeSequenceId = 'voyage-current-actions-e2e'
  const previousSequenceId = 'voyage-previous-actions-e2e'
  const sample = borderResearchSample(previousSequenceId, 'roll-actions-e2e')

  await appPage.addInitScript(
    ({ seededSample, currentSequenceId }) => {
      if (sessionStorage.getItem('research-actions-seeded')) return
      localStorage.setItem(
        'allflame-border-roll-research',
        JSON.stringify({
          version: 4,
          activeSequenceId: currentSequenceId,
          vesperUpgradeCount: 4,
          samples: [seededSample],
          archivedSequenceIds: [],
        }),
      )
      sessionStorage.setItem('research-actions-seeded', '1')
    },
    { seededSample: sample, currentSequenceId: activeSequenceId },
  )

  const openResearch = async () => {
    await expect(appPage.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
    const panel = appPage.locator('details.roll-research')
    await panel.locator('summary').click()
    return panel
  }
  const storedResearch = () =>
    appPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      BORDER_RESEARCH_STORAGE_KEY,
    )

  await openApp(appPage)
  const research = await openResearch()
  await failAuxiliaryWrites(appPage, BORDER_RESEARCH_STORAGE_KEY)
  await research.getByRole('button', { name: 'Start next Voyage' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    'Border research storage became unavailable',
  )
  await expect(research.getByText(/Started a new Voyage sequence/)).toHaveCount(0)
  expect((await storedResearch()).activeSequenceId).toBe(activeSequenceId)

  await restoreAuxiliaryWrites(appPage)
  await research
    .getByRole('alert', { name: 'Border research needs recovery' })
    .getByRole('button', { name: 'Retry / migrate' })
    .click()
  await failAuxiliaryWrites(appPage, BORDER_RESEARCH_STORAGE_KEY)
  await research.getByRole('button', { name: 'Archive' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    'Border research storage became unavailable',
  )
  await expect(research.getByText('Archived the submitted Voyage locally.')).toHaveCount(0)
  expect((await storedResearch()).archivedSequenceIds).toEqual([])

  await restoreAuxiliaryWrites(appPage)
  await research
    .getByRole('alert', { name: 'Border research needs recovery' })
    .getByRole('button', { name: 'Retry / migrate' })
    .click()
  await research.getByRole('button', { name: 'Archive' }).click()
  await research.getByRole('button', { name: 'Show archived (1)' }).click()
  await expect(research.getByText('Archived', { exact: true })).toBeVisible()
  await failAuxiliaryWrites(appPage, BORDER_RESEARCH_STORAGE_KEY)
  await research.getByRole('button', { name: 'Restore' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    'Border research storage became unavailable',
  )
  await expect(research.getByText('Restored the Voyage to the saved sequence list.')).toHaveCount(0)
  expect((await storedResearch()).archivedSequenceIds).toEqual([previousSequenceId])
})

test('does not queue or advance a finished border sequence after a required write fails', async ({
  appPage,
}) => {
  const sequenceId = 'voyage-finish-storage-e2e'
  const sample = borderResearchSample(sequenceId, 'roll-finish-storage-e2e')

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
          issueNumber: 1200,
          issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/1200',
        }),
      })
    },
  )

  await appPage.addInitScript(
    ({ seededSample, activeSequenceId }) => {
      if (sessionStorage.getItem('finish-storage-seeded')) return
      localStorage.setItem(
        'allflame-border-roll-research',
        JSON.stringify({
          version: 4,
          activeSequenceId,
          vesperUpgradeCount: 4,
          samples: [seededSample],
          archivedSequenceIds: [],
        }),
      )
      localStorage.setItem(
        'allflame-border-roll-submission',
        JSON.stringify({ version: 3, settings: { enabled: true }, queue: [] }),
      )
      sessionStorage.setItem('finish-storage-seeded', '1')
    },
    { seededSample: sample, activeSequenceId: sequenceId },
  )

  const openResearch = async () => {
    await expect(appPage.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
    const panel = appPage.locator('details.roll-research')
    await panel.locator('summary').click()
    await panel.getByLabel('Private submission key').fill('e2e-private-key')
    return panel
  }
  const storedResearch = () =>
    appPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      BORDER_RESEARCH_STORAGE_KEY,
    )
  const storedSubmission = () =>
    appPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      BORDER_SUBMISSION_STORAGE_KEY,
    )
  const prepareVoyage = async () => {
    await pasteText(appPage, ENGLISH_CHART)
    await appPage
      .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
      .click()
    await appPage
      .getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' })
      .click()
  }

  await openApp(appPage)
  const research = await openResearch()
  await prepareVoyage()
  await failAuxiliaryWrites(appPage, BORDER_SUBMISSION_STORAGE_KEY)
  await appPage.getByRole('button', { name: /Finish Voyage/ }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    'Border submission storage became unavailable',
  )
  await expect(
    appPage.getByText(
      /Finish Voyage canceled: submission queue storage needs recovery\. No charts were consumed and the border sequence was not advanced/,
    ),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: /Board cell 7, row 3, column 1, start: Armoured Coral Reef Chart of Ice; occupied/,
    }),
  ).toBeVisible()
  expect((await storedResearch()).activeSequenceId).toBe(sequenceId)
  expect((await storedSubmission()).queue).toEqual([])

  await restoreAuxiliaryWrites(appPage)
  await research
    .getByRole('alert', { name: 'Border submission queue needs recovery' })
    .getByRole('button', { name: 'Retry / migrate' })
    .click()
  await research.getByLabel('Private submission key').fill('e2e-private-key')
  await failAuxiliaryWrites(appPage, BORDER_RESEARCH_STORAGE_KEY)
  await appPage.getByRole('button', { name: /Finish Voyage/ }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    'Border research storage became unavailable',
  )
  await expect(
    appPage.getByText(
      /Finish Voyage canceled: the border sequence was queued, but research storage needs recovery\. No charts were consumed and the sequence was not advanced/,
    ),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  expect((await storedResearch()).activeSequenceId).toBe(sequenceId)
  expect((await storedSubmission()).queue).toHaveLength(1)
  await expect(research.getByText('1 Voyage sequence queued')).toBeVisible()

  await restoreAuxiliaryWrites(appPage)
  await research
    .getByRole('alert', { name: 'Border research needs recovery' })
    .getByRole('button', { name: 'Retry / migrate' })
    .click()
  await research.getByRole('button', { name: 'Submit queued Voyages' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    /Submitted Voyage .* as issue #1200/,
  )
  expect((await storedResearch()).activeSequenceId).not.toBe(sequenceId)
  expect((await storedResearch()).archivedSequenceIds).toEqual([sequenceId])
  expect((await storedSubmission()).queue).toEqual([])
})

test('reports partial delivery when either successful-submission bookkeeping write fails', async ({
  appPage,
}) => {
  const sequenceId = 'voyage-partial-delivery-e2e'
  const sample = borderResearchSample(sequenceId, 'roll-partial-delivery-e2e')
  let postCount = 0

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
      postCount += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': ORIGIN },
        body: JSON.stringify({
          status: 'created',
          issueNumber: 1100 + postCount,
          issueUrl: `https://github.com/Alkwer/one-more-map.github.io/issues/${1100 + postCount}`,
        }),
      })
    },
  )
  await appPage.addInitScript(
    ({ queuedSample, queuedSequenceId }) => {
      if (sessionStorage.getItem('partial-delivery-seeded')) return
      localStorage.setItem(
        'allflame-border-roll-research',
        JSON.stringify({
          version: 4,
          activeSequenceId: 'voyage-next-partial-e2e',
          vesperUpgradeCount: 4,
          samples: [queuedSample],
          archivedSequenceIds: [],
        }),
      )
      localStorage.setItem(
        'allflame-border-roll-submission',
        JSON.stringify({
          version: 3,
          settings: { enabled: true },
          queue: [
            {
              sequenceId: queuedSequenceId,
              dataset: {
                schema: 'allflame-border-roll-dataset/v2',
                exportedAt: '2026-08-08T12:01:00.000Z',
                sampleCount: 1,
                samples: [queuedSample],
              },
              delivery: {
                status: 'pending',
                attemptCount: 0,
                lastAttemptAt: null,
                lastError: null,
              },
            },
          ],
        }),
      )
      sessionStorage.setItem('partial-delivery-seeded', '1')
    },
    { queuedSample: sample, queuedSequenceId: sequenceId },
  )

  const openResearch = async () => {
    await expect(appPage.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
    const panel = appPage.locator('details.roll-research')
    await panel.locator('summary').click()
    await panel.getByLabel('Private submission key').fill('e2e-private-key')
    return panel
  }
  const storedResearch = () =>
    appPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      BORDER_RESEARCH_STORAGE_KEY,
    )
  const storedSubmission = () =>
    appPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      BORDER_SUBMISSION_STORAGE_KEY,
    )

  await openApp(appPage)
  const research = await openResearch()
  await failAuxiliaryWrites(appPage, BORDER_RESEARCH_STORAGE_KEY)
  await research.getByRole('button', { name: 'Submit queued Voyages' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    /Submitted Voyage .* as issue #1101, but border research storage became unavailable/,
  )
  expect((await storedResearch()).archivedSequenceIds).toEqual([])
  expect((await storedSubmission()).queue).toHaveLength(1)
  await expect(research.getByRole('button', { name: 'Submit queued Voyages' })).toBeDisabled()

  await restoreAuxiliaryWrites(appPage)
  await research
    .getByRole('alert', { name: 'Border research needs recovery' })
    .getByRole('button', { name: 'Retry / migrate' })
    .click()
  await failAuxiliaryWrites(appPage, BORDER_SUBMISSION_STORAGE_KEY)
  await research.getByRole('button', { name: 'Submit queued Voyages' }).click()
  await expect(research.locator('[role="status"].muted.pad')).toContainText(
    /Submitted Voyage .* as issue #1102 and archived it locally, but submission queue storage became unavailable/,
  )
  expect((await storedResearch()).archivedSequenceIds).toEqual([sequenceId])
  expect((await storedSubmission()).queue).toHaveLength(1)
})

test('scrubs a private key before exposing invalid legacy outbox recovery', async ({ appPage }) => {
  await appPage.addInitScript(() => {
    localStorage.setItem(
      'allflame-border-roll-submission',
      JSON.stringify({
        version: 1,
        settings: { enabled: true, submissionKey: 'legacy-active-secret' },
        queue: [{ sequenceId: 'broken', dataset: { samples: [] } }],
      }),
    )
    localStorage.setItem(
      'allflame-border-roll-submission-recovery-legacy',
      JSON.stringify({ settings: { submissionKey: 'legacy-backup-secret' } }),
    )
  })

  await openApp(appPage)
  const research = appPage.locator('details.roll-research')
  await research.locator('summary').click()

  await expect(
    research.getByRole('alert').filter({ hasText: 'A private key saved by an older version' }),
  ).toContainText('Revoke or rotate that key')
  await expect(
    research.getByRole('alert', { name: 'Border submission queue needs recovery' }),
  ).toBeVisible()
  const persistedSubmissionValues = await appPage.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('allflame-border-roll-submission'))
      .map((key) => localStorage.getItem(key) ?? ''),
  )
  expect(persistedSubmissionValues.join('\n')).not.toContain('legacy-active-secret')
  expect(persistedSubmissionValues.join('\n')).not.toContain('legacy-backup-secret')
  expect(persistedSubmissionValues.join('\n')).not.toContain('submissionKey')
})

test('archives a Voyage only after the automatic outbox receives a success response', async ({
  appPage,
}) => {
  const sequenceId = 'voyage-submitted-e2e'
  const authorizationHeaders: string[] = []
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
      authorizationHeaders.push(route.request().headers().authorization ?? '')
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
  await research.locator('summary').click()
  await expect(research.getByText('1 Voyage sequence queued')).toBeVisible()
  const submissionKey = research.getByLabel('Private submission key')
  await expect(submissionKey).toHaveValue('')
  await submissionKey.pressSequentially('e2e-private-key')
  expect(authorizationHeaders).toEqual([])
  await research.getByRole('button', { name: 'Submit queued Voyages' }).click()
  await expect.poll(() => authorizationHeaders).toEqual(['Bearer e2e-private-key'])
  await expect(
    research.getByText(/Contribute border-roll data \(0 active · 1 archived\)/),
  ).toBeVisible()
  await expect(research.getByText('0 Voyage sequences queued')).toBeVisible()
  await expect(research.getByText(/Submitted Voyage .* as issue #999/)).toBeVisible()
  await expect(
    research.getByText('All submitted Voyage sequences are archived locally.'),
  ).toBeVisible()

  const stored = await appPage.evaluate(() =>
    JSON.parse(localStorage.getItem('allflame-border-roll-research') ?? '{}'),
  )
  const submission = await appPage.evaluate(() =>
    localStorage.getItem('allflame-border-roll-submission'),
  )
  expect(stored.samples).toHaveLength(1)
  expect(stored.archivedSequenceIds).toEqual([sequenceId])
  expect(submission).not.toContain('submissionKey')
  expect(submission).not.toContain('e2e-private-key')
})

test('continues the automatic outbox after one Voyage fails', async ({ appPage }) => {
  const makeSample = (sequenceId: string, sampleId: string) => ({
    schema: 'allflame-border-roll/v2',
    sampleId,
    sequenceId,
    capturedAt: '2026-08-04T18:20:00.000Z',
    gamePatch: '3.29',
    vesperUpgradeCount: null,
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
  })
  const firstSample = makeSample('voyage-failing-e2e', 'roll-failing-e2e')
  const secondSample = makeSample('voyage-delivered-e2e', 'roll-delivered-e2e')
  const postedSequences: string[] = []

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
      const dataset = route.request().postDataJSON() as { samples: Array<{ sequenceId: string }> }
      const sequenceId = dataset.samples[0].sequenceId
      postedSequences.push(sequenceId)
      if (sequenceId === firstSample.sequenceId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': ORIGIN },
          body: '{}',
        })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': ORIGIN },
        body: JSON.stringify({
          status: 'created',
          issueNumber: 1000,
          issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/1000',
        }),
      })
    },
  )
  await appPage.addInitScript(
    ({ first, second }) => {
      localStorage.setItem(
        'allflame-border-roll-research',
        JSON.stringify({
          version: 4,
          activeSequenceId: 'voyage-next-e2e',
          vesperUpgradeCount: null,
          samples: [first, second],
          archivedSequenceIds: [],
        }),
      )
      const queued = (sample: typeof first) => ({
        sequenceId: sample.sequenceId,
        dataset: {
          schema: 'allflame-border-roll-dataset/v2',
          exportedAt: '2026-08-04T18:21:00.000Z',
          sampleCount: 1,
          samples: [sample],
        },
        delivery: {
          status: 'pending',
          attemptCount: 0,
          lastAttemptAt: null,
          lastError: null,
        },
      })
      localStorage.setItem(
        'allflame-border-roll-submission',
        JSON.stringify({
          version: 3,
          settings: { enabled: true },
          queue: [queued(first), queued(second)],
        }),
      )
    },
    { first: firstSample, second: secondSample },
  )

  await openApp(appPage)
  const research = appPage.locator('details.roll-research')
  await research.locator('summary').click()
  await expect(research.getByText('2 Voyage sequences queued')).toBeVisible()
  await research.getByLabel('Private submission key').fill('e2e-private-key')
  await research.getByRole('button', { name: 'Submit queued Voyages' }).click()

  await expect
    .poll(() => postedSequences)
    .toEqual([firstSample.sequenceId, secondSample.sequenceId])
  await expect(research.getByText('1 Voyage sequence queued · 1 needs retry')).toBeVisible()
  await expect(research.getByText('Submission failed')).toBeVisible()
  await expect(research.getByRole('button', { name: 'Retry submission' })).toBeVisible()
  await expect(research.getByText(/Submitted Voyage .* as issue #1000/)).toBeVisible()

  await research.getByRole('button', { name: 'Cancel queued submission' }).click()
  await expect(research.getByText('0 Voyage sequences queued')).toBeVisible()
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
  context,
}) => {
  await context.grantPermissions(['clipboard-write'], { origin: ORIGIN })
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

test('makes preserve confirmation atomic across background controls and state replacement', async ({
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
    .getByRole('button', { name: /Select .* for placement/ })
    .nth(1)
    .click()
  await appPage.getByRole('button', { name: 'Board cell 8, row 3, column 2: empty' }).click()
  const preserveButton = appPage.getByRole('button', {
    name: /Preserve Armoured Coral Reef Chart of Ice in row 3, column 1/,
  })
  await preserveButton.focus()
  await appPage.keyboard.press('Space')

  await appPage.getByRole('button', { name: /Finish Voyage/ }).click()
  const dialog = appPage.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Preserved chart 1 of 1/)).toBeFocused()
  await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
  expect(
    await appPage
      .locator('.board-wrap, .library-col, .solver-col, .import-panel')
      .evaluateAll((surfaces) =>
        surfaces.every((surface) => (surface.closest('main') as HTMLElement | null)?.inert),
      ),
  ).toBe(true)

  const replacement = defaultState()
  replacement.pool = [
    {
      uid: 'replacement-chart',
      name: 'Replacement Chart',
      level: 83,
      edges: [true, true, true, true],
      modIds: [],
      shape: 'Crossing',
      shapeResolved: true,
    },
  ]
  replacement.board[0] = { chartUid: 'replacement-chart', rotation: 0 }
  await appPage.locator('input[type="file"]').setInputFiles({
    name: 'replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeState(replacement)),
  })
  await expect(appPage.getByText('State loaded from JSON', { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: /Kept it/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect(appPage.locator('main')).toHaveJSProperty('inert', false)
  await expect(
    appPage.getByText(
      'Finish Voyage canceled: the board changed after confirmation started. No charts were consumed.',
    ),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: /Board cell 1, row 1, column 1: Replacement Chart; occupied/,
    }),
  ).toBeVisible()
})

test('keeps a copy snapshot safe across swaps, board clears, and chart removal', async ({
  appPage,
  context,
}) => {
  await context.grantPermissions(['clipboard-write'], { origin: ORIGIN })
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

  await appPage.getByRole('button', { name: /Copy into game/ }).click()
  const copyPrompt = appPage.locator('.copyseq')
  await expect(copyPrompt.getByText('Armoured Coral Reef Chart of Ice')).toBeVisible()

  await appPage
    .getByRole('button', { name: /Board cell 7.*Armoured Coral Reef Chart of Ice/ })
    .click()
  await appPage.getByRole('button', { name: /Board cell 8.*해병 고역 산호 암초 해도/ }).click()
  await expect(copyPrompt.getByText('Armoured Coral Reef Chart of Ice')).toBeVisible()
  await expect(
    appPage.getByRole('button', { name: /Board cell 8.*Armoured Coral Reef Chart of Ice/ }),
  ).toBeVisible()

  await appPage
    .getByRole('button', { name: /Remove Armoured Coral Reef Chart of Ice from row 3, column 2/ })
    .click({ force: true })
  await appPage
    .getByRole('button', { name: /Remove 해병 고역 산호 암초 해도 from row 3, column 1/ })
    .click({ force: true })
  await expect(copyPrompt.getByText(/The board changed/)).toBeVisible()
  await copyPrompt.getByRole('button', { name: /Copy & next/ }).click()
  await expect(copyPrompt.getByText('해병 고역 산호 암초 해도')).toBeVisible()
  await copyPrompt.getByRole('button', { name: /Copy last & finish/ }).click()
  await expect(copyPrompt).toHaveCount(0)

  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()
  await appPage.getByRole('button', { name: /Copy into game/ }).click()
  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .hover()
  await appPage.getByRole('button', { name: 'Delete Armoured Coral Reef Chart of Ice' }).click()

  await expect(copyPrompt).toHaveCount(0)
  await expect(
    appPage.getByText(/Copy sequence stopped: a chart from the original sequence/),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')

  await appPage
    .getByRole('button', { name: 'Select 해병 고역 산호 암초 해도 for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()
  await appPage.getByRole('button', { name: /Copy into game/ }).click()
  appPage.once('dialog', (dialog) => dialog.accept())
  await appPage.getByRole('button', { name: 'Clear all' }).click()

  await expect(copyPrompt).toHaveCount(0)
  await expect(libraryHeading(appPage)).toContainText('(0)')
  await expect(
    appPage.getByText(/Copy sequence stopped: a chart from the original sequence/),
  ).toBeVisible()
})

test('follows the tutorial from solving through result selection to copying', async ({
  appPage,
}) => {
  await openApp(appPage)
  await pasteText(appPage, makeCrossingChartBatch(9))
  await expect(libraryHeading(appPage)).toContainText('(9)')

  await appPage.getByRole('button', { name: /TUTORIAL/ }).click()
  const tutorial = appPage.locator('.tutorial')
  for (let step = 0; step < 5; step += 1) {
    await tutorial.getByRole('button', { name: /Next/ }).click()
  }
  await expect(tutorial).toContainText('Nothing is applied automatically.')
  await expect(appPage.locator('.tut-ring')).toBeVisible()
  await tutorial.getByRole('button', { name: 'Close tutorial' }).click()

  const boardCells = appPage.locator('.tile-select')
  const occupiedCellCount = () =>
    boardCells.evaluateAll(
      (cells) => cells.filter((cell) => cell.getAttribute('data-chart-name')).length,
    )

  const solveButton = appPage.getByRole('button', { name: 'Solve (9 charts)' })
  await solveButton.click()
  const firstResult = appPage.locator('.results .result').first()
  await expect(firstResult).toBeVisible({ timeout: 20_000 })
  await expect.poll(occupiedCellCount).toBe(0)

  await firstResult.click()
  await expect.poll(occupiedCellCount).toBe(9)

  await appPage.getByRole('button', { name: /Copy into game/ }).click()
  await expect(appPage.getByText(/Step 1 of 9/)).toBeVisible()
  const snapshottedName = await appPage.locator('.copyseq .pc-name').textContent()
  await solveButton.click()
  await expect(firstResult).toBeVisible({ timeout: 20_000 })
  await firstResult.click()
  await expect(appPage.locator('.copyseq .pc-name')).toHaveText(snapshottedName!)
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

test('round-trips JSON and isolates minimal shared layouts from saved state', async ({
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

  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()
  await expect(
    appPage.getByRole('button', {
      name: /Board cell 7, row 3, column 1, start: Armoured Coral Reef Chart of Ice; occupied/,
    }),
  ).toBeVisible()
  await appPage.waitForTimeout(400)
  const savedState = await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))
  expect(savedState).not.toBeNull()

  const shareButton = appPage.getByRole('button', { name: 'Share layout' })
  await shareButton.click()
  await expect(shareButton).toContainText('Link copied!')
  const shareUrl = await appPage.evaluate(() => navigator.clipboard.readText())
  expect(shareUrl).toContain(`${ORIGIN}${APP_PATH}#layout.v1.`)

  await appPage.goto(shareUrl)
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
  ).toBeVisible()
  await appPage.waitForTimeout(400)
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(
    savedState,
  )

  await appPage.goBack()
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toHaveCount(0)
  await expect(appPage).not.toHaveURL(/#/)

  await appPage.goForward()
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toBeVisible()

  await appPage.goto(`${ORIGIN}${APP_PATH}#layout.v1.not*base64`)
  await expect(
    appPage.getByRole('alert').filter({ hasText: 'This shared layout could not be opened' }),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(0)')
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(
    savedState,
  )

  await appPage.getByRole('button', { name: 'Open my saved state' }).click()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(appPage).not.toHaveURL(/#/)
})

test('requires an explicit adopt, merge, or discard decision for shared layouts', async ({
  appPage,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN })
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)
  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()
  await appPage.waitForTimeout(400)

  const shareButton = appPage.getByRole('button', { name: 'Share layout' })
  await shareButton.click()
  await expect(shareButton).toContainText('Link copied!')
  const shareUrl = await appPage.evaluate(() => navigator.clipboard.readText())
  expect(shareUrl).toContain(`${ORIGIN}${APP_PATH}#layout.v1.`)
  const recipientSavedState = await appPage.evaluate(() => {
    const key = 'allflame-voyage-solver'
    const state = JSON.parse(localStorage.getItem(key)!)
    state.pool = state.pool.map((chart: { uid: string; name: string }) => ({
      ...chart,
      uid: 'recipient-only-chart',
      name: 'Recipient Only Chart',
    }))
    state.board = Array(9).fill(null)
    const raw = JSON.stringify(state)
    localStorage.setItem(key, raw)
    return raw
  })

  await appPage.goto(shareUrl)
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toBeVisible()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
  ).toBeVisible()
  await expect(
    appPage.getByRole('button', { name: 'Select Recipient Only Chart for placement' }),
  ).toHaveCount(0)
  await appPage.waitForTimeout(400)
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(
    recipientSavedState,
  )

  await appPage.getByRole('button', { name: 'Discard shared layout' }).click()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', { name: 'Select Recipient Only Chart for placement' }),
  ).toBeVisible()
  await expect(appPage).not.toHaveURL(/#/)

  await appPage.goto(shareUrl)
  await appPage.getByRole('button', { name: 'Merge with my library' }).click()
  await expect(libraryHeading(appPage)).toContainText('(2)')
  await expect(
    appPage.getByRole('button', { name: 'Select Recipient Only Chart for placement' }),
  ).toBeVisible()
  await expect(
    appPage.getByRole('button', {
      name: 'Select Armoured Coral Reef Chart of Ice for placement',
    }),
  ).toBeVisible()
  await expect(appPage).not.toHaveURL(/#/)
  await appPage.waitForTimeout(400)
  expect(
    await appPage.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('allflame-voyage-solver')!)
      return saved.pool.map((chart: { name: string }) => chart.name)
    }),
  ).toEqual(['Recipient Only Chart', 'Armoured Coral Reef Chart of Ice'])

  await appPage.evaluate((raw) => {
    localStorage.setItem('allflame-voyage-solver', raw)
  }, recipientSavedState)
  await appPage.goto(shareUrl)
  await appPage.getByRole('button', { name: 'Replace my saved state' }).click()
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expect(
    appPage.getByRole('button', { name: 'Select Recipient Only Chart for placement' }),
  ).toHaveCount(0)
  await expect(appPage).not.toHaveURL(/#/)
  await appPage.waitForTimeout(400)
  expect(
    await appPage.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('allflame-voyage-solver')!)
      return saved.pool.map((chart: { name: string }) => chart.name)
    }),
  ).toEqual(['Armoured Coral Reef Chart of Ice'])
})

test('pauses autosave and preserves a newer saved state until explicit reset', async ({
  appPage,
}) => {
  const raw = JSON.stringify({ v: 999, pool: [{ valuable: 'future chart data' }] })
  await appPage.addInitScript((payload) => {
    if (sessionStorage.getItem('recovery-test-seeded')) return
    localStorage.setItem('allflame-voyage-solver', payload)
    sessionStorage.setItem('recovery-test-seeded', '1')
  }, raw)
  await openApp(appPage)
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(raw)

  const recovery = appPage.getByRole('alertdialog', { name: 'Saved state needs recovery' })
  await expect(recovery).toBeVisible()
  await expect(recovery.locator('[data-dialog-initial-focus]')).toBeFocused()
  await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
  await expectNoAccessibilityViolations(appPage)
  await expect(recovery.getByRole('button', { name: 'Export original JSON' })).toBeVisible()
  await expect(recovery.getByRole('button', { name: 'Retry decode' })).toBeVisible()
  await expect(recovery.getByRole('button', { name: 'Reset saved state…' })).toBeVisible()

  const recoveryFocusable = recovery.locator(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )
  await appPage.keyboard.press('Shift+Tab')
  await expect(recoveryFocusable.last()).toBeFocused()
  await appPage.keyboard.press('Tab')
  await expect(recoveryFocusable.first()).toBeFocused()
  await appPage.keyboard.press('Escape')
  await expect(recovery).toBeVisible()
  await expect(appPage.locator('main')).toHaveJSProperty('inert', true)

  await appPage.waitForTimeout(500)
  const preserved = await appPage.evaluate(() => {
    const active = localStorage.getItem('allflame-voyage-solver')
    const backups = Object.keys(localStorage)
      .filter((key) => key.startsWith('allflame-voyage-solver-recovery-'))
      .map((key) => localStorage.getItem(key))
    return { active, backups }
  })
  expect(preserved.active).toBe(raw)
  expect(preserved.backups).toContain(raw)

  appPage.once('dialog', (dialog) => dialog.accept())
  await recovery.getByRole('button', { name: 'Reset saved state…' }).click()
  await expect(recovery).toHaveCount(0)
  await expect(appPage.locator('main')).toHaveJSProperty('inert', false)
  await expect(appPage.getByRole('button', { name: /TUTORIAL/ })).toBeFocused()
  const reset = await appPage.evaluate(() => ({
    active: JSON.parse(localStorage.getItem('allflame-voyage-solver')!),
    backups: Object.keys(localStorage)
      .filter((key) => key.startsWith('allflame-voyage-solver-recovery-'))
      .map((key) => localStorage.getItem(key)),
  }))
  expect(reset.active.v).toBe(3)
  expect(reset.backups).toContain(raw)
})

test('keeps recovery active when a migrated state cannot be persisted', async ({ appPage }) => {
  const raw = JSON.stringify({ v: 2 })
  await appPage.addInitScript((payload) => {
    localStorage.setItem('allflame-voyage-solver', payload)
  }, raw)
  await openApp(appPage)

  const recovery = appPage.getByRole('alertdialog', { name: 'Saved state needs recovery' })
  await expect(recovery).toBeVisible()
  await failAuxiliaryWrites(appPage, 'allflame-voyage-solver')
  await recovery.getByRole('button', { name: 'Migrate recovered state' }).click()

  await expect(recovery).toBeVisible()
  await expect(recovery.getByRole('alert')).toContainText('Migration was not committed')
  await expect(recovery.getByRole('alert')).toContainText('Browser storage is full')
  await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(raw)
})

test('keeps recovery active when reset cannot be persisted', async ({ appPage }) => {
  const raw = JSON.stringify({ v: 999, pool: [{ valuable: 'future chart data' }] })
  await appPage.addInitScript((payload) => {
    localStorage.setItem('allflame-voyage-solver', payload)
  }, raw)
  await openApp(appPage)

  const recovery = appPage.getByRole('alertdialog', { name: 'Saved state needs recovery' })
  await expect(recovery).toBeVisible()
  await failAuxiliaryWrites(appPage, 'allflame-voyage-solver')
  appPage.once('dialog', (dialog) => dialog.accept())
  await recovery.getByRole('button', { name: /Reset saved state/ }).click()

  await expect(recovery).toBeVisible()
  await expect(recovery.getByRole('alert')).toContainText('Reset was not committed')
  await expect(recovery.getByRole('alert')).toContainText('Browser storage is full')
  await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
  expect(await appPage.evaluate(() => localStorage.getItem('allflame-voyage-solver'))).toBe(raw)
})
