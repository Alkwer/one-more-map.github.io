import { expect, makeCrossingChartBatch, openApp, pasteText, test } from './support'

test('preserves manual solve results when an inactive strategy layout changes', async ({
  appPage,
}) => {
  await openApp(appPage)
  await pasteText(appPage, makeCrossingChartBatch(9))
  await appPage.getByRole('button', { name: 'Solve (9 charts)' }).click()
  const results = appPage.locator('.results .result')
  await expect(results.first()).toBeVisible({ timeout: 20_000 })
  const before = await results.allTextContents()
  await appPage.locator('.strat-head').filter({ hasText: 'Alc & Go' }).click()
  await appPage.locator('#strategy-layout-alc-and-go').selectOption('snake')
  await expect(results).toHaveText(before)
})

test('preserves filler results when the active strategy layout changes', async ({ appPage }) => {
  await openApp(appPage)
  await pasteText(appPage, makeCrossingChartBatch(18))
  const strategy = appPage
    .locator('.strat-card')
    .filter({ has: appPage.locator('.strat-head').filter({ hasText: 'Alc & Go' }) })
  await strategy.locator('.strat-use').click()
  await appPage.getByRole('button', { name: /Filler voyage/ }).click()
  const results = appPage.locator('.results .result')
  await expect(results.first()).toBeVisible({ timeout: 20_000 })
  const before = await results.allTextContents()
  await appPage.locator('#strategy-layout-alc-and-go').selectOption('snake')
  await expect(results).toHaveText(before)
})
