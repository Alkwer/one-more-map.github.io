import { newUid } from './chartUid'
import type { ImportParseResult } from './importParser'

/**
 * Worker module state is discarded when stale work is terminated. Assign final
 * ids in the long-lived UI realm so separate worker instances cannot reuse an id.
 */
export function assignImportChartUids(
  result: ImportParseResult,
  createUid: () => string = newUid,
): ImportParseResult {
  const uidMap = new Map<string, string>()
  const charts = result.charts.map((chart) => {
    const uid = createUid()
    uidMap.set(chart.uid, uid)
    return { ...chart, uid }
  })

  return {
    ...result,
    charts,
    unresolved: result.unresolved.map((entry) => ({
      ...entry,
      uid: uidMap.get(entry.uid) ?? entry.uid,
    })),
  }
}
