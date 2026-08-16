import type { ChartData } from '../types'

export interface DedupeResult {
  /** charts that are genuinely new to the library */
  fresh: ChartData[]
  /** how many incoming charts were re-scans of charts already held */
  skipped: number
}

/**
 * Re-running the bulk importer re-copies every chart still in the game tab,
 * so an incoming chart whose import fingerprint matches one already in the
 * library is a RE-SCAN of the same physical item, not a second copy. The
 * parser's rawText deliberately omits structural fields, so the fingerprint
 * includes those parsed fields as well to avoid collapsing distinct charts.
 * Matching is count-aware: copies beyond what the library already holds still
 * import, so owning two genuinely identical physical charts keeps working.
 */
export function dedupeNewCharts(pool: ChartData[], incoming: ChartData[]): DedupeResult {
  const held = new Map<string, number>()
  for (const chart of pool) {
    const key = chartImportFingerprint(chart)
    if (!key) continue
    held.set(key, (held.get(key) ?? 0) + 1)
  }
  const fresh: ChartData[] = []
  let skipped = 0
  for (const chart of incoming) {
    const key = chartImportFingerprint(chart)
    if (!key) {
      // No importer-derived remainder to compare: never guess, always keep.
      fresh.push(chart)
      continue
    }
    const remaining = held.get(key) ?? 0
    if (remaining > 0) {
      held.set(key, remaining - 1)
      skipped++
    } else {
      fresh.push(chart)
    }
  }
  return { fresh, skipped }
}

function chartImportFingerprint(chart: ChartData): string | undefined {
  if (!chart.rawText) return undefined
  return JSON.stringify([
    chart.name,
    chart.level,
    chart.edges,
    chart.areaType ?? null,
    chart.modIds,
    chart.implicitText ?? null,
    chart.rewards?.map(({ stat, percent }) => [stat, percent]) ?? [],
    chart.shape ?? null,
    chart.shapeResolved ?? null,
    chart.shapeInput ?? null,
    chart.rawText,
  ])
}
