import { useEffect, useMemo, useState } from 'react'
import { borderModById, voyageModById } from '../data/mods'
import { strategyById } from '../data/strategies'
import type { BorderAppraisal } from '../logic/borderAppraisal'
import { selectSolverEligibleCharts } from '../logic/chartShapes'
import { checkConnectivity } from '../logic/connectivity'
import { clampRerollsUsed, REROLL_COSTS, sulphurSpentAfter } from '../logic/rerollAdvice'
import { scoreBoard } from '../logic/scoring'
import type { AppState } from '../logic/storage'
import type { StrategySuggestionResult } from '../logic/strategySuggestions'
import type { VoyageDecision } from '../logic/voyageDecision'
import { borderTouches } from '../types'
import { useStrategyInventory } from './useStrategyInventory'

const isNotable = (text: string) => !/^\d+% (increased|more|reduced) /i.test(text)

export function useVoyageAnalysis(state: AppState) {
  const chartMap = useMemo(
    () => new Map(state.pool.map((chart) => [chart.uid, chart])),
    [state.pool],
  )
  const solverEligiblePool = useMemo(
    () => selectSolverEligibleCharts(state.pool, state.mode),
    [state.pool, state.mode],
  )
  const disabledSet = useMemo(() => new Set(state.disabledMods), [state.disabledMods])
  const activeStrategy = state.strategyId ? (strategyById.get(state.strategyId) ?? null) : null
  const effectiveWeights = activeStrategy ? activeStrategy.weights : state.weights
  const scoreOptions = useMemo(
    () => ({
      adjacencyMode: state.adjacencyMode,
      adjacentAffectsSelf: state.adjacentAffectsSelf,
      disabledMods: disabledSet,
    }),
    [state.adjacencyMode, state.adjacentAffectsSelf, disabledSet],
  )
  const score = useMemo(
    () => scoreBoard(state.board, state.borders, chartMap, effectiveWeights, scoreOptions),
    [state.board, state.borders, chartMap, effectiveWeights, scoreOptions],
  )
  const strategyEvaluationOptions = useMemo(
    () => ({
      ...scoreOptions,
      mode: state.mode,
      allowRotation: state.allowRotation,
      strategyReservations: state.strategyReservations,
      pieceKeeps: state.pieceKeeps,
      layoutChoice: state.layoutChoice,
    }),
    [
      scoreOptions,
      state.mode,
      state.allowRotation,
      state.strategyReservations,
      state.pieceKeeps,
      state.layoutChoice,
    ],
  )
  const {
    inventory: strategyInventory,
    loading: strategyInventoryLoading,
    error: strategyInventoryError,
  } = useStrategyInventory(solverEligiblePool, state.borders, strategyEvaluationOptions)
  const pendingSuggestions = useMemo<StrategySuggestionResult>(
    () => ({
      suggestions: [],
      evaluations: [],
      enteredBorders: strategyInventory.enteredBorders,
      availableCharts: strategyInventory.availableCharts,
      placedCharts: state.board.filter(Boolean).length,
      hasEvidence: strategyInventory.hasEvidence,
    }),
    [state.board, strategyInventory],
  )
  const pendingBorderAppraisal = useMemo<BorderAppraisal>(() => {
    const placedCharts = state.board.filter(Boolean).length
    const enteredBorders = state.borders.filter(Boolean).length
    return {
      score: 0,
      ceiling: 0,
      fit: null,
      status: placedCharts === 0 || enteredBorders === 0 ? 'empty' : 'incomplete',
      placedCharts,
      enteredBorders,
      relevantSegments: 0,
      activeSegments: 0,
      attentionSegments: 0,
      perStat: Object.fromEntries(
        Object.keys(score.perStat).map((stat) => [stat, 0]),
      ) as BorderAppraisal['perStat'],
      segments: [],
      rollForecast: null,
    }
  }, [score.perStat, state.board, state.borders])
  const pendingVoyageDecision = useMemo<VoyageDecision>(() => {
    const rerollsUsed = clampRerollsUsed(state.borderRerollsUsed)
    return {
      kind: 'needs-data',
      decisionBasis: 'insufficient-data',
      label: 'Add charts and borders',
      reason: 'Strategy analysis loads after the app has evidence to compare.',
      strategyId: null,
      strategyName: null,
      recommendationTier: null,
      fit: null,
      missing: [],
      action: null,
      rerollsUsed,
      remainingRerolls: REROLL_COSTS.length - rerollsUsed,
      spent: sulphurSpentAfter(rerollsUsed),
      nextCost: REROLL_COSTS[rerollsUsed] ?? null,
      keepModelPercentileLine: null,
      preserveRoll: false,
      rollForecast: null,
    }
  }, [state.borderRerollsUsed])
  const [advanced, setAdvanced] = useState<{
    strategySuggestions: StrategySuggestionResult
    borderAppraisal: BorderAppraisal
    voyageDecision: VoyageDecision
  } | null>(null)
  const [advancedError, setAdvancedError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setAdvanced(null)
    setAdvancedError(null)
    if (strategyInventoryLoading || strategyInventoryError || !strategyInventory.hasEvidence) {
      return () => {
        active = false
      }
    }

    void Promise.all([
      import('../logic/strategySuggestions'),
      import('../logic/borderAppraisal'),
      import('../logic/voyageDecision'),
    ])
      .then(([suggestionsModule, appraisalModule, decisionModule]) => {
        if (!active) return
        const strategySuggestions = suggestionsModule.evaluateCurrentBoardStrategies(
          strategyInventory,
          state.board,
          state.borders,
          chartMap,
          scoreOptions,
        )
        const activeStrategyEvaluation = activeStrategy
          ? (strategySuggestions.evaluations.find(
              (evaluation) => evaluation.strategy.id === activeStrategy.id,
            ) ?? null)
          : null
        const borderAppraisal =
          activeStrategyEvaluation?.appraisal ??
          appraisalModule.appraiseBorders(
            state.board,
            state.borders,
            chartMap,
            effectiveWeights,
            scoreOptions,
          )
        const voyageDecision = decisionModule.decideVoyage({
          evaluations: strategySuggestions.evaluations,
          activeStrategyId: activeStrategy?.id ?? null,
          availableCharts: strategySuggestions.availableCharts,
          enteredBorders: strategySuggestions.enteredBorders,
          rerollsUsed: state.borderRerollsUsed,
        })
        setAdvanced({ strategySuggestions, borderAppraisal, voyageDecision })
      })
      .catch((error: unknown) => {
        if (!active) return
        setAdvancedError(
          error instanceof Error ? error.message : 'Advanced strategy analysis could not load.',
        )
      })

    return () => {
      active = false
    }
  }, [
    activeStrategy,
    chartMap,
    effectiveWeights,
    scoreOptions,
    state.board,
    state.borderRerollsUsed,
    state.borders,
    strategyInventory,
    strategyInventoryError,
    strategyInventoryLoading,
  ])
  const strategySuggestions = advanced?.strategySuggestions ?? pendingSuggestions
  const borderAppraisal = advanced?.borderAppraisal ?? pendingBorderAppraisal
  const voyageDecision = advanced?.voyageDecision ?? pendingVoyageDecision
  const advancedLoading =
    strategyInventoryLoading ||
    (strategyInventory.hasEvidence && !strategyInventoryError && !advancedError && !advanced)
  const connectivity = useMemo(
    () => checkConnectivity(state.board, chartMap, state.mode),
    [state.board, chartMap, state.mode],
  )
  const modCount = useMemo(() => {
    let self = 0
    let adjacent = 0
    let global = 0
    for (const placement of state.board) {
      if (!placement) continue
      const chart = chartMap.get(placement.chartUid)
      if (!chart) continue
      for (const id of chart.modIds) {
        const modifier = voyageModById.get(id)
        if (!modifier) continue
        if (modifier.scope === 'adjacent') adjacent++
        else if (modifier.scope === 'global') global++
        else self++
      }
    }
    return { self, adjacent, global, total: self + adjacent + global }
  }, [state.board, chartMap])
  const notables = useMemo(() => {
    const counts = new Map<string, { label: string; full: string; count: number }>()
    const add = (key: string, label: string, full: string) => {
      const current = counts.get(key)
      if (current) current.count++
      else counts.set(key, { label, full, count: 1 })
    }
    state.borders.forEach((id, segment) => {
      if (!id || !state.board[borderTouches(segment)]) return
      const modifier = borderModById.get(id)
      if (modifier && isNotable(modifier.text)) {
        add(modifier.id, modifier.short ?? modifier.text, modifier.text)
      }
    })
    state.board.forEach((placement) => {
      if (!placement) return
      const chart = chartMap.get(placement.chartUid)
      if (!chart) return
      for (const modifierId of chart.modIds) {
        const modifier = voyageModById.get(modifierId)
        if (modifier && isNotable(modifier.text)) {
          add(modifier.id, modifier.text, modifier.text)
        }
      }
    })
    return [...counts.values()]
  }, [state.borders, state.board, chartMap])

  return {
    chartMap,
    solverEligiblePool,
    disabledSet,
    activeStrategy,
    effectiveWeights,
    score,
    strategyInventoryLoading: advancedLoading,
    strategyInventoryError: strategyInventoryError ?? advancedError,
    strategySuggestions,
    borderAppraisal,
    voyageDecision,
    connectivity,
    modCount,
    notables,
  }
}
