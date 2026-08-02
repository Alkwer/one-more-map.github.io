import {
  MEATFISH_FUEL,
  RARE_IMPLICITS,
  defaultStrategyReservations,
  type StrategyDef,
  type StrategyReservationGroup,
  type StrategyReservationPreferences,
} from '../data/strategies'
import { voyageModById } from '../data/mods'
import type { ChartData } from '../types'

/** how many rare-implicit charts are worth banking for the Divine strategies -
 *  the Divine board wants 5, so 6 is a full kit plus one spare */
export const RARE_BACKLOG = 6

const isRareImplicit = (c: ChartData) =>
  c.modIds.some((id) => (RARE_IMPLICITS as readonly string[]).includes(id))

/** best rare tier on the chart (60% adjacent > 30% adjacent > 25% voyage) */
const rareTier = (c: ChartData) =>
  Math.max(
    0,
    ...c.modIds
      .filter((id) => (RARE_IMPLICITS as readonly string[]).includes(id))
      .map((id) => voyageModById.get(id)?.effects[0]?.percent ?? 0),
  )

const rewardSum = (c: ChartData) => (c.rewards ?? []).reduce((s, e) => s + e.percent, 0)

/** The N best rare-implicit charts, the ones worth holding for the Divine
 *  strategies. Extras beyond the backlog are ordinary spendable charts. */
export function selectRareBacklog(pool: ChartData[], cap = RARE_BACKLOG): Set<string> {
  return new Set(
    pool
      .filter(isRareImplicit)
      .sort(
        (a, b) =>
          rareTier(b) - rareTier(a) || rewardSum(b) - rewardSum(a) || b.level - a.level,
      )
      .slice(0, cap)
      .map((c) => c.uid),
  )
}

type StrategyReservations = Pick<
  StrategyDef,
  'allowRareImplicits' | 'allowFractureCharts' | 'reservationGroups'
>

const DIVINE_RARE_RESERVATION: StrategyReservationGroup = {
  id: 'divine',
  label: 'Divine strategies',
  modIds: [...RARE_IMPLICITS],
}

const MEATFISH_FRACTURE_RESERVATION: StrategyReservationGroup = {
  id: 'meatfish',
  label: 'Meatfish',
  modIds: [...MEATFISH_FUEL],
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

  // Rare Fracture charts are Meatfish fuel the same way: hold them back in
  // manual mode and every strategy that isn't Meatfish itself. Alc & Go and
  // Speedrun already carry them inside their configured Meatfish group.
  if (
    preferences.meatfish &&
    !strategy?.allowFractureCharts &&
    !configuredGroups.some((reservation) => reservation.id === 'meatfish')
  ) {
    enabledReservations.push(MEATFISH_FRACTURE_RESERVATION)
  }

  // only the best few rare-implicit charts are Divine backlog; the extras
  // shed their rare ids for matching so no reservation banks them
  const backlog = selectRareBacklog(pool)
  const forMatching = (chart: ChartData): ChartData =>
    !isRareImplicit(chart) || backlog.has(chart.uid)
      ? chart
      : {
          ...chart,
          modIds: chart.modIds.filter(
            (id) => !(RARE_IMPLICITS as readonly string[]).includes(id),
          ),
        }

  const matchedLabels = new Set<string>()
  const solvePool = pool.filter((chart) => {
    if (lockedUids.has(chart.uid)) return true
    const candidate = forMatching(chart)
    const matched = enabledReservations.filter((reservation) =>
      matchesReservation(candidate, reservation),
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
