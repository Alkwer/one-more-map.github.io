import { ALL_GOOD_MODS_REGEX } from '../src/data/strategies'
import { APP_PATH, ENGLISH_CHART, expect, openApp, pasteText, test } from './support'

test('loads closed import help only on demand and preserves native disclosure state', async ({
  appPage,
  request,
}) => {
  const helpRequests: string[] = []
  appPage.on('request', (request) => {
    if (
      /\/(RollingChartHelp|WindowsImportHelp|ImporterUpdateNoticeBody)-[^/]+\.js$/.test(
        request.url(),
      )
    ) {
      helpRequests.push(request.url())
    }
  })
  let releaseWindowsHelp = () => {}
  const windowsHelpGate = new Promise<void>((resolve) => {
    releaseWindowsHelp = resolve
  })
  await appPage.route('**/assets/WindowsImportHelp-*.js', async (route) => {
    await windowsHelpGate
    await route.continue()
  })

  try {
    await openApp(appPage)
    await pasteText(appPage, ENGLISH_CHART)
    await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveCount(1)
    expect(helpRequests).toEqual([])

    const rollingSummary = appPage
      .locator('summary')
      .filter({ hasText: /Rolling & keeping charts/ })
    await rollingSummary.focus()
    await appPage.keyboard.press('Enter')
    const keeperRegex = appPage.getByRole('textbox', { name: 'All good modifiers keeper regex' })
    await expect(keeperRegex).toHaveValue(ALL_GOOD_MODS_REGEX)
    await keeperRegex.focus()
    expect(
      await keeperRegex.evaluate((element) => {
        const input = element as HTMLInputElement
        return input.selectionStart === 0 && input.selectionEnd === input.value.length
      }),
    ).toBe(true)
    await expect(
      appPage.getByRole('textbox', { name: '120 percent or greater quantity regex' }),
    ).toHaveValue('"m q.*(1[2-9].|[2-9]..)%"')
    await expect(
      appPage.getByRole('textbox', { name: '75 percent or greater sulphur regex' }),
    ).toHaveValue('"sul.*(7[5-9]|[89].|\\d..)%"')
    expect(helpRequests.filter((url) => url.includes('/RollingChartHelp-'))).toHaveLength(1)
    expect(helpRequests.some((url) => url.includes('/WindowsImportHelp-'))).toBe(false)

    const windowsSummary = appPage
      .locator('summary')
      .filter({ hasText: /Bulk-import.*Windows OCR/ })
    await windowsSummary.click()
    const windowsDetails = windowsSummary.locator('..')
    await expect(windowsDetails.getByRole('status')).toHaveText('Loading help…')
    await appPage.locator('#chart-import-text').fill('unfinished import text')
    await appPage.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ko')
    await expect(windowsDetails.getByRole('status')).toHaveText('도움말 불러오는 중…')
    releaseWindowsHelp()

    const download = windowsDetails.locator('a.ahk-dl')
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('download', '')
    const downloadUrl = new URL((await download.getAttribute('href'))!, appPage.url())
    expect(downloadUrl.pathname).toBe(`${APP_PATH}voyage-import.ahk`)
    expect((await request.get(downloadUrl.toString())).ok()).toBe(true)
    await expect(appPage.locator('#chart-import-text')).toHaveValue('unfinished import text')
    await expect(windowsDetails).toContainText(
      'OCR stays on your PC and no screenshots are uploaded.',
    )
    await expect(windowsDetails.locator('kbd').filter({ hasText: /^Ctrl\+F7$/ })).toBeVisible()
    await expect(windowsDetails.locator('kbd').filter({ hasText: /^Shift\+F8$/ })).toBeVisible()

    const faq = windowsDetails.locator('details.ahk-faq')
    await faq.locator('summary').click()
    await expect(faq).toHaveJSProperty('open', true)
    await windowsSummary.click()
    await expect(windowsDetails).toHaveJSProperty('open', false)
    await windowsSummary.focus()
    await appPage.keyboard.press('Enter')
    await expect(windowsDetails).toHaveJSProperty('open', true)
    await expect(windowsSummary).toBeFocused()
    await expect(faq).toHaveJSProperty('open', true)
    expect(helpRequests.filter((url) => url.includes('/WindowsImportHelp-'))).toHaveLength(1)
    await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveCount(1)
  } finally {
    releaseWindowsHelp()
  }
})

test.describe('deferred importer update notice', () => {
  test.use({ ahkNoticeSeen: false })

  test('keeps the modal shell focused and dismissible while the body loads', async ({
    appPage,
  }) => {
    let releaseBody = () => {}
    const bodyGate = new Promise<void>((resolve) => {
      releaseBody = resolve
    })
    await appPage.route('**/assets/ImporterUpdateNoticeBody-*.js', async (route) => {
      await bodyGate
      await route.continue()
    })
    try {
      await openApp(appPage)
      const notice = appPage.getByRole('dialog', { name: /Importer updated/ })
      await expect(notice.locator('[data-dialog-initial-focus]')).toBeFocused()
      await expect(notice.getByRole('status')).toHaveText('Loading help…')
      await expect(appPage.locator('main')).toHaveJSProperty('inert', true)
      await notice.getByRole('button', { name: 'Close importer update' }).click()
      await expect(notice).toHaveCount(0)
      await expect(appPage.locator('main')).toHaveJSProperty('inert', false)
      await expect(appPage.getByRole('button', { name: /TUTORIAL/ })).toBeFocused()
      expect(await appPage.evaluate(() => localStorage.getItem('announce-ahk-altscan'))).toBe('1')
      const bodyResponse = appPage.waitForResponse(/\/ImporterUpdateNoticeBody-[^/]+\.js$/)
      releaseBody()
      await bodyResponse
      await expect(notice).toHaveCount(0)
      await pasteText(appPage, ENGLISH_CHART)
      await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveCount(1)
    } finally {
      releaseBody()
    }
  })
})

// Use the raw page fixture because this test deliberately causes a failed local
// asset request; the regular appPage fixture correctly rejects such failures.
test('a failed optional help download does not disable chart importing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen', '1')
    localStorage.setItem('announce-ahk-altscan', '1')
  })
  await page.route('**/assets/WindowsImportHelp-*.js', (route) => route.abort('failed'))
  await openApp(page)
  const summary = page.locator('summary').filter({ hasText: /Bulk-import.*Windows OCR/ })
  await summary.click()
  await expect(summary.locator('..').getByRole('alert')).toContainText('Importing still works.')
  await pasteText(page, ENGLISH_CHART)
  await expect(page.locator('.library [data-library-chart-uid]')).toHaveCount(1)
  await expect(page.locator('.import-panel [role="status"]').first()).toContainText(
    'Imported 1 chart',
  )
})
