import { useState } from 'react'
import { CURRENT_GAME_PATCH } from '../data/gameVersion'
import { buildChartSearch } from '../logic/regex'
import { writeClipboardText } from '../logic/clipboard'
import type { ScoreBreakdown } from '../logic/scoring'
import type { Board, ChartData } from '../types'
import { ALL_STATS, STAT_LABELS } from '../types'

interface NotableEffect {
  label: string
  full: string
  count: number
}

interface Props {
  score: ScoreBreakdown
  board: Board
  pool: ChartData[]
  chartMap: Map<string, ChartData>
  notables: NotableEffect[]
}

export function VoyageRewards({ score, board, pool, chartMap, notables }: Props) {
  const [searchMessage, setSearchMessage] = useState('')
  const copySearch = async () => {
    const placed = board
      .filter(Boolean)
      .map((placement) => chartMap.get(placement!.chartUid))
      .filter((chart): chart is ChartData => !!chart)
    const others = pool.filter(
      (chart) => !board.some((placement) => placement?.chartUid === chart.uid),
    )
    const search = buildChartSearch(placed, others)
    if (!search.ok) {
      setSearchMessage(search.message)
      window.setTimeout(() => setSearchMessage(''), 5000)
      return
    }
    const result = await writeClipboardText(search.regex)
    if (result.ok) {
      setSearchMessage('Copied—verify highlights')
    } else {
      setSearchMessage(`${result.detail} Copy manually: ${result.manualText}`)
    }
    window.setTimeout(() => setSearchMessage(''), 2500)
  }

  return (
    <section className="score-panel" aria-labelledby="voyage-rewards-title">
      <div className="score-total">
        <h2 id="voyage-rewards-title" className="score-title">
          Voyage Rewards <strong>{score.total.toFixed(1)}</strong>
        </h2>
        <span className="spacer" />
        <button
          aria-label="Copy in-game chart search"
          onClick={copySearch}
          disabled={board.every((placement) => !placement)}
          title="Copy a candidate in-game Chart search, then verify that only the placed Charts are highlighted"
        >
          {searchMessage || '⌕ Copy in-game search'}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {searchMessage}
        </span>
      </div>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        A relative score for comparing your layouts, based on your weights and estimated mod values.
        Not exact loot value. See the actual contents below.
      </div>
      <div className="ducat-scope-note" role="note">
        <strong>Cursed Ducats (PoE {CURRENT_GAME_PATCH})</strong>
        <span>
          Their Voyage-wide monster Toughness, Item Quantity/Rarity, and build-specific downsides
          are not included in this layout score. Because they affect the whole Voyage, they do not
          change which arrangement scores best.
        </span>
      </div>
      <div className="reward-grid">
        {ALL_STATS.filter((stat) => score.perStat[stat] > 0)
          .sort((left, right) => score.perStat[right] - score.perStat[left])
          .map((stat, index) => (
            <div key={stat} className={`reward-card ${index === 0 ? 'best' : ''}`}>
              <div className="reward-value">+{Math.round(score.perStat[stat] * 100)}%</div>
              <div className="reward-label">{STAT_LABELS[stat]}</div>
            </div>
          ))}
        {ALL_STATS.every((stat) => score.perStat[stat] === 0) && (
          <div className="muted reward-grid-empty">Place charts to see bonuses</div>
        )}
      </div>
      {ALL_STATS.some((stat) => score.perStat[stat] > 0) && (
        <div className="muted small-note">Average bonus per area across the Voyage.</div>
      )}
      {notables.length > 0 && (
        <>
          <h3 className="panel-title small">Guaranteed & Notable</h3>
          <div className="notable-list">
            {notables.map((notable) => (
              <span key={notable.label} className="notable-item" title={notable.full}>
                {notable.label}
                {notable.count > 1 ? ` ×${notable.count}` : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
