import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { APP_URL } from './support'

test('HTTP headers refuse an external-origin iframe before the app executes', async ({
  page,
  request,
}) => {
  const appResponse = await request.get(APP_URL)
  expect(appResponse.ok()).toBe(true)
  expect(appResponse.headers()['x-frame-options']).toBe('DENY')
  expect(appResponse.headers()['content-security-policy']).toMatch(
    /(?:^|;)\s*frame-ancestors 'none'\s*(?:;|$)/,
  )

  await page.goto(APP_URL)
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('frame-guard-sentinel', 'preserved')
  })

  const attackerDocument = `<iframe title="embedded solver" src="${APP_URL}"></iframe>`
  const attacker = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(attackerDocument)
  })
  await new Promise<void>((resolve, reject) => {
    attacker.once('error', reject)
    attacker.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = attacker.address()
    if (!address || typeof address === 'string') throw new Error('Attacker test server has no port')
    await page.goto(`http://127.0.0.1:${address.port}/`)

    await expect(page.locator('iframe[title="embedded solver"]')).toBeVisible()
    await expect.poll(() => page.frames().length).toBe(2)
    const framedApp = page.frameLocator('iframe[title="embedded solver"]')
    // A runtime frame buster would render this alert. Its absence, combined
    // with the authoritative response headers above, proves browser refusal.
    await expect(framedApp.getByRole('alert')).toHaveCount(0)
    await expect(framedApp.getByRole('heading', { name: /Allflame Voyage Solver/ })).toHaveCount(0)
    await expect(framedApp.locator('.app')).toHaveCount(0)

    await page.goto(APP_URL)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('frame-guard-sentinel')))
      .toBe('preserved')
  } finally {
    await new Promise<void>((resolve) => attacker.close(() => resolve()))
  }
})
