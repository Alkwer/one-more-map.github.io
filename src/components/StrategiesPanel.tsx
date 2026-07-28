import { useState } from 'react'
import { STRATEGIES, type StrategyDef } from '../data/strategies'
import type { ChartData } from '../types'

interface Props {
  activeId: string | null
  pool: ChartData[]
  onSelect: (id: string | null) => void
}

/** per-requirement tally of what the library can supply */
function pieceStatus(s: StrategyDef, pool: ChartData[]) {
  return (s.requirements ?? []).map((req) => {
    const have = pool.filter((c) => c.modIds.some((id) => req.modIds.includes(id))).length
    return { ...req, have, missing: Math.max(0, req.count - have) }
  })
}

function Readiness({ strategy, pool }: { strategy: StrategyDef; pool: ChartData[] }) {
  const reqs = pieceStatus(strategy, pool)
  if (reqs.length === 0) return null
  const missing = reqs.filter((r) => r.missing > 0)
  if (missing.length > 0) {
    return (
      <div className="strat-notready">
        ⚠ You don't have the pieces - avoid this voyage and wait. Missing:{' '}
        {missing.map((m) => `${m.missing}× ${m.label}`).join(', ')}.
        {strategy.waitHint ? ` ${strategy.waitHint}` : ''}
      </div>
    )
  }
  return (
    <div className="strat-ready">
      ✓ Pieces ready: {reqs.map((r) => `${r.have}× ${r.label}`).join(', ')}
    </div>
  )
}

/**
 * Curated strategies. Selecting one OVERRIDES the manual reward weights and
 * adds placement rules that shape what the solver suggests. Its own section so
 * it's obvious when a strategy - not your sliders - is steering results.
 */
export function StrategiesPanel({ activeId, pool, onSelect }: Props) {
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
                <a className="strat-source" href={s.source.url} target="_blank" rel="noopener noreferrer">
                  ▶ {s.source.label}
                </a>
              </div>
            )}
            {(isActive || isOpen) && <Readiness strategy={s} pool={pool} />}
            <button
              className={`strat-use ${isActive ? 'on' : ''}`}
              onClick={() => onSelect(isActive ? null : s.id)}
            >
              {isActive ? '✓ Active - click to turn off' : 'Use this strategy'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
