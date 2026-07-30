import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBestModRegex } from '../logic/regex'
import { isChartShapeResolved } from '../logic/chartShapes'
import type { SolverResult } from '../logic/solver'
import { createSolverStateKey } from '../logic/solverRequestKeys'
import {
  isWorkerRequestCancelled,
  SolverWorkerClient,
} from '../logic/solverWorkerClient'
import type { AppState } from '../logic/storage'
import type { AdjacencyMode } from '../logic/scoring'
import type { Board, ConnectivityMode } from '../types'
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
  onApply: (board: Board) => void
}

interface KeyedResults {
  key: string
  results: SolverResult[]
}

interface KeyedNote {
  key: string
  text: string
}

interface BusyRequest {
  key: string
  requestId: number
}

export function SolverPanel({ state, activeStrategy, onPatch, onApply }: Props) {
  const [regexCap, setRegexCap] = useState(50)
  const [copied, setCopied] = useState(false)
  const [busyRequest, setBusyRequest] = useState<BusyRequest | null>(null)
  const [resultState, setResultState] = useState<KeyedResults>({
    key: '',
    results: [],
  })
  const [noteState, setNoteState] = useState<KeyedNote>({
    key: '',
    text: '',
  })
  const clientRef = useRef<SolverWorkerClient | null>(null)
  const nextRequestId = useRef(1)
  const latestRequestId = useRef(0)
  if (clientRef.current === null) clientRef.current = new SolverWorkerClient()
  // while a strategy is active it overrides the manual weights everywhere here
  const weights = activeStrategy ? activeStrategy.weights : state.weights
  const eligiblePool = useMemo(
    () => state.pool.filter(isChartShapeResolved),
    [state.pool],
  )
  const unresolvedShapeCount = state.pool.length - eligiblePool.length
  const solveKey = useMemo(
    () =>
      createSolverStateKey(
        { ...state, pool: eligiblePool },
        weights,
        activeStrategy?.id ?? null,
      ),
    [
      eligiblePool,
      state.borders,
      state.mode,
      state.allowRotation,
      state.adjacencyMode,
      state.adjacentAffectsSelf,
      state.disabledMods,
      weights,
      activeStrategy?.id,
    ],
  )
  const latestSolveKey = useRef(solveKey)
  latestSolveKey.current = solveKey
  const busy = busyRequest?.key === solveKey
  const results =
    resultState.key === solveKey ? resultState.results : []
  const solveNote = noteState.key === solveKey ? noteState.text : ''

  useEffect(
    () => () => {
      clientRef.current?.cancel()
    },
    [solveKey],
  )
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

  const run = () => {
    const requestKey = solveKey
    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ key: requestKey, requestId })
    setResultState({ key: requestKey, results: [] })
    setNoteState({ key: requestKey, text: '' })
    // strategy reservations: hold back charts another strategy is saving for
    const reserve = activeStrategy?.reserveModIds
    const reserveNames = activeStrategy?.reserveNames
    const solvePool = eligiblePool.filter(
      (chart) =>
        !(reserve?.length &&
          chart.modIds.some((id) => reserve.includes(id))) &&
        !(reserveNames?.length &&
          reserveNames.some((name) =>
            chart.name.toLowerCase().includes(name.toLowerCase()),
          )),
    )
    const heldBack = eligiblePool.length - solvePool.length

    clientRef.current!
      .solve({
        pool: solvePool,
        borders: state.borders,
        weights,
        options: {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: [...state.disabledMods],
          topK: 5,
          strategyRules: activeStrategy?.rules,
          strategyLayout: activeStrategy?.layout,
          strategyLayoutPenalty: activeStrategy?.layoutPenalty,
        },
      })
      .then((res) => {
        setBusyRequest((current) =>
          current?.requestId === requestId ? null : current,
        )
        if (
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setResultState({ key: requestKey, results: res })
        const notes: string[] = []
        if (heldBack > 0)
          notes.push(`${heldBack} juice chart${heldBack === 1 ? '' : 's'} held back for Meatfish/Ethereal.`)
        if (solvePool.length < 9)
          notes.push(`Only ${solvePool.length} spare charts - not enough for a full board.`)
        else if (res.length && !res[0].valid)
          notes.push('No fully reachable layout from these charts - best partial shown.')
        setNoteState({ key: requestKey, text: notes.join(' ') })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) =>
          current?.requestId === requestId ? null : current,
        )
        if (
          isWorkerRequestCancelled(error) ||
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          key: requestKey,
          text: `Solver failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      })
  }

  // build a throwaway "filler" voyage from your lowest-value spare charts, holding
  // back your best KEEP_BEST charts and anything you've locked (🔒) so they survive
  const runFiller = () => {
    const requestKey = solveKey
    setNoteState({ key: requestKey, text: '' })
    const disabled = new Set(state.disabledMods)
    const keep = new Set<string>()
    eligiblePool.forEach((chart) => chart.preserved && keep.add(chart.uid))
    ;[...eligiblePool]
      .sort(
        (a, b) =>
          displayValue(b, weights, disabled) -
          displayValue(a, weights, disabled),
      )
      .slice(0, KEEP_BEST)
      .forEach((chart) => keep.add(chart.uid))
    const fillerPool = eligiblePool.filter((chart) => !keep.has(chart.uid))
    if (fillerPool.length < 9) {
      setResultState({ key: requestKey, results: [] })
      setNoteState({
        key: requestKey,
        text: `Only ${fillerPool.length} spare chart${fillerPool.length === 1 ? '' : 's'} - need 9 outside your best ${KEEP_BEST} and locked charts to build a filler voyage.`,
      })
      return
    }

    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ key: requestKey, requestId })
    setResultState({ key: requestKey, results: [] })
    clientRef.current!
      .solve({
        pool: fillerPool,
        borders: state.borders,
        weights,
        options: {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: [...disabled],
          topK: 5,
          minimizeReward: true,
        },
      })
      .then((res) => {
        setBusyRequest((current) =>
          current?.requestId === requestId ? null : current,
        )
        if (
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setResultState({ key: requestKey, results: res })
        setNoteState({
          key: requestKey,
          text: res[0]?.valid
            ? 'Filler voyage: lowest-value fully reachable board from your spare charts (your best & locked charts untouched).'
            : 'No fully reachable filler layout from your spare charts.',
        })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) =>
          current?.requestId === requestId ? null : current,
        )
        if (
          isWorkerRequestCancelled(error) ||
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          key: requestKey,
          text: `Solver failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        })
      })
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

      <details className="weights-panel">
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

      <button className="primary" onClick={run} disabled={busy || eligiblePool.length === 0}>
        {busy ? 'Solving…' : `Solve (${eligiblePool.length} charts)`}
      </button>
      <button
        className="filler-btn"
        onClick={runFiller}
        disabled={busy || eligiblePool.length < 10}
        title="Build a throwaway voyage from your lowest-value spare charts, keeping your best and locked charts for a real run"
      >
        🗑 Filler voyage (spare charts)
      </button>
      {unresolvedShapeCount > 0 && (
        <div className="shape-warning small-note">
          {unresolvedShapeCount} chart{unresolvedShapeCount === 1 ? '' : 's'} excluded until its
          shape is confirmed in the library.
        </div>
      )}
      {solveNote && <div className="muted small-note">{solveNote}</div>}
      {eligiblePool.length > 9 || state.allowRotation ? (
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
                <span>{r.reward.toFixed(1)} pts</span>
                {!r.valid && <span className="badge bad">not fully reachable</span>}
              </button>
            ))}
          </div>
          <div className="muted small-note">
            Ranked by your weights and estimated mod values. Click a result to load it.
          </div>
        </>
      )}
    </div>
  )
}
