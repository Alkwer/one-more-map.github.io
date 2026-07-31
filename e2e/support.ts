import { readFileSync } from 'node:fs'
import { expect, test as base, type Page } from '@playwright/test'

export const ORIGIN = 'http://127.0.0.1:4173'
export const APP_PATH = '/allflame-voyage-solver/'
export const APP_URL = `${ORIGIN}${APP_PATH}`

const fixture = (name: string) =>
  readFileSync(new URL(`../src/logic/__fixtures__/${name}`, import.meta.url), 'utf8')

export const ENGLISH_CHART = fixture('charted.en.txt')
export const KOREAN_CHART = fixture('charted.ko.txt')

export const UNKNOWN_SHAPE_CHART = ENGLISH_CHART.replace(
  'Chart Shape: Corner',
  'Chart Shape: Spiral',
)

export const DIVINE_BORDER_PAYLOAD = `=== VOYAGE BORDER 0 ===
Rare Monsters adjacent in Areas drop 1 additional Divine Orbs
=== END VOYAGE BORDER ===`

export const REROLL_COST_PAYLOAD = `=== VOYAGE REROLL COST ===
Border Modifiers Reroll Cost: 6 000
=== END VOYAGE REROLL COST ===`

export const COMPLETE_DIVINE_BORDER_PAYLOAD = Array.from(
  { length: 12 },
  (_, index) => `=== VOYAGE BORDER ${index} ===
Rare Monsters adjacent in Areas drop 1 additional Divine Orbs
=== END VOYAGE BORDER ===`,
).join('\n')

export function makeCrossingChartBatch(count: number): string {
  return Array.from({ length: count }, (_, index) =>
    ENGLISH_CHART.replace(
      'Armoured Coral Reef Chart of Ice',
      `Smoke Crossing ${index + 1}`,
    ).replace('Chart Shape: Corner', 'Chart Shape: Crossing'),
  ).join('\n')
}

function isLocalUrl(url: string): boolean {
  try {
    return new URL(url).origin === ORIGIN
  } catch {
    return false
  }
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    const browserErrors: string[] = []

    for (const protocol of ['http', 'https']) {
      await page.route(`${protocol}://gc.zgo.at/**`, (route) =>
        route.fulfill({ status: 204, contentType: 'application/javascript', body: '' }),
      )
    }
    await page.addInitScript(() => {
      try {
        localStorage.setItem('onboarding-seen', '1')
      } catch {
        // The initial about:blank document has no usable storage origin.
      }
    })

    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`)
    })
    page.on('requestfailed', (request) => {
      if (isLocalUrl(request.url())) {
        browserErrors.push(
          `requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`,
        )
      }
    })
    page.on('response', (response) => {
      if (isLocalUrl(response.url()) && response.status() >= 400) {
        browserErrors.push(`response: ${response.status()} ${response.url()}`)
      }
    })

    await use(page)

    expect(browserErrors, 'unexpected browser errors').toEqual([])
  },
})

export { expect }

export async function openApp(page: Page) {
  await page.goto(APP_PATH)
  await expect(page).toHaveTitle('Allflame Voyage Solver - PoE 3.29')
  await expect(page.getByRole('heading', { name: /Allflame Voyage Solver/ })).toBeVisible()
}

export async function pasteText(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const data = new DataTransfer()
    data.setData('text/plain', clipboardText)
    document.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    )
  }, text)
}
