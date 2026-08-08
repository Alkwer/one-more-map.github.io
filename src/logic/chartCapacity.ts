import { MAX_POOL_CHARTS } from './storage'

export interface ChartAdditionResult {
  added: number
  skipped: number
}

/** Plan an interactive addition against the same hard limit enforced by the reducer. */
export function chartAdditionResult(
  currentChartCount: number,
  requestedChartCount: number,
): ChartAdditionResult {
  const requested = Math.max(0, Math.floor(requestedChartCount))
  const available = Math.max(0, MAX_POOL_CHARTS - currentChartCount)
  const added = Math.min(available, requested)
  return { added, skipped: requested - added }
}

export function shouldCloseOnboardingAfterDemo(result: ChartAdditionResult): boolean {
  return result.added > 0 && result.skipped === 0
}
