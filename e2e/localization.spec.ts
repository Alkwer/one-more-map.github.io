import { KOREAN_CHART, expect, openApp, pasteText, test } from './support'
import { STRATEGIES } from '../src/data/strategies'

test.describe('Korean interface', () => {
  test.use({ locale: 'ko-KR' })

  test('selects browser language, imports Korean charts, and switches without losing work', async ({
    appPage,
  }) => {
    await openApp(appPage)
    await expect(appPage.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(appPage.getByRole('combobox', { name: '언어', exact: true })).toHaveValue('ko')
    await expect(appPage.getByRole('heading', { name: '해도 보관함' })).toBeVisible()
    await expect(appPage.getByRole('contentinfo', { name: '애플리케이션 빌드' })).toBeVisible()
    await expect(appPage.getByRole('link', { name: '기능 제안' })).toHaveAttribute(
      'href',
      /template=feature_request.yml.*build=/,
    )
    await expect(
      appPage.getByRole('button', { name: `전략 활성화: ${STRATEGIES[0].name}`, exact: true }),
    ).toHaveCount(1)
    await expect(
      appPage.getByRole('status', { name: '희귀 해도 가져오기 알림', exact: true }),
    ).toHaveCount(1)
    await pasteText(appPage, KOREAN_CHART, { waitForImport: false })
    await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveCount(1)
    await expect(appPage.locator('.import-panel [role="status"]').first()).toContainText(
      '해도 1개를 가져왔습니다',
    )
    await expect(appPage.getByRole('status', { name: '가져오기 결과', exact: true })).toContainText(
      '해도 1개를 가져왔습니다',
    )
    const originalChart = await appPage
      .locator('.library [data-library-chart-uid]')
      .getAttribute('data-library-chart-uid')
    await appPage.locator('#chart-import-text').fill('unfinished clipboard text')

    await appPage.getByRole('combobox', { name: '언어', exact: true }).selectOption('en')
    await expect(appPage.locator('html')).toHaveAttribute('lang', 'en')
    await expect(appPage.getByRole('heading', { name: 'Chart Library' })).toBeVisible()
    await expect(appPage.locator('.import-panel [role="status"]').first()).toContainText(
      'Imported 1 chart',
    )
    await expect(appPage.locator('#chart-import-text')).toHaveValue('unfinished clipboard text')
    await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveAttribute(
      'data-library-chart-uid',
      originalChart!,
    )
    await expect
      .poll(() => appPage.evaluate(() => localStorage.getItem('voyage-ui-locale')))
      .toBe('en')
    await appPage.reload()
    await expect(appPage.locator('html')).toHaveAttribute('lang', 'en')
    await expect(appPage.getByRole('button', { name: 'Share layout', exact: true })).toBeVisible()
    await expect(appPage.locator('.library [data-library-chart-uid]')).toHaveCount(1)
  })
})

test.describe('unsupported browser language', () => {
  test.use({ locale: 'fr-FR' })

  test('falls back to English and exposes the Korean option', async ({ appPage }) => {
    await openApp(appPage)
    await expect(appPage.locator('html')).toHaveAttribute('lang', 'en')
    await appPage.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ko')
    await expect(appPage.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(appPage.getByRole('button', { name: '배치 공유', exact: true })).toBeVisible()
  })
})
