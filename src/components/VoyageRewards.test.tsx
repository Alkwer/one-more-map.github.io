import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CURSED_DUCATS, CURSED_DUCAT_IMPLICIT } from '../data/cursedDucats'
import type { ScoreBreakdown } from '../logic/scoring'
import { emptyBoard } from '../types'
import { ALL_STATS } from '../types'
import { VoyageRewards } from './VoyageRewards'

const emptyScore = (): ScoreBreakdown => ({
  total: 0,
  perTile: Array(9).fill(0),
  perStat: Object.fromEntries(ALL_STATS.map((stat) => [stat, 0])) as ScoreBreakdown['perStat'],
})

describe('VoyageRewards patch scope', () => {
  it('explains that Cursed Ducats are outside the relative layout score', () => {
    const html = renderToStaticMarkup(
      <VoyageRewards
        score={emptyScore()}
        board={emptyBoard()}
        pool={[]}
        chartMap={new Map()}
        notables={[]}
      />,
    )

    expect(html).toContain('Cursed Ducats (PoE 3.29.3)')
    expect(html).toContain('are not included in this layout score')
    expect(html).toContain('do not change which arrangement scores best')
    expect(html).toContain('View all 6 Cursed Ducat effects')
    expect(CURSED_DUCATS).toHaveLength(6)
    expect(html).toContain(CURSED_DUCAT_IMPLICIT)
    for (const ducat of CURSED_DUCATS) {
      expect(html).toContain(ducat.name.replace("'", '&#x27;'))
      for (const effect of ducat.effects) expect(html).toContain(effect)
    }
    expect(html).toContain('class="muted reward-grid-empty"')
  })
})
