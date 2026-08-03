import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultStrategyReservations } from '../data/strategies'
import { CUSTOM_OPTIONS, customKey } from '../logic/pieceKeeps'
import type { ChartData } from '../types'
import { SaveWizard } from './SaveWizard'

const chart = (uid: string, modIds: string[]): ChartData => ({
  uid,
  name: `Chart ${uid}`,
  level: 80,
  edges: [true, true, true, true],
  modIds,
  shape: 'Crossing',
  shapeResolved: true,
})

describe('SaveWizard', () => {
  it('labels the chart-type search and custom-type controls', () => {
    const barrelFamily = CUSTOM_OPTIONS.find((option) => option.modIds.includes('adj-barrel-1'))!
    const html = renderToStaticMarkup(
      <SaveWizard
        pool={[chart('barrel', ['adj-barrel-2'])]}
        keeps={{ [customKey('divine-border-rares', barrelFamily.modIds)]: 1 }}
        reservations={defaultStrategyReservations()}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(html).toContain('<label class="sr-only" for="sw-chart-type-search">')
    expect(html).toContain('Search chart types to add')
    expect(html).toContain('id="sw-chart-type-search"')
    expect(html).toContain('aria-label="Remove Barrels (any tier)"')
    expect(html).toContain('you have 1')
  })
})
