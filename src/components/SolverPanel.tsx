import { useMemo, useState } from 'react'
import type { StrategyDef } from '../data/strategies'
import { isChartShapeResolved } from '../logic/chartShapes'
import { buildBestModRegex } from '../logic/regex'
import type { AppState } from '../logic/storage'
import type { Board } from '../types'
import { useSolverRequests } from '../hooks/useSolverRequests'
import { BestChartsRegex } from './solver/BestChartsRegex'
import { SolverActions } from './solver/SolverActions'
import { SolverControls } from './solver/SolverControls'
import { SolverResults } from './solver/SolverResults'

interface Props {
  state: AppState
  /** curated strategy currently overriding weights, or null for manual */
  activeStrategy: StrategyDef | null
  onPatch: (patch: Partial<AppState>) => void
  onApply: (board: Board) => void
  onOpenPlanner?: () => void
}

export function SolverPanel({ state, activeStrategy, onPatch, onApply, onOpenPlanner }: Props) {
  const [regexCap, setRegexCap] = useState(50)
  const [copied, setCopied] = useState(false)
  // While a strategy is active it overrides the manual weights everywhere here.
  const weights = activeStrategy ? activeStrategy.weights : state.weights
  const eligiblePool = useMemo(() => state.pool.filter(isChartShapeResolved), [state.pool])
  const unresolvedShapeCount = state.pool.length - eligiblePool.length
  const { busy, results, solveNote, run, runFiller } = useSolverRequests({
    state,
    activeStrategy,
    weights,
    eligiblePool,
  })
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

  return (
    <section className="solver" aria-labelledby="solver-title">
      <h3 id="solver-title" className="panel-title">
        Solver
      </h3>

      <SolverControls state={state} activeStrategy={activeStrategy} onPatch={onPatch} />

      <SolverActions
        busy={busy}
        resultCount={results.length}
        solveNote={solveNote}
        eligibleChartCount={eligiblePool.length}
        unresolvedShapeCount={unresolvedShapeCount}
        allowRotation={state.allowRotation}
        onSolve={run}
        onFiller={runFiller}
        onOpenPlanner={onOpenPlanner}
      />

      <BestChartsRegex
        regex={bestRegex.regex}
        includedCount={bestRegex.included.length}
        regexCap={regexCap}
        copied={copied}
        onCopy={copyRegex}
        onRegexCapChange={setRegexCap}
      />

      <SolverResults results={results} onApply={onApply} />
    </section>
  )
}
