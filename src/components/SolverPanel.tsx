import { useMemo, useState } from 'react'
import type { StrategyDef } from '../data/strategies'
import { selectSolverEligibleCharts } from '../logic/chartShapes'
import {
  buildBestModRegex,
  detectSearchClientLanguage,
  MAX_CHART_SEARCH_LENGTH,
  type SearchClientLanguage,
} from '../logic/regex'
import { writeClipboardText } from '../logic/clipboard'
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
  const [regexCap, setRegexCap] = useState(MAX_CHART_SEARCH_LENGTH)
  const [searchLanguageOverride, setSearchLanguageOverride] = useState<SearchClientLanguage | null>(
    null,
  )
  const [copied, setCopied] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  // While a strategy is active it overrides the manual weights everywhere here.
  const weights = activeStrategy ? activeStrategy.weights : state.weights
  const eligiblePool = useMemo(
    () => selectSolverEligibleCharts(state.pool, state.mode),
    [state.pool, state.mode],
  )
  const unresolvedShapeCount = state.pool.length - eligiblePool.length
  const searchLanguage = searchLanguageOverride ?? detectSearchClientLanguage(state.pool)
  const { busy, results, solveNote, run, runFiller } = useSolverRequests({
    state,
    activeStrategy,
    weights,
    eligiblePool,
  })
  const bestRegex = useMemo(
    () => buildBestModRegex(weights, regexCap, new Set(state.disabledMods), searchLanguage),
    [weights, regexCap, state.disabledMods, searchLanguage],
  )

  const copyRegex = async () => {
    if (!bestRegex.ok) {
      setCopied(false)
      setCopyMessage(bestRegex.message)
      return
    }
    const result = await writeClipboardText(bestRegex.regex)
    if (!result.ok) {
      setCopied(false)
      setCopyMessage(`${result.detail} Select the best-charts regex and copy it manually.`)
      return
    }
    setCopyMessage('Best-charts regex copied.')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
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
        language={searchLanguage}
        supported={bestRegex.ok}
        unsupportedMessage={bestRegex.ok ? '' : bestRegex.message}
        copied={copied}
        onCopy={copyRegex}
        onRegexCapChange={setRegexCap}
        onLanguageChange={setSearchLanguageOverride}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {copyMessage}
      </span>

      <SolverResults results={results} onApply={onApply} />
    </section>
  )
}
