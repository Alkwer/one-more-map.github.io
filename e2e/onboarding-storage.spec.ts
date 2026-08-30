import { expect, openApp, test } from './support'

for (const failureMode of ['storage methods', 'localStorage access'] as const) {
  test(`shows dismissible onboarding again after reload when ${failureMode} throw`, async ({
    appPage,
  }) => {
    await appPage.addInitScript((mode) => {
      if (mode === 'localStorage access') {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('storage blocked', 'SecurityError')
          },
        })
      } else {
        for (const method of ['getItem', 'setItem'] as const) {
          Object.defineProperty(Storage.prototype, method, {
            configurable: true,
            value() {
              throw new DOMException('storage blocked', 'SecurityError')
            },
          })
        }
      }
    }, failureMode)

    await openApp(appPage)
    const onboarding = appPage.getByRole('dialog', { name: 'Plan your Voyage' })
    await expect(onboarding).toBeVisible()
    await onboarding.getByRole('button', { name: 'Start planning', exact: true }).click()
    await expect(onboarding).toHaveCount(0)
    await appPage.getByRole('button', { name: '+ Add chart', exact: true }).click()
    await expect(appPage.getByRole('heading', { name: /Chart Library/ })).toContainText('(1)')
    await expect(onboarding).toHaveCount(0)

    await appPage.reload()
    await expect(onboarding).toBeVisible()
    await appPage.keyboard.press('Escape')
    await expect(onboarding).toHaveCount(0)
    await expect(appPage.getByRole('button', { name: '+ Add chart', exact: true })).toBeEnabled()
  })
}
