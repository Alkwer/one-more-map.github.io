import {
  APP_PATH,
  ENGLISH_CHART,
  ORIGIN,
  expect,
  makeCrossingChartBatch,
  openApp,
  pasteText,
  test,
} from './support'

const libraryHeading = (page: Parameters<typeof openApp>[0]) =>
  page.getByRole('heading', { level: 2, name: /Chart Library/ })

const occupiedCellCount = (page: Parameters<typeof openApp>[0]) =>
  page
    .locator('.tile-select')
    .evaluateAll((cells) => cells.filter((cell) => cell.getAttribute('data-chart-name')).length)

const expectNoHorizontalOverflow = async (page: Parameters<typeof openApp>[0]) => {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0)
}

test('@mobile renders the first screen and imports without horizontal overflow', async ({
  appPage,
}) => {
  await openApp(appPage)
  await expect(appPage.getByRole('main')).toBeVisible()
  await expect(libraryHeading(appPage)).toBeVisible()
  await expect(appPage.getByRole('heading', { level: 2, name: 'Import' })).toBeVisible()
  expect(await appPage.evaluate(() => [innerWidth, innerHeight])).toEqual([390, 844])
  await expectNoHorizontalOverflow(appPage)

  await pasteText(appPage, ENGLISH_CHART)
  await expect(libraryHeading(appPage)).toContainText('(1)')
  await expectNoHorizontalOverflow(appPage)
})

test('@webkit loads, imports, solves in a worker, and restores storage', async ({ appPage }) => {
  const workerUrls: string[] = []
  appPage.on('worker', (worker) => workerUrls.push(worker.url()))

  await openApp(appPage)
  await pasteText(appPage, makeCrossingChartBatch(9))
  await expect(libraryHeading(appPage)).toContainText('(9)')

  await appPage.getByRole('button', { name: 'Solve (9 charts)' }).click()
  const firstResult = appPage.locator('.results .result').first()
  await expect(firstResult).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => workerUrls.some((url) => /\/assets\/solver\.worker-[^/]+\.js$/.test(url)))
    .toBe(true)
  await firstResult.click()
  await expect.poll(() => occupiedCellCount(appPage)).toBe(9)

  await expect
    .poll(() =>
      appPage.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('allflame-voyage-solver') ?? '{}')
        return [stored.pool?.length ?? 0, stored.board?.filter(Boolean).length ?? 0]
      }),
    )
    .toEqual([9, 9])

  await appPage.reload()
  await expect(libraryHeading(appPage)).toContainText('(9)')
  await expect.poll(() => occupiedCellCount(appPage)).toBe(9)
})

test('@webkit exports a download and opens a shared layout', async ({ appPage }) => {
  await appPage.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('clipboard denied for smoke test', 'NotAllowedError')
        },
      },
    })
  })
  await openApp(appPage)
  await pasteText(appPage, ENGLISH_CHART)
  await appPage
    .getByRole('button', { name: 'Select Armoured Coral Reef Chart of Ice for placement' })
    .click()
  await appPage.getByRole('button', { name: 'Board cell 7, row 3, column 1, start: empty' }).click()

  const downloadPromise = appPage.waitForEvent('download')
  await appPage.getByRole('button', { name: 'Export' }).click()
  const download = await downloadPromise
  expect(await download.path()).not.toBeNull()

  const shareButton = appPage.getByRole('button', { name: 'Share layout' })
  await shareButton.click()
  await expect(shareButton).toContainText('Link set in address bar')
  const shareUrl = appPage.url()
  expect(shareUrl).toContain(`${ORIGIN}${APP_PATH}#layout.v1.`)

  await appPage.reload()
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toBeVisible()
  await expect.poll(() => occupiedCellCount(appPage)).toBe(1)
})
