import { describe, expect, it } from 'vitest'
import type { ChartData } from '../types'
import englishChartText from './__fixtures__/charted.en.txt?raw'
import koreanChartText from './__fixtures__/charted.ko.txt?raw'
import { parseChartText } from './parser'
import { DEFAULT_WEIGHTS } from './rewards'
import {
  buildBestModRegex,
  buildChartSearch,
  buildSingleChartSearch,
  detectSearchClientLanguage,
  MAX_CHART_SEARCH_LENGTH,
} from './regex'

function parseOne(text: string): ChartData {
  const result = parseChartText(text)
  expect(result.rejected).toEqual([])
  expect(result.charts).toHaveLength(1)
  return result.charts[0]
}

function singleSearch(chart: ChartData, cap?: number): string {
  const result = buildSingleChartSearch(chart, cap)
  expect(result).toMatchObject({ ok: true })
  if (!result.ok) throw new Error(result.message)
  return result.regex
}

describe('buildSingleChartSearch', () => {
  it('uses the verified Korean Area Level term for a Korean-client chart', () => {
    const search = singleSearch(parseOne(koreanChartText))

    expect(search).toBe(
      '해병 고역 산호 암초 해도 인접 지역 내 몬스터가 떨어뜨리는 장비의 40%가 골드로 전환 지역 레벨 81',
    )
    expect(search).toContain('지역 레벨 81')
    expect(search).not.toContain('Level 81')
  })

  it('keeps the existing English Level term for an English-client chart', () => {
    const search = singleSearch(parseOne(englishChartText))

    expect(search).toBe(
      "Armoured Coral Reef Chart of Ice 20% increased Dead Man's Sulphur found in this Area Level 63",
    )
    expect(search).toContain('Level 63')
    expect(search).not.toContain('지역 레벨')
  })

  it('detects Korean from an unknown verbatim implicit', () => {
    const chart: ChartData = {
      uid: 'unknown-korean-implicit',
      name: 'Manual Chart',
      level: 81,
      edges: [true, true, true, false],
      modIds: [],
      implicitText: '아직 등록되지 않은 한국어 항해 속성',
    }

    expect(singleSearch(chart)).toContain('지역 레벨 81')
  })

  it('defaults Hangul-free manual and demo charts to English', () => {
    const chart: ChartData = {
      uid: 'manual-demo',
      name: 'Demo Chart',
      level: 83,
      edges: [true, false, false, false],
      modIds: ['voy-sulph-2'],
    }

    const search = singleSearch(chart)
    expect(search).toBe("Demo Chart 20% increased Dead Man's Sulphur found in this Area Level 83")
    expect(search).toContain('Level 83')
    expect(search).not.toContain('지역 레벨')
  })

  it('accepts 250 characters and rejects 251 after regex escaping', () => {
    const chart: ChartData = {
      uid: 'boundary',
      name: 'a'.repeat(241),
      level: 83,
      edges: [true, false, false, false],
      modIds: [],
    }

    expect(buildSingleChartSearch(chart)).toMatchObject({ ok: true })
    expect(singleSearch(chart)).toHaveLength(250)
    expect(buildSingleChartSearch({ ...chart, name: 'a'.repeat(242) })).toEqual({
      ok: false,
      message:
        'Exact chart search exceeds the 250-character in-game limit. Shorten the chart name or implicit text before copying.',
    })

    expect(singleSearch({ ...chart, name: '['.repeat(120) })).toHaveLength(249)
    expect(buildSingleChartSearch({ ...chart, name: '['.repeat(121) })).toMatchObject({
      ok: false,
    })
  })
})

describe('buildBestModRegex', () => {
  it('selects the highest-value tier once per English modifier family', () => {
    const result = buildBestModRegex({ 'voyage:sulph': 10 })

    expect(result.ok).toBe(true)
    expect(result.regex).toMatch(/^[a-z ]+(\|[a-z ]+)*$/)
    expect(result.regex.length).toBeLessThanOrEqual(MAX_CHART_SEARCH_LENGTH)
    expect(result.included.map(({ id }) => id)).toEqual(['voy-sulph-3'])
  })

  it('honours disabled modifiers and the configured length cap', () => {
    const disabled = new Set(['voy-sulph-1', 'voy-sulph-2', 'voy-sulph-3'])

    expect(buildBestModRegex({ 'voyage:sulph': 10 }, 250, disabled)).toMatchObject({
      ok: true,
      regex: '',
      included: [],
    })
    expect(buildBestModRegex({ 'voyage:sulph': 10 }, 2)).toMatchObject({
      ok: true,
      regex: '',
      included: [],
    })
  })

  it('never emits English fragments for a Korean client', () => {
    expect(buildBestModRegex(DEFAULT_WEIGHTS, 250, undefined, 'ko')).toEqual({
      ok: false,
      regex: '',
      included: [],
      message:
        'Best-Charts Regex is unavailable for Korean clients until its modifier fragments are live-validated.',
    })
  })
})

