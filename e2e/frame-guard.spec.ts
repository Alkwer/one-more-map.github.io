import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { APP_URL } from './support'

test('blocks stateful app execution inside an external-origin iframe', async ({ page }) => {
  await page.goto(`${APP_URL}voyage-import.ahk`)
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

    await expect.poll(() => page.frames().map((frame) => frame.url())).toContain(APP_URL)
    const framedApp = page.frameLocator('iframe[title="embedded solver"]')
    await expect(framedApp.getByRole('alert')).toHaveText(
      'For your security, Allflame Voyage Solver cannot run inside another page.',
    )
    await expect(framedApp.getByRole('heading', { name: /Allflame Voyage Solver/ })).toHaveCount(0)
    await expect(framedApp.locator('.app')).toHaveCount(0)

    const storage = await framedApp.locator('html').evaluate(() => ({ ...localStorage }))
    expect(storage).toEqual({ 'frame-guard-sentinel': 'preserved' })
  } finally {
    await new Promise<void>((resolve) => attacker.close(() => resolve()))
  }
})
