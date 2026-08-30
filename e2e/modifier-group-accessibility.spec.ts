import { expect, openApp, test } from './support'

test('modifier bulk actions name their group and update with the checkbox state', async ({
  appPage,
}) => {
  await openApp(appPage)
  await appPage.getByRole('button', { name: 'Mods', exact: true }).click()
  const dialog = appPage.getByRole('dialog', { name: 'Chart Modifiers' })
  const groups = ['Area Modifiers', 'Adjacent Modifiers', 'Voyage Modifiers', 'Border Modifiers']
  await expect(dialog.locator('.mb-bulk')).toHaveCount(groups.length)

  for (const name of groups) {
    const group = dialog.locator('.mb-group').filter({
      has: appPage.locator('.mb-group-title', { hasText: name }),
    })
    const disable = dialog.getByRole('button', { name: `Disable all ${name}`, exact: true })
    await expect(disable).toHaveCount(1)
    await disable.click()
    await expect(group.locator('input:checked')).toHaveCount(0)
    const enable = dialog.getByRole('button', { name: `Enable all ${name}`, exact: true })
    await expect(enable).toHaveCount(1)
    await expect(disable).toHaveCount(0)
    await enable.click()
    await expect(group.locator('input:not(:checked)')).toHaveCount(0)
    await expect(disable).toHaveCount(1)
  }
})