const chart = (uid: string, name: string, overrides: Partial<ChartData> = {}): ChartData => ({
  uid,
  name,
  level: 83,
  edges: [true, false, true, false],
  modIds: [],
  ...overrides,
})

function expectExactMatch(
  result: ReturnType<typeof buildChartSearch>,
  targets: ChartData[],
  others: ChartData[],
) {
  expect(result).toMatchObject({ ok: true })
  if (!result.ok) return
  const regex = new RegExp(result.regex, 'iu')
  const searchableText = (entry: ChartData) => {
    const usesHangul = /[\uac00-\ud7a3]/.test(
      [entry.name, entry.implicitText, entry.rawText].filter(Boolean).join('\n'),
    )
    return [
      entry.name,
      entry.implicitText,
      `${usesHangul ? '지역 레벨' : 'Area Level'}: ${entry.level}`,
      ...(entry.rewards ?? []).map((reward) =>
        reward.stat === 'quantity' ? `Item Quantity: +${reward.percent}%` : `${reward.percent}%`,
      ),
      entry.rawText,
    ]
      .filter(Boolean)
      .join('\n')
  }
  for (const target of targets) expect(regex.test(searchableText(target))).toBe(true)
  for (const other of others) expect(regex.test(searchableText(other))).toBe(false)
}

describe('buildChartSearch', () => {
  it('uses the sanitized English and Korean client fixtures as separate search documents', () => {
    const english = parseOne(englishChartText)
    const korean = parseOne(koreanChartText)

    expect(detectSearchClientLanguage([english])).toBe('en')
    expect(detectSearchClientLanguage([korean])).toBe('ko')
    expectExactMatch(buildChartSearch([english], [korean]), [english], [korean])
    expectExactMatch(buildChartSearch([korean], [english]), [korean], [english])
  })

  it('uses the official 250-character PoE 1 search-box limit by default', () => {
    expect(MAX_CHART_SEARCH_LENGTH).toBe(250)
  })

  it('distinguishes duplicate names by stable searchable chart data', () => {
    const target = chart('placed', 'Armoured Coral Reef Chart', {
      level: 83,
      implicitText: 'Adjacent Areas contain 2 additional Treasure Anchors',
    })
    const sameName = chart('unplaced', 'Armoured Coral Reef Chart', {
      level: 82,
      implicitText: 'Adjacent Areas contain 1 additional Treasure Anchor',
    })

    expectExactMatch(buildChartSearch([target], [sameName]), [target], [sameName])
  })

  it('uses rolled reward values when names, levels, and implicits match', () => {
    const target = chart('placed', 'Duplicate Chart', {
      rewards: [{ stat: 'quantity', percent: 20 }],
    })
    const other = chart('unplaced', 'Duplicate Chart', {
      rewards: [{ stat: 'quantity', percent: 30 }],
    })
    const result = buildChartSearch([target], [other])

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(new RegExp(result.regex, 'iu').test('Item Quantity: +20%')).toBe(true)
      expect(new RegExp(result.regex, 'iu').test('Item Quantity: +30%')).toBe(false)
    }
  })

  it('covers multiple identical targets with one safe expression', () => {
    const targets = [chart('first', 'Twin Chart'), chart('second', 'Twin Chart')]
    expectExactMatch(buildChartSearch(targets, []), targets, [])
  })

  it('reports when an unplaced chart is search-identical to a target', () => {
    const target = chart('placed', 'Twin Chart')
    const result = buildChartSearch([target], [chart('unplaced', 'Twin Chart')])

    expect(result).toEqual({
      ok: false,
      message:
        "Can't build an exact search: a placed chart is indistinguishable from an unplaced chart by its searchable name, level, modifiers, and rolls.",
    })
  })

  it('escapes regex metacharacters in manual chart names', () => {
    const target = chart('placed', 'A[B Chart')
    const result = buildChartSearch([target], [chart('other', 'Zed Chart')])

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(() => new RegExp(result.regex, 'iu')).not.toThrow()
      expect(new RegExp(result.regex, 'iu').test(target.name)).toBe(true)
    }
  })

  it('preserves Unicode literals while selecting the right chart', () => {
    const target = chart('placed', 'Zażółć Gęślą Chart')
    const other = chart('other', 'Korean 해도 Chart')
    expectExactMatch(buildChartSearch([target], [other]), [target], [other])
  })

  it('accepts an expression at the cap and rejects the same exact search below it', () => {
    const target = chart('placed', 'abcdef')
    const other = chart('other', 'abcde bcdef')

    expect(buildChartSearch([target], [other], 6)).toEqual({ ok: true, regex: 'abcdef' })
    expect(buildChartSearch([target], [other], 5)).toEqual({
      ok: false,
      message: 'Exact search exceeds the 5-character in-game limit.',
    })
  })
})
