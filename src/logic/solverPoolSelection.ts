import type { StrategyDef } from '../data/strategies'
import { displayChartValue } from './chartRanking'
import type { ChartData, Weights } from '../types'

export const KEEP_BEST_CHARTS = 9

type StrategyReservations = Pick<StrategyDef, 'reserveModIds' | 'reserveNames' | 'reserveAreaTypes'>

export function selectStrategySolvePool(
  eligiblePool: ChartData[],
  strategy: StrategyReservations | null,
): { solvePool: ChartData[]; heldBack: number } {
  const reserveModIds = strategy?.reserveModIds
  const reserveNames = strategy?.reserveNames
  const reserveAreaTypes = strategy?.reserveAreaTypes
  const solvePool = eligiblePool.filter(
    (chart) =>
      !(reserveModIds?.length && chart.modIds.some((id) => reserveModIds.includes(id))) &&
      !(
        reserveNames?.length &&
        reserveNames.some((name) => chart.name.toLowerCase().includes(name.toLowerCase()))
      ) &&
      !(reserveAreaTypes?.length && chart.areaType && reserveAreaTypes.includes(chart.areaType)),
  )

  return { solvePool, heldBack: eligiblePool.length - solvePool.length }
}

export function selectFillerPool(
  eligiblePool: ChartData[],
  weights: Weights,
  disabledMods: ReadonlySet<string>,
): ChartData[] {
  const keep = new Set<string>()
  eligiblePool.forEach((chart) => chart.preserved && keep.add(chart.uid))
  ;[...eligiblePool]
    .sort(
      (left, right) =>
        displayChartValue(right, weights, disabledMods) -
        displayChartValue(left, weights, disabledMods),
    )
    .slice(0, KEEP_BEST_CHARTS)
    .forEach((chart) => keep.add(chart.uid))

  return eligiblePool.filter((chart) => !keep.has(chart.uid))
}
