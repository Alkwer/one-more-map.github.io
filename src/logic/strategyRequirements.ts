import type { StrategyDef } from '../data/strategies'
import type { Borders } from '../types'
import { borderTouches } from '../types'

export type StrategyRequirement = NonNullable<StrategyDef['requirements']>[number]

const CORNER_TILES = new Set([0, 2, 6, 8])

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
