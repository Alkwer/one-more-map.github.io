import { t, ui } from '../i18n/locale'
import { useState } from 'react'
import { STRATEGIES, type StrategyDef } from '../data/strategies'
import { strategyReadiness } from '../logic/strategyReadiness'
import { writeClipboardText } from '../logic/clipboard'
import type { Borders, ChartData } from '../types'

interface Props {
  activeId: string | null
  pool: ChartData[]
  borders: Borders
  onSelect: (id: string | null) => void
  layoutChoice?: Record<string, string>
  onLayoutChoice?: (strategyId: string, layoutId: string) => void
}

function Readiness({
  strategy,
  pool,
  borders,
}: {
  strategy: StrategyDef
  pool: ChartData[]
  borders: Borders
}) {
  const readiness = strategyReadiness(strategy, pool, borders)
  if (readiness.requirements.length === 0) return null
  if (!readiness.ready) {
    return (
      <div className="strat-notready">
        {t('Missing requirements: ')}
        {ui(readiness.missing.join(', '))}.
      </div>
    )
  }
  return (
    <div className="strat-ready">
      {t('✓ Requirements met:')}{' '}
      {ui(
        readiness.requirements
          .map(
            (r) =>
              `${Math.min(r.have, r.need)}/${r.need}× ${r.label}${
                r.have > r.need ? ` (+${r.have - r.need} spare)` : ''
              }`,
          )
          .join(', '),
      )}
    </div>
  )
}

/**
 * Curated strategies. Selecting one OVERRIDES the manual reward weights and
 * adds placement rules that shape what the solver suggests. Its own section so
 * it's obvious when a strategy - not your sliders - is steering results.
 */
function RegexRow({
  regex,
  strategyId,
  strategyName,
}: {
  regex: string
  strategyId: string
  strategyName: string
}) {
  const [copied, setCopied] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const inputId = `keeper-search-${strategyId}`
  const descriptionId = `${inputId}-description`
  return (
    <div className="strat-regex-row">
      <label
        htmlFor={inputId}
        className="strat-regex-label"
        title={t("Paste into the in-game chart search to highlight this strategy's keeper charts")}
      >
        {t('Keeper search')}
      </label>
      <input
        id={inputId}
        readOnly
        value={regex}
        aria-describedby={descriptionId}
        onFocus={(e) => e.target.select()}
      />
      <span id={descriptionId} className="sr-only">
        {t('Read-only keeper search for ')}
        {strategyName}
        {t('. Copy it into the in-game chart search.')}
      </span>
      <button
        aria-label={t('Copy {v0} keeper search', { v0: strategyName })}
        onClick={async () => {
          const result = await writeClipboardText(regex)
          if (!result.ok) {
            setCopied(false)
            setCopyMessage(`${result.detail} Select the keeper search and copy it manually.`)
            return
          }
          setCopyMessage('Keeper search copied.')
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '✓' : t('Copy')}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {ui(copyMessage)}
      </span>
    </div>
  )
}

export function StrategiesPanel({
  activeId,
  pool,
  borders,
  onSelect,
  layoutChoice,
  onLayoutChoice,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(activeId)

  return (
    <section className="strategies" aria-labelledby="strategies-title">
      <h3 id="strategies-title" className="panel-title">
        {t('Strategies')}
        {activeId && <span className="strat-live-badge">{t('ACTIVE')}</span>}
      </h3>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        {t(
          'Curated community strategies. Picking one overrides your reward weights and steers the solver until you switch it off.',
        )}
      </div>

      <button
        className={`strat-card strat-none ${activeId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="strat-name">{t('None (manual)')}</span>
        <span className="strat-tagline">
          {t('Use your own reward weights in Solver Settings, next to Solve.')}
        </span>
      </button>

      {STRATEGIES.map((s) => {
        const isActive = activeId === s.id
        const isOpen = expanded === s.id
        return (
          <div key={s.id} className={`strat-card ${isActive ? 'active' : ''}`}>
            <button
              className="strat-head"
              onClick={() => setExpanded(isOpen ? null : s.id)}
              title={t('Show details')}
            >
              <span className="strat-name">
                {s.name}
                {s.badge && <span className="strat-badge-new">{ui(s.badge)}</span>}
              </span>
              <span className="strat-tagline">{ui(s.tagline)}</span>
            </button>
            {isOpen && (
              <div className="strat-body">
                <ul className="strat-guide">
                  {s.guide.map((g, i) => (
                    <li key={i}>{ui(g)}</li>
                  ))}
                </ul>
                {s.source.url ? (
                  <a
                    className="strat-source"
                    href={s.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ▶ {ui(s.source.label)}
                  </a>
                ) : (
                  <span className="strat-source">{ui(s.source.label)}</span>
                )}
                {s.extraLinks?.map((l) => (
                  <a
                    key={l.url}
                    className="strat-source strat-extra-link"
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🔗 {ui(l.label)}
                  </a>
                ))}
              </div>
            )}
            {(isActive || isOpen) &&
              s.layouts &&
              (() => {
                const chosen =
                  s.layouts.find((layout) => layout.id === layoutChoice?.[s.id]) ?? s.layouts[0]
                return (
                  <div className="strat-layouts">
                    <div className="strat-layouts-row">
                      <label className="strat-layouts-label" htmlFor={`strategy-layout-${s.id}`}>
                        {t('Layout')}
                      </label>
                      <select
                        id={`strategy-layout-${s.id}`}
                        value={chosen.id}
                        onChange={(event) => onLayoutChoice?.(s.id, event.target.value)}
                      >
                        {s.layouts.map((layout) => (
                          <option key={layout.id} value={layout.id}>
                            {ui(layout.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="strat-layouts-hint muted">{ui(chosen.hint)}</div>
                  </div>
                )
              })()}
            {(isActive || isOpen) && s.searchRegex && (
              <RegexRow regex={s.searchRegex} strategyId={s.id} strategyName={s.name} />
            )}
            {(isActive || isOpen) && <Readiness strategy={s} pool={pool} borders={borders} />}
            <button
              className={`strat-use ${isActive ? 'on' : ''}`}
              onClick={() => onSelect(isActive ? null : s.id)}
            >
              {isActive ? t('✓ Active - click to turn off') : t('Set active strategy')}
            </button>
          </div>
        )
      })}
    </section>
  )
}
