import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import koreanChart from '../logic/__fixtures__/charted.ko.txt?raw'
import { parseChartText } from '../logic/parser'
import type { ChartData } from '../types'
import { emptyBorders } from '../types'
import { StrategiesPanel } from './StrategiesPanel'

const BASE_KOREAN_IMPLICIT = '인접 지역 내 몬스터가 떨어뜨리는 장비의 40%가 골드로 전환'

function parseKoreanImplicit(implicit: string): ChartData {
  const result = parseChartText(koreanChart.replace(BASE_KOREAN_IMPLICIT, implicit))

  expect(result.rejected).toEqual([])
  expect(result.charts).toHaveLength(1)
  return result.charts[0]
}

function parseKoreanArea(area: string): ChartData {
  const result = parseChartText(koreanChart.replace('해저 마루', area))

  expect(result.rejected).toEqual([])
  expect(result.charts).toHaveLength(1)
  return result.charts[0]
}

function renderStrategy(activeId: string, pool: ChartData[]): string {
  return renderToStaticMarkup(
    <StrategiesPanel
      activeId={activeId}
      pool={pool}
      borders={emptyBorders()}
      onSelect={() => undefined}
    />,
  )
}

describe('Korean clipboard aliases feed strategy readiness', () => {
  it('counts an observed Korean Diviner chart for Speedrun', () => {
    const parsed = parseKoreanImplicit('인접 지역들에 예언자의 금고 3개 추가 등장')
    const diviner = {
      ...parsed,
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }
    const sides = Array.from({ length: 8 }, (_, index) => ({
      ...diviner,
      uid: `${diviner.uid}-side-${index}`,
      modIds: [],
    }))

    expect(diviner.modIds).toEqual(['adj-divbox-2'])

    const html = renderStrategy('milky-speedrun', [diviner, ...sides])

    expect(html).toContain('class="strat-ready"')
    expect(html).toContain('1/1× Operative’s / Arcanist’s / Diviner’s / Message chart (centre)')
  })

  it('counts Korean Sea Pillars by destination instead of the rare Chart name', () => {
    const first = parseKoreanArea('바다 기둥')
    const second = { ...first, uid: `${first.uid}-second` }

    expect(first.name).not.toMatch(/pillar/i)
    expect(first.areaType).toBe('sea-pillars')
    expect(renderStrategy('milky-meatfish', [first])).toContain('1× Sea-Pillar chart (corners)')
    expect(renderStrategy('milky-meatfish', [first, second])).not.toContain(
      '1× Sea-Pillar chart (corners)',
    )
  })

  it('counts a Korean Pelagic Abyss for the Divine Strongboxes strategy', () => {
    const ordinary = parseKoreanArea('해저 마루')
    const pelagic = parseKoreanArea('원양 심연')

    expect(pelagic.name).not.toMatch(/pelagic/i)
    expect(pelagic.areaType).toBe('pelagic-abyss')
    expect(renderStrategy('cutedog-divine-boxes', [ordinary])).toContain(
      '1× Pelagic Abyss chart (high pack size)',
    )
    expect(renderStrategy('cutedog-divine-boxes', [pelagic])).not.toContain(
      '1× Pelagic Abyss chart (high pack size)',
    )
  })
})

describe('keeper search accessibility', () => {
  it('labels and describes the read-only field with stable strategy context', () => {
    const html = renderStrategy('milky-speedrun', [])

    expect(html).toContain('<label for="keeper-search-milky-speedrun" class="strat-regex-label"')
    expect(html).toMatch(
      /<input id="keeper-search-milky-speedrun" readonly="" aria-describedby="keeper-search-milky-speedrun-description" value="[^"]+"\/?>/,
    )
    expect(html).toContain(
      'Read-only keeper search for Speedrun Strongboxes. Copy it into the in-game chart search.',
    )
    expect(html).toContain('aria-label="Copy Speedrun Strongboxes keeper search"')
  })
})

describe('selectable strategy layouts', () => {
  it('shows and labels the persisted Alc & Go layout choice', () => {
    const html = renderToStaticMarkup(
      <StrategiesPanel
        activeId="alc-and-go"
        pool={[]}
        borders={emptyBorders()}
        onSelect={() => undefined}
        layoutChoice={{ 'alc-and-go': 'snake' }}
        onLayoutChoice={() => undefined}
      />,
    )

    expect(html).toContain('<label class="strat-layouts-label" for="strategy-layout-alc-and-go">')
    expect(html).toContain('<option value="snake" selected="">S-snake</option>')
    expect(html).toContain('One continuous path — fastest to run.')
  })
})
