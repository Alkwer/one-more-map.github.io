import { useMemo, useState } from 'react'
import { buildBestModRegex } from '../logic/regex'
import { solve, type SolverResult } from '../logic/solver'
import type { AppState } from '../logic/storage'
import type { AdjacencyMode } from '../logic/scoring'
import type { ConnectivityMode } from '../types'
import { STRATEGY_RESERVATION_OPTIONS } from '../data/strategies'
import { selectPieceBank } from '../logic/pieceKeeps'
import type { StrategyDef } from '../data/strategies'
import { GROUP_LABEL, GROUP_ORDER, REWARD_TYPES } from '../logic/rewards'
import { displayValue } from './Library'

/** how many of your best charts to hold back from a filler voyage (one full board) */
const KEEP_BEST = 9

interface Props {
  state: AppState
  /** curated strategy currently overriding weights, or null for manual */
  activeStrategy: StrategyDef | null
  onPatch: (p: Partial<AppState>) => void
  onResults: (r: SolverResult[]) => void
  /** rendered inside the settings popup - shows a Done button that calls this */
  onClose?: () => void
}

export function SolverPanel({ state, activeStrategy, onPatch, onResults, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [regexCap, setRegexCap] = useState(50)
  const [copied, setCopied] = useState(false)
  const [solveNote, setSolveNote] = useState('')
  // while a strategy is active it overrides the manual weights everywhere here
  const weights = activeStrategy ? activeStrategy.weights : state.weights
  // the keep-count bank applies in every mode; each toggle switches its
  // strategies' banks off wholesale (the wizard's counts stay saved)
  const availableReservations = STRATEGY_RESERVATION_OPTIONS
  const bestRegex = useMemo(
    () => buildBestModRegex(weights, regexCap, new Set(state.disabledMods)),
    [weights, regexCap, state.disabledMods],
  )

  const copyRegex = async () => {
    try {
      await navigator.clipboard.writeText(bestRegex.regex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* user can select the text manually */
    }
  }

  // build a throwaway "filler" voyage from your lowest-value spare charts, holding
  // back your best KEEP_BEST charts and anything you've locked (🔒) so they survive
  const runFiller = () => {
    setBusy(true)
    setSolveNote('')
    window.setTimeout(() => {
      try {
        const disabled = new Set(state.disabledMods)
        const keep = new Set<string>()
        state.pool.forEach((c) => c.preserved && keep.add(c.uid))
        // banked keeper charts (per the keep counts) are never filler
        const bank = selectPieceBank(state.pool, state.pieceKeeps, state.strategyReservations)
        state.pool.forEach((c) => bank.has(c.uid) && keep.add(c.uid))
        ;[...state.pool]
          .sort((a, b) => displayValue(b, weights, disabled) - displayValue(a, weights, disabled))
          .slice(0, KEEP_BEST)
          .forEach((c) => keep.add(c.uid))
        // locked board charts stay pinned even in a filler board (issue #9) -
        // they're preserved, so running the voyage doesn't consume them
        const locked = state.board.map((placement) => {
          if (!placement) return null
          const chart = state.pool.find((c) => c.uid === placement.chartUid)
          return chart?.preserved ? { ...placement } : null
        })
        const lockedUids = new Set(locked.filter(Boolean).map((p) => p!.chartUid))
        const fillerPool = state.pool.filter((c) => lockedUids.has(c.uid) || !keep.has(c.uid))
        if (fillerPool.length < 9) {
          onResults([])
          setSolveNote(
            `Only ${fillerPool.length} spare chart${fillerPool.length === 1 ? '' : 's'} - need 9 outside your best ${KEEP_BEST} and locked charts to build a filler voyage.`,
          )
          return
        }
        const res = solve(fillerPool, state.borders, weights, {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: disabled,
          topK: 5,
          minimizeReward: true,
          locked,
        })
        onResults(res)
        setSolveNote(
          res[0]?.valid
            ? 'Filler voyage: lowest-value runnable board from your spare charts (your best & locked charts untouched). Results are under the board.'
            : 'No runnable filler layout from your spare charts.',
        )
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <div className="solver">
      <div className="panel-title">
        Solver Settings
        {onClose && (
          <>
            <span className="spacer" />
            <button onClick={onClose}>Done</button>
          </>
        )}
      </div>

      <div className="field">
        <label>Connector rule</label>
        <select
          value={state.mode}
          onChange={(e) => onPatch({ mode: e.target.value as ConnectivityMode })}
        >
          <option value="strict">Connectors must line up (real rule)</option>
          <option value="any">Ignore connectors (experiment)</option>
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

      {activeStrategy && (
        <div className="strat-override-note">
          ⚑ <strong>{activeStrategy.name}</strong> is steering the solver - your manual weights
          below are ignored while it's active.
        </div>
      )}

      {availableReservations.length > 0 && (
        <fieldset className="strategy-reservations">
          <legend>Protect charts for other strategies</legend>
          {availableReservations.map((option) => (
            <label className="check" key={option.id}>
              <input
                type="checkbox"
                name="strategy-reservation"
                value={option.id}
                checked={state.strategyReservations[option.id]}
                onChange={(event) =>
                  onPatch({
                    strategyReservations: {
                      ...state.strategyReservations,
                      [option.id]: event.target.checked,
                    },
                  })
                }
              />
              {option.label}
            </label>
          ))}
          <div className="muted small-note">
            Enabled categories keep their banked charts out of solve pools (counts set in the
            library's 🔖 wizard). A strategy always spends its own banked pieces.
          </div>
        </fieldset>
      )}

      {/* keyed remount: weights open themselves in manual mode (they ARE the
          mode), stay collapsed while a strategy overrides them */}
      <details
        key={activeStrategy ? 'overridden' : 'manual'}
        className="weights-panel"
        open={!activeStrategy}
      >
        <summary className="panel-title small weights-summary">
          Reward weights{activeStrategy ? ' (overridden)' : ''}
        </summary>
        <div className="muted small-note" style={{ marginTop: 0 }}>
          Your personal priorities - slide up what you value. Each reward is weighted on its own.
        </div>
        <div className={`weights ${activeStrategy ? 'weights-overridden' : ''}`}>
          {GROUP_ORDER.map((group) => {
          const rows = REWARD_TYPES.filter((r) => r.group === group)
          if (rows.length === 0) return null
          return (
            <div key={group} className="weight-group">
              <div className="weight-group-title">{GROUP_LABEL[group]}</div>
              {rows.map((r) => (
                <div key={r.key} className="weight-row">
                  <span className="weight-label">{r.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    disabled={!!activeStrategy}
                    value={state.weights[r.key] ?? r.default}
                    onChange={(e) =>
                      onPatch({ weights: { ...state.weights, [r.key]: parseInt(e.target.value, 10) } })
                    }
                  />
                  <span className="weight-val">{state.weights[r.key] ?? r.default}</span>
                </div>
              ))}
            </div>
          )
        })}
        </div>
      </details>

      <button
        className="filler-btn"
        onClick={runFiller}
        disabled={busy || state.pool.length < 10}
        title="Build a throwaway voyage from your lowest-value spare charts, keeping your best and locked charts for a real run"
      >
        {busy ? 'Solving…' : '🗑 Filler voyage (spare charts)'}
      </button>
      {solveNote && <div className="muted small-note">{solveNote}</div>}

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
    </div>
  )
}
