import {
  defaultStrategyReservations,
  type StrategyDef,
  type StrategyReservationPreferences,
} from '../data/strategies'
import { displayChartValue } from './chartRanking'
import type { ChartData, Weights } from '../types'

export const KEEP_BEST_CHARTS = 9

type StrategyReservations = Pick<StrategyDef, 'reservationGroups'>

const matchesReservation = (
  chart: ChartData,
  reservation: NonNullable<StrategyDef['reservationGroups']>[number],
): boolean => {
  const modIds = reservation.modIds ?? []
  const nameMatches = reservation.nameMatches ?? []
  const areaTypes = reservation.areaTypes ?? []
  return (
    chart.modIds.some((id) => modIds.includes(id)) ||
    nameMatches.some((name) => chart.name.toLowerCase().includes(name.toLowerCase())) ||
    (!!chart.areaType && areaTypes.includes(chart.areaType))
  )
}

export function selectStrategySolvePool(
  eligiblePool: ChartData[],
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
): { solvePool: ChartData[]; heldBack: number; heldBackFor: string[] } {
  const matchedLabels = new Set<string>()
  const enabledReservations = (strategy?.reservationGroups ?? []).filter(
    (reservation) => preferences[reservation.id],
  )
  const solvePool = eligiblePool.filter((chart) => {
    const matched = enabledReservations.filter((reservation) =>
      matchesReservation(chart, reservation),
    )
    matched.forEach((reservation) => matchedLabels.add(reservation.label))
    return matched.length === 0
  })

  return {
    solvePool,
    heldBack: eligiblePool.length - solvePool.length,
    heldBackFor: enabledReservations
      .filter((reservation) => matchedLabels.has(reservation.label))
      .map((reservation) => reservation.label),
  }
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
