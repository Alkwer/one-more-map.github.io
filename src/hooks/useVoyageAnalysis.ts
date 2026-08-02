import { useMemo } from 'react'
import { borderModById, voyageModById } from '../data/mods'
import { strategyById } from '../data/strategies'
import { appraiseBorders } from '../logic/borderAppraisal'
import { isChartShapeResolved } from '../logic/chartShapes'
import { checkConnectivity } from '../logic/connectivity'
import { scoreBoard } from '../logic/scoring'
import type { AppState } from '../logic/storage'
import { evaluateCurrentBoardStrategies } from '../logic/strategySuggestions'
import { decideVoyage } from '../logic/voyageDecision'
import { borderTouches } from '../types'
import { useStrategyInventory } from './useStrategyInventory'

const isNotable = (text: string) => !/^\d+% (increased|more|reduced) /i.test(text)

export function useVoyageAnalysis(state: AppState) {
  const chartMap = useMemo(
    () => new Map(state.pool.map((chart) => [chart.uid, chart])),
    [state.pool],
  )
  const resolvedPool = useMemo(() => state.pool.filter(isChartShapeResolved), [state.pool])
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
    }),
    [scoreOptions, state.mode, state.allowRotation, state.strategyReservations, state.pieceKeeps],
  )
  const {
    inventory: strategyInventory,
    loading: strategyInventoryLoading,
    error: strategyInventoryError,
  } = useStrategyInventory(resolvedPool, state.borders, strategyEvaluationOptions)
  const strategySuggestions = useMemo(
    () =>
      evaluateCurrentBoardStrategies(
        strategyInventory,
        state.board,
        state.borders,
        chartMap,
        scoreOptions,
      ),
    [strategyInventory, state.board, state.borders, chartMap, scoreOptions],
  )
  const activeStrategyEvaluation = activeStrategy
    ? (strategySuggestions.evaluations.find(
        (evaluation) => evaluation.strategy.id === activeStrategy.id,
      ) ?? null)
    : null
  const borderAppraisal = useMemo(
    () =>
      activeStrategyEvaluation?.appraisal ??
      appraiseBorders(state.board, state.borders, chartMap, effectiveWeights, scoreOptions),
    [
      activeStrategyEvaluation,
      state.board,
      state.borders,
      chartMap,
      effectiveWeights,
      scoreOptions,
    ],
  )
  const voyageDecision = useMemo(
    () =>
      decideVoyage({
        evaluations: strategySuggestions.evaluations,
        activeStrategyId: activeStrategy?.id ?? null,
        availableCharts: strategySuggestions.availableCharts,
        enteredBorders: strategySuggestions.enteredBorders,
        rerollsUsed: state.borderRerollsUsed,
      }),
    [
      strategySuggestions.evaluations,
      strategySuggestions.availableCharts,
      strategySuggestions.enteredBorders,
      activeStrategy?.id,
      state.borderRerollsUsed,
    ],
  )
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
    resolvedPool,
    disabledSet,
    activeStrategy,
    effectiveWeights,
    score,
    strategyInventoryLoading,
    strategyInventoryError,
    strategySuggestions,
    borderAppraisal,
    voyageDecision,
    connectivity,
    modCount,
    notables,
  }
}
