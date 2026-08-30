import { useId, useState } from 'react'
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
      <div className="strat-notready">Missing requirements: {readiness.missing.join(', ')}.</div>
    )
  }
  return (
    <div className="strat-ready">
      ✓ Requirements met:{' '}
      {readiness.requirements
        .map(
          (r) =>
            `${Math.min(r.have, r.need)}/${r.need}× ${r.label}${
              r.have > r.need ? ` (+${r.have - r.need} spare)` : ''
            }`,
        )
        .join(', ')}
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
        title="Paste into the in-game chart search to highlight this strategy's keeper charts"
      >
        Keeper search
      </label>
      <input
        id={inputId}
        readOnly
        value={regex}
        aria-describedby={descriptionId}
        onFocus={(e) => e.target.select()}
      />
      <span id={descriptionId} className="sr-only">
        Read-only keeper search for {strategyName}. Copy it into the in-game chart search.
      </span>
      <button
        aria-label={`Copy ${strategyName} keeper search`}
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
        {copied ? '✓' : 'Copy'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copyMessage}
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
  const detailsPrefix = useId()

  return (
    <section className="strategies" aria-labelledby="strategies-title">
      <h3 id="strategies-title" className="panel-title">
        Strategies
        {activeId && <span className="strat-live-badge">ACTIVE</span>}
      </h3>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        Curated community strategies. Picking one overrides your reward weights and steers the
        solver until you switch it off.
      </div>

      <button
        className={`strat-card strat-none ${activeId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="strat-name">None (manual)</span>
        <span className="strat-tagline">
          Use your own reward weights in Solver Settings, next to Solve.
        </span>
      </button>

      {STRATEGIES.map((s) => {
        const isActive = activeId === s.id
        const isOpen = expanded === s.id
        const headerId = `${detailsPrefix}-${s.id}-header`
        const detailsId = `${detailsPrefix}-${s.id}-details`
        return (
          <div key={s.id} className={`strat-card ${isActive ? 'active' : ''}`}>
            <button
              className="strat-head"
              id={headerId}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              onClick={() => setExpanded(isOpen ? null : s.id)}
              title="Show details"
            >
              <span className="strat-name">
                {s.name}
                {s.badge && <span className="strat-badge-new">{s.badge}</span>}
              </span>
              <span className="strat-tagline">{s.tagline}</span>
            </button>
            <div
              className="strat-body"
              id={detailsId}
              role="region"
              aria-labelledby={headerId}
              hidden={!isOpen}
            >
              <ul className="strat-guide">
                {s.guide.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
              {s.source.url ? (
                <a
                  className="strat-source"
                  href={s.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ▶ {s.source.label}
                </a>
              ) : (
                <span className="strat-source">{s.source.label}</span>
              )}
              {s.extraLinks?.map((l) => (
                <a
                  key={l.url}
                  className="strat-source strat-extra-link"
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🔗 {l.label}
                </a>
              ))}
            </div>
            {(isActive || isOpen) &&
              s.layouts &&
              (() => {
                const chosen =
                  s.layouts.find((layout) => layout.id === layoutChoice?.[s.id]) ?? s.layouts[0]
                return (
                  <div className="strat-layouts">
                    <div className="strat-layouts-row">
                      <label className="strat-layouts-label" htmlFor={`strategy-layout-${s.id}`}>
                        Layout
                      </label>
                      <select
                        id={`strategy-layout-${s.id}`}
                        value={chosen.id}
                        onChange={(event) => onLayoutChoice?.(s.id, event.target.value)}
                      >
                        {s.layouts.map((layout) => (
                          <option key={layout.id} value={layout.id}>
                            {layout.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="strat-layouts-hint muted">{chosen.hint}</div>
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
              {isActive ? '✓ Active - click to turn off' : 'Set active strategy'}
            </button>
          </div>
        )
      })}
    </section>
  )
}
