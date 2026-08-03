import type { StrategyChartMatcher, StrategyDef, StrategyPosition } from '../data/strategies'
import type { Board, Borders, ChartData, Placement } from '../types'
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
const BOARD_CELLS = Array.from({ length: BOARD_CAPACITY }, (_, index) => index)
const CELL_NEIGHBOURS: number[][] = BOARD_CELLS.map((index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  const neighbours: number[] = []
  if (row > 0) neighbours.push(index - 3)
  if (row < 2) neighbours.push(index + 3)
  if (column > 0) neighbours.push(index - 1)
  if (column < 2) neighbours.push(index + 1)
  return neighbours
})

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

export function chartMatchesStrategyMatcher(
  chart: ChartData,
  matcher: StrategyChartMatcher,
): boolean {
  return Boolean(
    (matcher.modIds && chart.modIds.some((id) => matcher.modIds!.includes(id))) ||
    (matcher.nameMatch && chart.name.toLowerCase().includes(matcher.nameMatch.toLowerCase())) ||
    (matcher.areaTypes && chart.areaType && matcher.areaTypes.includes(chart.areaType)),
  )
}

export function chartMatchesRequirement(
  chart: ChartData,
  requirement: StrategyRequirement,
): boolean {
  return chartMatchesStrategyMatcher(chart, requirement)
}

/** Resolve a static or border-relative position. Null means every board cell. */
export function resolveStrategyPositionCells(
  position: StrategyPosition,
  borders: Borders,
): number[] | null {
  if (position.cells) {
    return [...new Set(position.cells.filter((cell) => cell >= 0 && cell < BOARD_CAPACITY))]
  }
  if (!position.nearBorderId) return null

  const touched: number[] = []
  borders.forEach((modId, segment) => {
    if (modId === position.nearBorderId) touched.push(borderTouches(segment))
  })
  if (!position.adjacentToBorder) return [...new Set(touched)]

  const adjacent = new Set<number>()
  for (const cell of touched) {
    for (const neighbour of CELL_NEIGHBOURS[cell]) adjacent.add(neighbour)
  }
  return [...adjacent]
}

interface RequirementSlot {
  requirementIndex: number
  candidateUids: string[]
}

interface BoardRequirementSlot {
  requirement: StrategyRequirement
  allowedCells: number[]
}

interface BoardRequirementCandidate {
  cell: number
  chartUid: string
}

export interface StrategyRequirementPlacement {
  cell: number
  chartUid: string
}

function boardRequirementSlots(
  requirements: readonly StrategyRequirement[],
  borders: Borders,
): BoardRequirementSlot[] {
  return requirements.flatMap((requirement) => {
    const allowedCells = resolveStrategyPositionCells(requirement, borders) ?? BOARD_CELLS
    return Array.from({ length: requiredCountFor(requirement, borders) }, () => ({
      requirement,
      allowedCells,
    }))
  })
}

function findCompleteBoardAssignment(
  candidatesBySlot: readonly BoardRequirementCandidate[][],
): BoardRequirementCandidate[] | null {
  if (candidatesBySlot.length > BOARD_CAPACITY) return null

  const slotOrder = candidatesBySlot
    .map((candidates, slotIndex) => ({ slotIndex, candidates: candidates.length }))
    .sort((left, right) => left.candidates - right.candidates || left.slotIndex - right.slotIndex)
  const assignment: (BoardRequirementCandidate | null)[] = Array(candidatesBySlot.length).fill(null)
  const usedCells = new Set<number>()
  const usedUids = new Set<string>()

  const assign = (orderIndex: number): boolean => {
    if (orderIndex === slotOrder.length) return true
    const slotIndex = slotOrder[orderIndex].slotIndex
    for (const candidate of candidatesBySlot[slotIndex]) {
      if (usedCells.has(candidate.cell) || usedUids.has(candidate.chartUid)) continue
      usedCells.add(candidate.cell)
      usedUids.add(candidate.chartUid)
      assignment[slotIndex] = candidate
      if (assign(orderIndex + 1)) return true
      assignment[slotIndex] = null
      usedCells.delete(candidate.cell)
      usedUids.delete(candidate.chartUid)
    }
    return false
  }

  return assign(0) ? (assignment as BoardRequirementCandidate[]) : null
}

/** Every required slot must map to a distinct chart UID in an allowed cell. */
export function boardSatisfiesStrategyRequirements(
  requirements: readonly StrategyRequirement[],
  board: Board,
  charts: ReadonlyMap<string, ChartData>,
  borders: Borders,
): boolean {
  const slots = boardRequirementSlots(requirements, borders)
  if (slots.length === 0) return true

  const candidatesBySlot = slots.map((slot) =>
    slot.allowedCells.flatMap((cell) => {
      const placement = board[cell]
      const chart = placement ? charts.get(placement.chartUid) : null
      return chart && chartMatchesRequirement(chart, slot.requirement)
        ? [{ cell, chartUid: chart.uid }]
        : []
    }),
  )
  return findCompleteBoardAssignment(candidatesBySlot) !== null
}

/**
 * Find one feasible set of mandatory placements before heuristic search. Pool
 * order controls which interchangeable charts are tried first, so shuffled
 * restarts can explore different valid compositions without weakening the
 * emitted-board invariant.
 */
export function assignStrategyRequirementsToCells(
  requirements: readonly StrategyRequirement[],
  pool: readonly ChartData[],
  borders: Borders,
  locked: readonly (Placement | null)[],
): StrategyRequirementPlacement[] | null {
  const slots = boardRequirementSlots(requirements, borders)
  if (slots.length === 0) return []
  if (slots.length > BOARD_CAPACITY) return null

  const uniqueCharts = [...new Map(pool.map((chart) => [chart.uid, chart])).values()]
  const chartsByUid = new Map(uniqueCharts.map((chart) => [chart.uid, chart]))
  const lockedUids = new Set(locked.filter(Boolean).map((placement) => placement!.chartUid))
  const candidatesBySlot = slots.map((slot) =>
    slot.allowedCells.flatMap((cell) => {
      const lockedPlacement = locked[cell]
      if (lockedPlacement) {
        const chart = chartsByUid.get(lockedPlacement.chartUid)
        return chart && chartMatchesRequirement(chart, slot.requirement)
          ? [{ cell, chartUid: chart.uid }]
          : []
      }
      return uniqueCharts.flatMap((chart) =>
        !lockedUids.has(chart.uid) && chartMatchesRequirement(chart, slot.requirement)
          ? [{ cell, chartUid: chart.uid }]
          : [],
      )
    }),
  )

  return findCompleteBoardAssignment(candidatesBySlot)
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
