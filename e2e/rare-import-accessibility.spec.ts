import { ENGLISH_CHART, expect, openApp, pasteText, test } from './support'

test('rare imports update one persistent live region once per import and have a named dismissal', async ({
  appPage,
}) => {
  await openApp(appPage)
  const importPanel = appPage.getByRole('region', { name: 'Import', exact: true })
  const rareStatus = importPanel.locator('span[role="status"]')
  await expect(rareStatus).toHaveCount(1)
  await expect(rareStatus).toBeEmpty()
  await expect(rareStatus).toHaveAttribute('aria-live', 'polite')
  await expect(rareStatus).toHaveAttribute('aria-atomic', 'true')

  await rareStatus.evaluate((status) => {
    const announcements: string[] = []
    ;(window as typeof window & { rareAnnouncements: string[] }).rareAnnouncements = announcements
    new MutationObserver(() => {
      const text = status.textContent?.trim()
      if (text) announcements.push(text)
    }).observe(status, { childList: true, subtree: true, characterData: true })
  })
  const rareChart = ENGLISH_CHART.replace(
    "20% increased Dead Man's Sulphur found in this Area",
    '30% increased number of Rare Monsters',
  )
  await pasteText(appPage, rareChart)
  await expect(rareStatus).toContainText('1 Rare Monsters chart imported')
  await expect(importPanel.getByRole('status').filter({ hasText: 'Rare Monsters' })).toHaveCount(1)
  const message = (await rareStatus.textContent())!.trim()
  const announcements = () =>
    appPage.evaluate(
      () => (window as typeof window & { rareAnnouncements: string[] }).rareAnnouncements,
    )
  await expect.poll(announcements).toEqual([message])

  // An ordinary re-render must not announce the protection message again.
  await importPanel.getByRole('textbox').fill('draft')
  expect(await announcements()).toEqual([message])

  // Equal-sized subsequent batches still get exactly one fresh announcement.
  await pasteText(
    appPage,
    rareChart.replace('Armoured Coral Reef Chart of Ice', 'Second rare chart'),
  )
  await expect.poll(announcements).toEqual([message, message])
  const dismiss = importPanel.getByRole('button', {
    name: 'Dismiss rare-chart import alert',
    exact: true,
  })
  await expect(dismiss).toHaveCount(1)
  await dismiss.click()
  await expect(rareStatus).toBeEmpty()
  await expect(dismiss).toHaveCount(0)
  expect(await announcements()).toEqual([message, message])
})
