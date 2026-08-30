import { expect, openApp, test } from './support'

test('tutorial steps have generous hit areas and a full-control keyboard focus ring', async ({
  appPage,
}) => {
  await appPage.setViewportSize({ width: 390, height: 844 })
  await openApp(appPage)
  await appPage.getByRole('button', { name: /tutorial/i }).click()
  const steps = appPage.getByRole('button', { name: /^Go to tutorial step/ })
  await expect(steps).toHaveCount(8)

  const bounds = await steps.evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect()
      const dot = getComputedStyle(button, '::before')
      return { x, y, width, height, dotWidth: dot.width, dotHeight: dot.height }
    }),
  )
  for (const [index, boundsForStep] of bounds.entries()) {
    expect(boundsForStep.width).toBeGreaterThanOrEqual(24)
    expect(boundsForStep.height).toBeGreaterThanOrEqual(24)
    expect(boundsForStep.dotWidth).toBe('10px')
    expect(boundsForStep.dotHeight).toBe('10px')
    if (index > 0) expect(boundsForStep.x).toBeGreaterThanOrEqual(bounds[index - 1].x + 24)
  }

  await steps.first().focus()
  await appPage.keyboard.press('Tab')
  await expect(steps.nth(1)).toBeFocused()
  const focusRing = await steps.nth(1).evaluate((button) => {
    const style = getComputedStyle(button)
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
  })
  expect(focusRing).toEqual({ outlineStyle: 'solid', outlineWidth: '2px' })
  await appPage.keyboard.press('Enter')
  await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step')

  // The area outside the visual 10px dot must also activate the control.
  await steps.nth(2).click({ position: { x: 2, y: 2 } })
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step')
})

test('strategy details expose stable unique relationships while expanding and collapsing', async ({
  appPage,
}) => {
  await openApp(appPage)
  const strategies = appPage.getByRole('region', { name: 'Strategies', exact: true })
  const headers = strategies.locator('.strat-head')
  const targets = await headers.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-controls')),
  )
  expect(targets.length).toBeGreaterThan(1)
  expect(new Set(targets).size).toBe(targets.length)
  for (const header of await headers.all()) {
    await expect(header).toHaveAttribute('aria-expanded', 'false')
    const target = await header.getAttribute('aria-controls')
    const details = appPage.locator(`[id="${target}"]`)
    await expect(details).toHaveCount(1)
    await expect(details).toBeHidden()
    await expect(details).toHaveAttribute('aria-labelledby', (await header.getAttribute('id'))!)
  }

  await headers.first().click()
  await expect(headers.first()).toHaveAttribute('aria-expanded', 'true')
  await expect(appPage.locator(`[id="${targets[0]}"]`)).toBeVisible()
  await headers.nth(1).click()
  await expect(headers.first()).toHaveAttribute('aria-expanded', 'false')
  await expect(appPage.locator(`[id="${targets[0]}"]`)).toBeHidden()
  await expect(headers.nth(1)).toHaveAttribute('aria-expanded', 'true')
  await headers.nth(1).click()
  await expect(headers.nth(1)).toHaveAttribute('aria-expanded', 'false')
  await expect(headers.nth(1)).toHaveAttribute('aria-controls', targets[1]!)
  await expect(appPage.locator(`[id="${targets[1]}"]`)).toBeHidden()
})
