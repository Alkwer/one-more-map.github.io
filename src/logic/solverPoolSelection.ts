import {
  DIVINE_RARE_RESERVATIONS,
  MANUAL_STRATEGY_RESERVATIONS,
  defaultStrategyReservations,
  type StrategyDef,
  type StrategyReservationPreferences,
} from '../data/strategies'
import { chartValue } from './chartRanking'
import { selectPieceBank, strategyWantsChart } from './pieceKeeps'
import type { ChartData, Weights } from '../types'

export const KEEP_BEST_CHARTS = 9

type StrategyReservations = Pick<
  StrategyDef,
  'allowRareImplicits' | 'allowFractureCharts' | 'reservationGroups'
> &
  Partial<Pick<StrategyDef, 'id'>>

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

const selectLegacyStrategySolvePool = (
  eligiblePool: ChartData[],
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences,
) => {
  const matchedLabels = new Set<string>()
  const configuredGroups = strategy
    ? (strategy.reservationGroups ?? [])
    : MANUAL_STRATEGY_RESERVATIONS
  const enabledReservations = configuredGroups.filter((reservation) => preferences[reservation.id])

  if (!strategy?.allowRareImplicits) {
    DIVINE_RARE_RESERVATIONS.forEach((fallback) => {
      if (
        preferences[fallback.id] &&
        !configuredGroups.some((reservation) => reservation.id === fallback.id)
      ) {
        enabledReservations.push(fallback)
      }
    })
  }

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

export function selectStrategySolvePool(
  eligiblePool: ChartData[],
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
  lockedUids: ReadonlySet<string> = new Set(),
  pieceKeeps?: Record<string, number>,
): { solvePool: ChartData[]; heldBack: number; heldBackFor: string[] } {
  if (pieceKeeps === undefined) {
    return selectLegacyStrategySolvePool(eligiblePool, strategy, preferences)
  }
  const bank = selectPieceBank(eligiblePool, pieceKeeps ?? {}, preferences)
  const heldFor = new Set<string>()

  const solvePool = eligiblePool.filter((chart) => {
    if (lockedUids.has(chart.uid)) return true
    const owner = bank.get(chart.uid)
    if (!owner || owner.strategyId === strategy?.id) return true
    if (strategyWantsChart(strategy?.id, chart, pieceKeeps)) return true
    heldFor.add(owner.strategyName)
    return false
  })

  return {
    solvePool,
    heldBack: eligiblePool.length - solvePool.length,
    heldBackFor: [...heldFor],
  }
}

export function selectFillerPool(
  eligiblePool: ChartData[],
  weights: Weights,
  disabledMods: ReadonlySet<string>,
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
  pieceKeeps?: Record<string, number>,
): ChartData[] {
  const keep = new Set<string>()
  eligiblePool.forEach((chart) => chart.preserved && keep.add(chart.uid))
  const exactValues = new Map(
    eligiblePool.map((chart) => [chart.uid, chartValue(chart, weights, disabledMods)]),
  )
  ;[...eligiblePool]
    .sort(
      (left, right) =>
        exactValues.get(right.uid)! - exactValues.get(left.uid)! ||
        left.uid.localeCompare(right.uid),
    )
    .slice(0, KEEP_BEST_CHARTS)
    .forEach((chart) => keep.add(chart.uid))

  const strategySafePool = selectStrategySolvePool(
    eligiblePool,
    strategy,
    preferences,
    keep,
    pieceKeeps,
  ).solvePool
  return strategySafePool.filter((chart) => !keep.has(chart.uid))
}
