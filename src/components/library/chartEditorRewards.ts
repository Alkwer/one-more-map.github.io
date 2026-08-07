import type { ChartData } from '../../types'
import { MAX_REWARD_PERCENT } from '../../logic/storage'

export function updateImportedReward(
  chart: ChartData,
  rewardIndex: number,
  percent: number,
): ChartData {
  if (
    !chart.rewards?.[rewardIndex] ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > MAX_REWARD_PERCENT
  ) {
    return chart
  }
  return {
    ...chart,
    rewards: chart.rewards.map((reward, index) =>
      index === rewardIndex ? { ...reward, percent } : reward,
    ),
  }
}
