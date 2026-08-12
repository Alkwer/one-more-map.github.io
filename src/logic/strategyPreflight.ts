import { voyageModById } from '../data/mods'
import type { StrategyDef } from '../data/strategies'
import type { ChartData } from '../types'

export function chartQuantity(chart: ChartData): number {
  if (chart.rewards?.length) {
    return chart.rewards.reduce(
      (total, reward) => total + (reward.stat === 'quantity' ? reward.percent : 0),
      0,
    )
  }

  return chart.modIds.reduce((total, id) => {
    const modifier = voyageModById.get(id)
    if (modifier?.scope !== 'self') return total
    return (
      total +
      modifier.effects.reduce(
        (sum, effect) => sum + (effect.stat === 'quantity' ? effect.percent : 0),
        0,
      )
    )
  }, 0)
}

export function chartMeetsStrategyPreflight(
  chart: ChartData,
  strategy: Pick<StrategyDef, 'minimumChartQuantity'>,
): boolean {
  return (
    strategy.minimumChartQuantity === undefined ||
    chartQuantity(chart) >= strategy.minimumChartQuantity
  )
}

export function strategyPreflightLabel(
  strategy: Pick<StrategyDef, 'minimumChartQuantity'>,
): string | null {
  return strategy.minimumChartQuantity === undefined
    ? null
    : `${strategy.minimumChartQuantity}%+ Item Quantity charts`
}
