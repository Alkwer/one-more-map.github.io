import { voyageModById } from '../data/mods'
import type { ChartData, Weights } from '../types'
import { chartRewardKey, voyageRewardKey } from './rewards'

const SCOPE_REACH = { self: 1, adjacent: 3, global: 9 } as const

/** Heuristic worth of a chart under the current weights, used only for ranking. */
export function chartValue(
  chart: ChartData,
  weights: Weights,
  disabled: ReadonlySet<string>,
): number {
  let value = 0
  const hasImportedRewards = !!chart.rewards?.length

  for (const id of chart.modIds) {
    if (disabled.has(id)) continue
    const mod = voyageModById.get(id)
    if (!mod) continue
    if (mod.scope === 'self' && hasImportedRewards) continue
    const weight = weights[voyageRewardKey(mod)] ?? 0
    for (const effect of mod.effects) {
      value += weight * effect.percent * SCOPE_REACH[mod.scope]
    }
  }

  for (const effect of chart.rewards ?? []) {
    value += (weights[chartRewardKey(effect.stat)] ?? 0) * effect.percent
  }

  return value
}

/** Weighted worth scaled to the compact value displayed in the chart library. */
export function displayChartValue(
  chart: ChartData,
  weights: Weights,
  disabled: ReadonlySet<string>,
): number {
  return Math.round(chartValue(chart, weights, disabled) / 100)
}
