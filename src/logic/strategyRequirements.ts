import type { StrategyDef } from '../data/strategies'
import type { Borders, ChartData } from '../types'
import { borderTouches } from '../types'

export type StrategyRequirement = NonNullable<StrategyDef['requirements']>[number]

export interface StrategyRequirementAllocation {
  requirement: StrategyRequirement
  required: number
  chartUids: string[]
  missing: number
}

export interface StrategyRequirementAllocationResult {
  allocations: StrategyRequirementAllocation[]
  allocatedUids: string[]
}

const CORNER_TILES = new Set([0, 2, 6, 8])
const BOARD_CAPACITY = 9

/** Resolve a strategy requirement against the best matching rolled border tile. */
export function requiredCountFor(requirement: StrategyRequirement, borders: Borders): number {
  const dynamic = requirement.countByBorderNeighbours
  if (!dynamic) return requirement.count

  let bestNeighbours = 0
  borders.forEach((modId, segment) => {
    if (modId !== dynamic.borderId) return
    const tile = borderTouches(segment)
    bestNeighbours = Math.max(bestNeighbours, CORNER_TILES.has(tile) ? 2 : 3)
  })

  if (bestNeighbours === 2) return dynamic.two
  if (bestNeighbours === 3) return dynamic.three
  return requirement.count
}

export function chartMatchesRequirement(
  chart: ChartData,
  requirement: StrategyRequirement,
): boolean {
  return Boolean(
    (requirement.modIds && chart.modIds.some((id) => requirement.modIds!.includes(id))) ||
    (requirement.nameMatch &&
      chart.name.toLowerCase().includes(requirement.nameMatch.toLowerCase())) ||
    (requirement.areaTypes && chart.areaType && requirement.areaTypes.includes(chart.areaType)),
  )
}

interface RequirementSlot {
  requirementIndex: number
  candidateUids: string[]
}

/**
 * Assign physical charts to requirement slots. Each UID has unit capacity, and
 * the augmenting-path matcher can move a broad match aside for a scarcer one.
 * Requirement order and lexical UID order make both allocations and shortages
 * deterministic. No strategy can claim more charts than fit on one board.
 */
export function allocateStrategyRequirements(
  requirements: readonly StrategyRequirement[],
  pool: readonly ChartData[],
  borders: Borders,
): StrategyRequirementAllocationResult {
  const uniqueCharts = [...new Map(pool.map((chart) => [chart.uid, chart])).values()].sort(
    (left, right) => (left.uid < right.uid ? -1 : left.uid > right.uid ? 1 : 0),
  )
  const requiredCounts = requirements.map((requirement) => requiredCountFor(requirement, borders))
  const slots: RequirementSlot[] = requirements.flatMap((requirement, requirementIndex) =>
    Array.from({ length: requiredCounts[requirementIndex] }, () => ({
      requirementIndex,
      candidateUids: uniqueCharts
        .filter((chart) => chartMatchesRequirement(chart, requirement))
        .map((chart) => chart.uid),
    })),
  )

  const uidToSlot = new Map<string, number>()
  const slotToUid: (string | null)[] = Array(slots.length).fill(null)

  const augment = (slotIndex: number, visitedUids: Set<string>): boolean => {
    for (const uid of slots[slotIndex].candidateUids) {
      if (visitedUids.has(uid)) continue
      visitedUids.add(uid)

      const occupiedBy = uidToSlot.get(uid)
      if (occupiedBy !== undefined && !augment(occupiedBy, visitedUids)) continue

      uidToSlot.set(uid, slotIndex)
      slotToUid[slotIndex] = uid
      return true
    }
    return false
  }

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    if (uidToSlot.size >= BOARD_CAPACITY) break
    augment(slotIndex, new Set())
  }

  const chartUidsByRequirement = requirements.map(() => [] as string[])
  slotToUid.forEach((uid, slotIndex) => {
    if (uid) chartUidsByRequirement[slots[slotIndex].requirementIndex].push(uid)
  })

  const allocations = requirements.map((requirement, requirementIndex) => {
    const chartUids = chartUidsByRequirement[requirementIndex]
    const required = requiredCounts[requirementIndex]
    return {
      requirement,
      required,
      chartUids,
      missing: Math.max(0, required - chartUids.length),
    }
  })

  return {
    allocations,
    allocatedUids: allocations.flatMap((allocation) => allocation.chartUids),
  }
}
