import { useMemo, useState } from 'react'
import { buildBestModRegex } from '../logic/regex'
import { solve, type SolverResult } from '../logic/solver'
import type { AppState } from '../logic/storage'
import type { AdjacencyMode } from '../logic/scoring'
import type { Board, ConnectivityMode } from '../types'
import { ALL_STATS, STAT_LABELS } from '../types'

interface Props {
  state: AppState
  onPatch: (p: Partial<AppState>) => void
  results: SolverResult[]
  onResults: (r: SolverResult[]) => void
  onApply: (board: Board) => void
}

export function SolverPanel({ state, onPatch, results, onResults, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [regexCap, setRegexCap] = useState(50)
  const [copied, setCopied] = useState(false)
  const bestRegex = useMemo(() => buildBestModRegex(state.weights, regexCap), [state.weights, regexCap])

  const copyRegex = async () => {
    try {
      await navigator.clipboard.writeText(bestRegex.regex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* user can select the text manually */
    }
  }

  const run = () => {
    setBusy(true)
    // let the UI paint the busy state before the (synchronous) solve
    window.setTimeout(() => {
      try {
        const res = solve(state.pool, state.borders, state.weights, {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          topK: 5,
        })
        onResults(res)
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <div className="solver">
      <div className="panel-title">Solver</div>

      <div className="field">
        <label>Connector rule</label>
        <select
          value={state.mode}
          onChange={(e) => onPatch({ mode: e.target.value as ConnectivityMode })}
        >
          <option value="connected">All charts must connect</option>
          <option value="strict">Strict: every connector must match</option>
          <option value="any">Ignore connectors</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.allowRotation}
          onChange={(e) => onPatch({ allowRotation: e.target.checked })}
        />
        Charts can be rotated
      </label>

      <div className="field">
        <label>Adjacent modifiers reach</label>
        <select
          value={state.adjacencyMode}
          onChange={(e) => onPatch({ adjacencyMode: e.target.value as AdjacencyMode })}
        >
          <option value="physical">Any neighbouring area</option>
          <option value="connected">Only connected neighbours</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.adjacentAffectsSelf}
          onChange={(e) => onPatch({ adjacentAffectsSelf: e.target.checked })}
        />
        Adjacent modifiers also affect their own area
      </label>

      <div className="panel-title small">Reward weights</div>
      <div className="weights">
        {ALL_STATS.map((s) => (
          <div key={s} className="weight-row">
            <span>{STAT_LABELS[s]}</span>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={state.weights[s]}
              onChange={(e) =>
                onPatch({ weights: { ...state.weights, [s]: parseInt(e.target.value, 10) } })
              }
            />
            <span className="weight-val">{state.weights[s]}</span>
          </div>
        ))}
      </div>

      <button className="primary" onClick={run} disabled={busy || state.pool.length === 0}>
        {busy ? 'Solving…' : `Solve (${state.pool.length} charts)`}
      </button>
      {state.pool.length > 9 || state.allowRotation ? (
        <div className="muted small-note">Large pool / rotation → heuristic search (near-optimal)</div>
      ) : (
        <div className="muted small-note">Pool ≤ 9 charts → exhaustive search (optimal)</div>
      )}

      <div className="panel-title small">Best-Charts Regex</div>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        Paste into the in-game chart search to highlight charts worth taking, based on your
        weights above. No import needed. Experimental: the in-game search may or may not
        support this syntax, we'll see once live.
      </div>
      <div className="regex-row">
        <input readOnly value={bestRegex.regex} onFocus={(e) => e.target.select()} />
        <button onClick={copyRegex}>{copied ? '✓' : 'Copy'}</button>
      </div>
      <div className="regex-meta">
        <span className="muted">
          {bestRegex.included.length} mods · {bestRegex.regex.length} chars
        </span>
        <span className="spacer" />
        <label className="muted">
          max{' '}
          <select value={regexCap} onChange={(e) => setRegexCap(parseInt(e.target.value, 10))}>
            <option value={50}>50</option>
            <option value={250}>250</option>
          </select>
        </label>
      </div>

      {results.length > 0 && (
        <>
          <div className="panel-title small">Results</div>
          <div className="results">
            {results.map((r, i) => (
              <button key={i} className={`result ${r.valid ? '' : 'invalid'}`} onClick={() => onApply(r.board)}>
                <span>#{i + 1}</span>
                <span>{r.score.toFixed(1)} pts</span>
                {!r.valid && <span className="badge bad">connectors invalid</span>}
              </button>
            ))}
          </div>
          <div className="muted small-note">Click a result to load it onto the board.</div>
        </>
      )}
    </div>
  )
}
