import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppHeader } from '../components/app/AppHeader'
import { BuildFooter } from '../components/app/BuildFooter'
import { StrategiesPanel } from '../components/StrategiesPanel'
import { STRATEGIES } from '../data/strategies'
import { defaultState } from '../logic/storage'
import { SolverActions } from '../components/solver/SolverActions'
import { RewardWeights } from '../components/solver/RewardWeights'
import { TooltipDescription } from '../components/Tooltip'
import { REWARD_TYPES } from '../logic/rewards'
import {
  formatDecimal,
  formatNumber,
  formatNumberForLocale,
  getLocale,
  initializeLocale,
  joinMessages,
  LOCALE_STORAGE_KEY,
  message,
  resolveLocale,
  setLocale,
  subscribeLocale,
  t,
  translate,
  ui,
} from './locale'

afterEach(async () => {
  await setLocale('en')
  vi.unstubAllGlobals()
})

describe('locale selection and browser metadata', async () => {
  it('honors supported browser preferences in order and normalizes Korean regions', async () => {
    expect(resolveLocale(['ko-KR', 'en-US'])).toBe('ko')
    expect(resolveLocale(['fr-FR', 'ko-KR', 'en-US'])).toBe('ko')
    expect(resolveLocale(['en-GB', 'ko-KR'])).toBe('en')
    expect(resolveLocale(['KO_kr'])).toBe('ko')
  })

  it('uses an explicit preference first and falls back safely for unsupported locales', async () => {
    expect(resolveLocale(['ko-KR'], 'en')).toBe('en')
    expect(resolveLocale(['en-US'], 'ko')).toBe('ko')
    expect(resolveLocale(['ko-KR'], 'broken')).toBe('ko')
    expect(resolveLocale(['fr-FR', 'de-DE'])).toBe('en')
    expect(resolveLocale([])).toBe('en')
  })

  it('initializes document language before rendering and persists a manual change', async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() }
    const document = { documentElement: { lang: 'en' } }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('document', document)
    vi.stubGlobal('navigator', { languages: ['ko-KR', 'en-US'] })
    expect(await initializeLocale()).toBe('ko')
    expect(document.documentElement.lang).toBe('ko')
    expect(storage.getItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY)

    const listener = vi.fn()
    const unsubscribe = subscribeLocale(listener)
    await setLocale('en')
    expect(getLocale()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(storage.setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'en')
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    await setLocale('ko')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('keeps language selection available when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    vi.stubGlobal('document', { documentElement: { lang: 'en' } })
    vi.stubGlobal('navigator', { languages: [], language: 'ko-KR' })
    expect(await initializeLocale()).toBe('ko')
    await expect(setLocale('en')).resolves.toBeUndefined()
    expect(getLocale()).toBe('en')
  })
})

