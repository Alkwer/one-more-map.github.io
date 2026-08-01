import {
  RARE_IMPLICITS,
  defaultStrategyReservations,
  type StrategyDef,
  type StrategyReservationGroup,
  type StrategyReservationPreferences,
} from '../data/strategies'
import type { ChartData } from '../types'

type StrategyReservations = Pick<StrategyDef, 'allowRareImplicits' | 'reservationGroups'>

const DIVINE_RARE_RESERVATION: StrategyReservationGroup = {
  id: 'divine',
  label: 'Divine strategies',
  modIds: [...RARE_IMPLICITS],
}

const matchesReservation = (
  chart: ChartData,
  reservation: StrategyReservationGroup,
): boolean => {
  const modIds = reservation.modIds ?? []
  const areaTypes = reservation.areaTypes ?? []
  return (
    chart.modIds.some((id) => modIds.includes(id)) ||
    (!!chart.areaType && areaTypes.includes(chart.areaType))
  )
}

export function selectStrategySolvePool(
  pool: ChartData[],
  strategy: StrategyReservations | null,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
  lockedUids: ReadonlySet<string> = new Set(),
): { solvePool: ChartData[]; heldBack: number; heldBackFor: string[] } {
  const configuredGroups = strategy?.reservationGroups ?? []
  const enabledReservations = configuredGroups.filter(
    (reservation) => preferences[reservation.id],
  )

  // Preserve the historical protection for rare-implicit charts in manual and
  // non-Divine strategies. Low-investment strategies already include those
  // charts in their broader Divine reservation group.
  if (
    preferences.divine &&
    !strategy?.allowRareImplicits &&
    !configuredGroups.some((reservation) => reservation.id === 'divine')
  ) {
    enabledReservations.push(DIVINE_RARE_RESERVATION)
  }

  const matchedLabels = new Set<string>()
  const solvePool = pool.filter((chart) => {
    if (lockedUids.has(chart.uid)) return true
    const matched = enabledReservations.filter((reservation) =>
      matchesReservation(chart, reservation),
    )
    matched.forEach((reservation) => matchedLabels.add(reservation.label))
    return matched.length === 0
  })

  return {
    solvePool,
    heldBack: pool.length - solvePool.length,
    heldBackFor: enabledReservations
      .filter((reservation) => matchedLabels.has(reservation.label))
      .map((reservation) => reservation.label),
  }
}
