import { expect, makeCrossingChartBatch, pasteText, test } from './support'

const occupiedCellCount = (page: Parameters<typeof pasteText>[0]) =>
  page
    .locator('.tile-select')
    .evaluateAll((cells) => cells.filter((cell) => cell.getAttribute('data-chart-name')).length)

test('covers the focused deployment flow below a project-site prefix', async ({
  appPage,
  request,
}, testInfo) => {
  const configuredBaseUrl = testInfo.project.use.baseURL
  if (typeof configuredBaseUrl !== 'string') throw new Error('Project baseURL is required')

  const appUrl = new URL(configuredBaseUrl)
  const appPath = appUrl.pathname
  const projectRootUrl = new URL('../', appUrl)
  expect(projectRootUrl.pathname).not.toBe('/')
  expect(appPath).toBe(`${projectRootUrl.pathname}allflame-voyage-solver/`)
  const loadedUrls: string[] = []
  const workerUrls: string[] = []

  appPage.on('response', (response) => {
    if (response.url().startsWith(appUrl.origin)) loadedUrls.push(response.url())
  })
  appPage.on('worker', (worker) => workerUrls.push(worker.url()))
  await appPage.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('clipboard denied for deployment test', 'NotAllowedError')
        },
      },
    })
  })

  const canonicalUrl = `https://alkwer.github.io${appPath}`
  const redirectResponse = await request.get(projectRootUrl.toString())
  expect(redirectResponse.status()).toBe(200)
  expect(await redirectResponse.text()).toContain(`<link rel="canonical" href="${canonicalUrl}" />`)
  const rootResponse = await appPage.goto(projectRootUrl.toString())
  expect(rootResponse?.status()).toBe(200)
  await appPage.waitForURL(appUrl.toString())
  await expect(appPage.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
  await expect(appPage.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl)
  await appPage.evaluate(async () => {
    await document.fonts.ready
  })

  const requiredAssets = [/\/assets\/index-[^/]+\.js$/, /\/assets\/index-[^/]+\.css$/]
  for (const asset of requiredAssets) {
    await expect
      .poll(() =>
        loadedUrls.some((url) => {
          const path = new URL(url).pathname
          return path.startsWith(appPath) && asset.test(path)
        }),
      )
      .toBe(true)
  }

  const downloadHref = await appPage.locator('a.ahk-dl').getAttribute('href')
  expect(downloadHref).not.toBeNull()
  const downloadUrl = new URL(downloadHref!, appPage.url())
  expect(downloadUrl.pathname).toBe(`${appPath}voyage-import.ahk`)
  expect((await request.get(downloadUrl.toString())).ok()).toBe(true)

  const themeResponse = await appPage.goto(new URL('harvest.html', appUrl).toString())
  expect(themeResponse?.status()).toBe(200)
  await appPage.waitForURL(appUrl.toString())
  await expect(appPage.locator('body')).toHaveClass(/theme-harvest/)
  expect(await appPage.evaluate(() => localStorage.getItem('theme'))).toBe('harvest')

  await pasteText(appPage, makeCrossingChartBatch(9))
  await appPage.getByRole('button', { name: 'Solve (9 charts)' }).click()
  const firstResult = appPage.locator('.results .result').first()
  await expect(firstResult).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() =>
      workerUrls.some((url) => {
        const path = new URL(url).pathname
        return path.startsWith(`${appPath}assets/`) && /solver\.worker-[^/]+\.js$/.test(path)
      }),
    )
    .toBe(true)
  await firstResult.click()
  await expect.poll(() => occupiedCellCount(appPage)).toBe(9)

  const shareButton = appPage.getByRole('button', { name: 'Share layout' })
  await shareButton.click()
  await expect(shareButton).toContainText('Link set in address bar')
  expect(appPage.url()).toContain(`${appUrl.toString()}#layout.v1.`)

  await appPage.reload()
  await expect(
    appPage.getByText('Viewing a shared layout. Your saved state has not been changed.'),
  ).toBeVisible()
  await expect.poll(() => occupiedCellCount(appPage)).toBe(9)
})