describe('translations and localized numbers', async () => {
  it('provides Korean copy and an exact English fallback for missing translations', async () => {
    await setLocale('ko')
    expect(translate('ko', 'Share layout')).toBe('배치 공유')
    expect(translate('en', 'Share layout')).toBe('Share layout')
    expect(translate('ko', 'Detailed technical explanation')).toBe('Detailed technical explanation')
    expect(translate('ko', '__proto__')).toBe('__proto__')
    expect(translate('ko', 'constructor')).toBe('constructor')
  })

  it('retranslates stored message parts after a language change', async () => {
    const status = joinMessages([
      message('Imported {count} chart', { count: 1 }),
      'State loaded from JSON',
    ])
    await setLocale('ko')
    expect(ui(status)).toBe('해도 1개를 가져왔습니다; JSON에서 상태를 불러왔습니다')
    await setLocale('en')
    expect(ui(status)).toBe('Imported 1 chart; State loaded from JSON')
  })

  it('preserves chart names even when they match an interface message', async () => {
    await setLocale('ko')
    const markup = renderToStaticMarkup(
      <TooltipDescription id="chart-description" data={{ title: 'Share layout', lines: [] }} />,
    )
    expect(markup).toContain('Share layout')
    expect(markup).not.toContain('배치 공유')
  })

  it('localizes build and strategy controls while preserving canonical metadata and names', async () => {
    await setLocale('ko')
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const builtAt = '2026-08-31T10:15:00.000Z'
    const footer = renderToStaticMarkup(
      <BuildFooter build={{ commit, shortCommit: '0123456', builtAt }} />,
    )
    expect(footer).toContain('aria-label="애플리케이션 빌드"')
    expect(footer).toContain('기능 제안</a>')
    expect(footer).toContain(`/commit/${commit}`)
    expect(footer).toContain(`<time dateTime="${builtAt}">${builtAt}</time>`)
    expect(footer).toContain(`template=feature_request.yml&amp;build=${commit}`)

    const strategies = renderToStaticMarkup(
      <StrategiesPanel
        activeId={null}
        pool={[]}
        borders={defaultState().borders}
        onSelect={() => {}}
      />,
    )
    expect(strategies).toContain(
      `aria-label="전략 활성화: ${STRATEGIES[0].name.replace(/&/g, '&amp;')}"`,
    )
    expect(
      translate('ko', 'Strategy active: {name} (recommendation)', { name: STRATEGIES[0].name }),
    ).toBe(`활성 전략: ${STRATEGIES[0].name} (추천)`)
  })

  it('uses missing reward defaults before formatting and preserves explicit zero weights', async () => {
    await setLocale('ko')
    const weights = { [REWARD_TYPES[0].key]: 0 }
    const markup = renderToStaticMarkup(
      <RewardWeights weights={weights} overridden={false} onChange={() => {}} />,
    )
    const values = [...markup.matchAll(/class="weight-val">([^<]+)</g)].map((match) => match[1])
    expect(markup).not.toContain('NaN')
    const sliderValues = [...markup.matchAll(/type="range"[^>]+value="([^"]+)"/g)].map((match) =>
      formatNumber(Number(match[1])),
    )
    expect(values).toEqual(sliderValues)
    expect(values).toContain('0')
  })

  it('formats interpolation values without reinterpreting user text or missing placeholders', async () => {
    expect(translate('ko', 'Solve ({count} charts)', { count: 1250 })).toBe(
      '계산하기 (해도 1,250개)',
    )
    expect(
      translate('en', 'Unknown {value}: {name}', { value: 12000, name: '<Chart>{count}</Chart>' }),
    ).toBe('Unknown 12,000: <Chart>{count}</Chart>')
    expect(translate('ko', 'Unknown {missing}', {})).toBe('Unknown {missing}')
  })

  it('passes the selected locale to Intl for numbers, precision, and compact notation', async () => {
    await setLocale('ko')
    expect(formatNumber(12345.67)).toBe(new Intl.NumberFormat('ko').format(12345.67))
    expect(formatDecimal(1234.5)).toBe('1,234.5')
    expect(formatDecimal(0)).toBe('0.0')
    const options = { notation: 'compact' } as const
    expect(formatNumber(12000, options)).toBe(new Intl.NumberFormat('ko', options).format(12000))
    expect(formatNumberForLocale('en', 12000, options)).not.toBe(formatNumber(12000, options))
    expect(t('Solve ({count} charts)', { count: 12 })).toBe('계산하기 (해도 12개)')
  })

  it('renders translated controls, accessible labels, and numeric messages', async () => {
    await setLocale('ko')
    const header = renderToStaticMarkup(
      <AppHeader
        disabledModCount={2}
        harvestTheme={false}
        shareMessage="Link copied!"
        updatesUnseen
        onOpenOnboarding={() => {}}
        onOpenMods={() => {}}
        onOpenTutorial={() => {}}
        onOpenUpdates={() => {}}
        onToggleTheme={() => {}}
        onShare={() => {}}
      />,
    )
    expect(header).toContain('aria-label="언어"')
    expect(header).toContain('value="ko" lang="ko" selected=""')
    expect(header).toContain('aria-label="배치 공유"')
    expect(header).toContain('링크를 복사했습니다!')
    expect(header).toContain('(2개 비활성)')
    expect(header).toContain('PoE 3.29: Curse of the Allflame')

    const actions = renderToStaticMarkup(
      <SolverActions
        busy={false}
        resultCount={1250}
        solveNote=""
        eligibleChartCount={1234}
        unresolvedShapeCount={0}
        allowRotation={false}
        onSolve={() => {}}
        onFiller={() => {}}
      />,
    )
    expect(actions).toContain('계산 완료: 결과 1,250개')
    expect(actions).toContain('계산하기 (해도 1,234개)')
    expect(actions).toContain('no global optimality guarantee')
  })
})
