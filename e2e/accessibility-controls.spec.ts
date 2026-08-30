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
