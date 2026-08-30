import { formatDecimal, formatNumber, t, ui } from '../i18n/locale'
import { useState } from 'react'
import { CURSED_DUCATS, CURSED_DUCAT_IMPLICIT } from '../data/cursedDucats'
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
          {t('Voyage Rewards ')}
          <strong>{ui(formatDecimal(score.total, 1))}</strong>
        </h2>
        <span className="spacer" />
        <button
          aria-label={t('Copy in-game chart search')}
          onClick={copySearch}
          disabled={board.every((placement) => !placement)}
          title={t(
            'Copy a candidate in-game Chart search, then verify that only the placed Charts are highlighted',
          )}
        >
          {ui(searchMessage) || t('⌕ Copy in-game search')}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {ui(searchMessage)}
        </span>
      </div>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        {t(
          'A relative score for comparing your layouts, based on your weights and estimated mod values. Not exact loot value. See the actual contents below.',
        )}
      </div>
      <div className="ducat-scope-note" role="note">
        <strong>
          {t('Cursed Ducats (PoE ')}
          {ui(CURRENT_GAME_PATCH)})
        </strong>
        <span>
          {t(
            'Their Voyage-wide monster Toughness, Item Quantity/Rarity, and build-specific downsides are not included in this layout score. Because they affect the whole Voyage, they do not change which arrangement scores best.',
          )}
        </span>
        <details className="ducat-reference">
          <summary>
            {t('View all ')}
            {formatNumber(CURSED_DUCATS.length)}
            {t(' Cursed Ducat effects')}
          </summary>
          <p className="ducat-implicit">
            {t('Shared implicit: ')}
            <span>{ui(CURSED_DUCAT_IMPLICIT)}</span>
          </p>
          <ul>
            {CURSED_DUCATS.map((ducat) => (
              <li key={ducat.name}>
                <strong>{ducat.name}</strong>
                <span>{ui(ducat.effects.join('; '))}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="reward-grid">
        {ALL_STATS.filter((stat) => score.perStat[stat] > 0)
          .sort((left, right) => score.perStat[right] - score.perStat[left])
          .map((stat, index) => (
            <div key={stat} className={`reward-card ${index === 0 ? 'best' : ''}`}>
              <div className="reward-value">
                +{formatNumber(Math.round(score.perStat[stat] * 100))}%
              </div>
              <div className="reward-label">{ui(STAT_LABELS[stat])}</div>
            </div>
          ))}
        {ALL_STATS.every((stat) => score.perStat[stat] === 0) && (
          <div className="muted reward-grid-empty">{t('Place charts to see bonuses')}</div>
        )}
      </div>
      {ALL_STATS.some((stat) => score.perStat[stat] > 0) && (
        <div className="muted small-note">{t('Average bonus per area across the Voyage.')}</div>
      )}
      {notables.length > 0 && (
        <>
          <h3 className="panel-title small">{t('Guaranteed & Notable')}</h3>
          <div className="notable-list">
            {notables.map((notable) => (
              <span key={notable.label} className="notable-item" title={ui(notable.full)}>
                {ui(notable.label)}
                {notable.count > 1 ? t(' ×{v0}', { v0: notable.count }) : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
