import { useState } from 'react'
import { STRATEGIES, type StrategyDef } from '../data/strategies'
import { strategyReadiness } from '../logic/strategySuggestions'
import type { Borders, ChartData } from '../types'

interface Props {
  activeId: string | null
  pool: ChartData[]
  borders: Borders
  onSelect: (id: string | null) => void
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
        Missing requirements: {readiness.missing.join(', ')}.
      </div>
    )
  }
  return (
    <div className="strat-ready">
      ✓ Requirements met:{' '}
      {readiness.requirements
        .map(
          (r) =>
            `${Math.min(r.have, r.need)}/${r.need} ${r.label}${
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
function RegexRow({ regex }: { regex: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="strat-regex-row">
      <span className="strat-regex-label" title="Paste into the in-game chart search to highlight this strategy's keeper charts">
        Keeper search
      </span>
      <input readOnly value={regex} onFocus={(e) => e.target.select()} />
      <button
        onClick={() => {
          navigator.clipboard.writeText(regex).catch(() => {})
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  )
}

export function StrategiesPanel({ activeId, pool, borders, onSelect }: Props) {
  const [expanded, setExpanded] = useState<string | null>(activeId)

  return (
    <div className="strategies">
      <div className="panel-title">
        Strategies
        {activeId && <span className="strat-live-badge">ACTIVE</span>}
      </div>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        Curated community strategies. Picking one overrides your reward weights and steers the
        solver until you switch it off.
      </div>

      <button
        className={`strat-card strat-none ${activeId === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="strat-name">None (manual)</span>
        <span className="strat-tagline">Use your own reward weights below.</span>
      </button>

      {STRATEGIES.map((s) => {
        const isActive = activeId === s.id
        const isOpen = expanded === s.id
        return (
          <div key={s.id} className={`strat-card ${isActive ? 'active' : ''}`}>
            <button
              className="strat-head"
              onClick={() => setExpanded(isOpen ? null : s.id)}
              title="Show details"
            >
              <span className="strat-name">{s.name}</span>
              <span className="strat-tagline">{s.tagline}</span>
            </button>
            {isOpen && (
              <div className="strat-body">
                <ul className="strat-guide">
                  {s.guide.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                {s.source.url ? (
                  <a className="strat-source" href={s.source.url} target="_blank" rel="noopener noreferrer">
                    ▶ {s.source.label}
                  </a>
                ) : (
                  <span className="strat-source">{s.source.label}</span>
                )}
              </div>
            )}
            {(isActive || isOpen) && s.searchRegex && <RegexRow regex={s.searchRegex} />}
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
    </div>
  )
}
