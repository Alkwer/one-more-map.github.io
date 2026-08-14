import type { StrategyDef } from '../data/strategies'
import type { Borders, ChartData, ConnectivityMode } from '../types'
import { selectSolverEligibleCharts } from './chartShapes'
import { allocateStrategyRequirements } from './strategyRequirements'
import { chartMeetsStrategyPreflight, strategyPreflightLabel } from './strategyPreflight'

export interface StrategyRequirementReadiness {
  label: string
  have: number
  need: number
  missing: number
}

export interface StrategyReadiness {
  ready: boolean
  have: number
  need: number
  ratio: number
  missing: string[]
  requirements: StrategyRequirementReadiness[]
}

const enabledBorders = (borders: Borders, disabledMods?: ReadonlySet<string>): Borders =>
  borders.map((modId) => (modId && disabledMods?.has(modId) ? null : modId)) as Borders

export function strategyReadiness(
  strategy: StrategyDef,
  pool: ChartData[],
  borders: Borders,
  mode: ConnectivityMode = 'strict',
  disabledMods?: ReadonlySet<string>,
): StrategyReadiness {
  let have = 0
  let need = 0
  const missing: string[] = []
  const requirements: StrategyRequirementReadiness[] = []
  const effectiveBorders = enabledBorders(borders, disabledMods)

  const solverEligiblePool = selectSolverEligibleCharts(pool, mode)
  const eligiblePool = solverEligiblePool.filter((chart) =>
    chartMeetsStrategyPreflight(chart, strategy),
  )
  const allocation = allocateStrategyRequirements(
    strategy.requirements ?? [],
    eligiblePool,
    effectiveBorders,
  )
  for (const entry of allocation.allocations) {
    const count = entry.chartUids.length
    have += count
    need += entry.required
    requirements.push({
      label: entry.requirement.label,
      have: count,
      need: entry.required,
      missing: entry.missing,
    })
    if (entry.missing > 0) missing.push(`${entry.missing}× ${entry.requirement.label}`)
  }

  if (strategy.minimumChartQuantity !== undefined) {
    const required = 9
    const count = Math.min(required, eligiblePool.length)
    const label = strategyPreflightLabel(strategy)!
    have += count
    need += required
    requirements.push({ label, have: count, need: required, missing: required - count })
    if (count < required) missing.push(`${required - count}× ${label}`)
  }

  if (strategy.requiresBorderId) {
    need += 1
    const hasBorder = effectiveBorders.includes(strategy.requiresBorderId.id)
    if (hasBorder) have += 1
    else missing.push(strategy.requiresBorderId.label)
    requirements.push({
      label: strategy.requiresBorderId.label,
      have: hasBorder ? 1 : 0,
      need: 1,
      missing: hasBorder ? 0 : 1,
    })
  }

  return {
    ready: missing.length === 0,
    have,
    need,
    ratio: need === 0 ? 1 : have / need,
    missing,
    requirements,
  }
}
