import { useState } from 'react'
import { solve, type SolverResult } from '../logic/solver'
import type { AppState } from '../logic/storage'
import { RARE_IMPLICITS } from '../data/strategies'
import type { StrategyDef } from '../data/strategies'

interface Props {
  state: AppState
  /** curated strategy currently overriding weights, or null for manual */
  activeStrategy: StrategyDef | null
  results: SolverResult[]
  /** which result is currently loaded on the board, or null */
  appliedIdx: number | null
  onResults: (r: SolverResult[]) => void
  onApply: (r: SolverResult, idx: number) => void
}

/** The front-and-centre solve control: sits under the board, above
 *  "Copy into game", so solve → pick a result → copy is one straight line. */
export function SolveBar({ state, activeStrategy, results, appliedIdx, onResults, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [solveNote, setSolveNote] = useState('')
  const weights = activeStrategy ? activeStrategy.weights : state.weights

  const run = () => {
    setBusy(true)
    setSolveNote('')
    // let the UI paint the busy state before the (synchronous) solve
    window.setTimeout(() => {
      try {
        // strategy reservations: hold back charts another strategy is saving for
        const reserve = activeStrategy?.reserveModIds
        const reserveAreaTypes = activeStrategy?.reserveAreaTypes
        // locked charts sitting on the board are pinned to their exact cell -
        // the solver arranges everything else around them (issue #9)
        const locked = state.board.map((placement) => {
          if (!placement) return null
          const chart = state.pool.find((c) => c.uid === placement.chartUid)
          return chart?.preserved ? { ...placement } : null
        })
        const lockedUids = new Set(locked.filter(Boolean).map((p) => p!.chartUid))
        // rare-implicit charts are Divine-strategy fuel: everything else
        // (manual mode included) leaves them in the library
        const raresAllowed = activeStrategy?.allowRareImplicits ?? false
        const isRareImplicit = (c: (typeof state.pool)[number]) =>
          c.modIds.some((id) => (RARE_IMPLICITS as readonly string[]).includes(id))
        const solvePool = state.pool.filter(
          (c) =>
            lockedUids.has(c.uid) ||
            ((raresAllowed || !isRareImplicit(c)) &&
              !(reserve?.length && c.modIds.some((id) => reserve.includes(id))) &&
              !(
                reserveAreaTypes?.length &&
                c.areaType &&
                reserveAreaTypes.includes(c.areaType)
              )),
        )
        const raresHeld = raresAllowed
          ? 0
          : state.pool.filter((c) => !lockedUids.has(c.uid) && isRareImplicit(c)).length
        const heldBack = state.pool.length - solvePool.length - raresHeld
        const res = solve(solvePool, state.borders, weights, {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: new Set(state.disabledMods),
          topK: 5,
          strategyRules: activeStrategy?.rules,
          strategyLayout: activeStrategy?.layout,
          strategyLayoutPenalty: activeStrategy?.layoutPenalty,
          locked,
        })
        onResults(res)
        // loading the best result right away saves the extra click - the
        // alternatives stay one click away in the strip below
        if (res.length > 0) onApply(res[0], 0)
        const notes: string[] = []
        const lockedCount = locked.filter(Boolean).length
        if (lockedCount > 0)
          notes.push(`${lockedCount} locked chart${lockedCount === 1 ? '' : 's'} kept in place.`)
        if (raresHeld > 0)
          notes.push(`${raresHeld} rare-implicit chart${raresHeld === 1 ? '' : 's'} saved for the Divine strategies.`)
        if (heldBack > 0)
          notes.push(`${heldBack} juice chart${heldBack === 1 ? '' : 's'} held back for Meatfish/Ethereal.`)
        if (solvePool.length < 9)
          notes.push(`Only ${solvePool.length} spare charts - not enough for a full board.`)
        else if (res.length && !res[0].valid)
          notes.push('No fully runnable layout from these charts - best partial shown.')
        setSolveNote(notes.join(' '))
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  return (
    <div className="solve-bar">
      <button className="solve-big" onClick={run} disabled={busy || state.pool.length === 0}>
        {busy ? (
          'Solving…'
        ) : (
          <>
            ⚙ Solve
            <span className="solve-big-sub">
              best board from {state.pool.length} chart{state.pool.length === 1 ? '' : 's'}
              {activeStrategy ? ` · ${activeStrategy.name}` : ''}
            </span>
          </>
        )}
      </button>
      {solveNote && <div className="muted small-note solve-bar-note">{solveNote}</div>}
      {results.length > 0 && (
        <>
          <div className="solve-results">
            {results.map((r, i) => (
              <button
                key={i}
                className={`solve-result ${appliedIdx === i ? 'applied' : ''} ${r.valid ? '' : 'invalid'}`}
                onClick={() => onApply(r, i)}
                title={
                  r.valid
                    ? 'Load this layout onto the board'
                    : 'Not fully runnable (connector or reachability problem) - shown for reference'
                }
              >
                <span className="sr-rank">#{i + 1}</span>
                <span className="sr-pts">{r.reward.toFixed(1)}</span>
                <span className="sr-pts-label">pts</span>
                {appliedIdx === i ? (
                  <span className="sr-badge on-board">on board</span>
                ) : r.valid ? (
                  <span className="sr-badge ok">✓ runnable</span>
                ) : (
                  <span className="sr-badge bad">✗ not runnable</span>
                )}
              </button>
            ))}
          </div>
          <div className="muted small-note solve-bar-note">
            Ranked by your weights - click one to load it, then Copy into game below.
          </div>
        </>
      )}
    </div>
  )
}
