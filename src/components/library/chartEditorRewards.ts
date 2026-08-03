import type { ChartData } from '../../types'

export function updateImportedReward(
  chart: ChartData,
  rewardIndex: number,
  percent: number,
): ChartData {
  if (!chart.rewards?.[rewardIndex] || !Number.isFinite(percent)) return chart
  return {
    ...chart,
    rewards: chart.rewards.map((reward, index) =>
      index === rewardIndex ? { ...reward, percent } : reward,
    ),
  }
}
