import { APP_PATH, APP_URL, ORIGIN, expect, test } from './support'

test('serves the Pages redirect and production assets from the subpath', async ({
  appPage,
  request,
}) => {
  const loadedUrls: string[] = []
  appPage.on('response', (response) => {
    if (response.url().startsWith(ORIGIN)) loadedUrls.push(response.url())
  })

  const rootResponse = await appPage.goto('/')
  expect(rootResponse?.status()).toBe(200)
  await appPage.waitForURL(APP_URL)
  await expect(appPage.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
  await appPage.evaluate(async () => {
    await document.fonts.ready
  })

  const requiredAssets = [
    /\/assets\/index-[^/]+\.js$/,
    /\/assets\/index-[^/]+\.css$/,
    /\/font\/fontin-regular-webfont\.woff$/,
    /\/bg\.webp$/,
    /\/panel-frame\.webp$/,
  ]
  for (const asset of requiredAssets) {
    await expect
      .poll(() =>
        loadedUrls.some((url) => {
          const path = new URL(url).pathname
          return path.startsWith(APP_PATH) && asset.test(path)
        }),
      )
      .toBe(true)
  }

  const downloadHref = await appPage.locator('a.ahk-dl').getAttribute('href')
  expect(downloadHref).not.toBeNull()
  const downloadUrl = new URL(downloadHref!, appPage.url())
  expect(downloadUrl.pathname).toBe(`${APP_PATH}voyage-import.ahk`)
  const downloadResponse = await request.get(downloadUrl.toString())
  expect(downloadResponse.ok()).toBe(true)
})
