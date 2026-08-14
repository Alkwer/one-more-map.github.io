import type { BorderOcrParseResult } from './borderOcr'
import { parseBorderOcrPayload } from './borderOcr'
import { MAX_IMPORT_REJECTIONS } from './importBudget'
import { newUid, parseChartText, type ParseResult } from './parser'

export interface ImportParseResult extends ParseResult {
  borderOcr: BorderOcrParseResult
}

/** Parse the complete clipboard payload. This function is intentionally called by the import worker. */
export function parseImportSource(source: string, maxCharts: number): ImportParseResult {
  const borderOcr = parseBorderOcrPayload(source)
  return {
    borderOcr,
    ...parseChartText(borderOcr.chartText, {
      maxCharts,
      maxRejections: MAX_IMPORT_REJECTIONS,
    }),
  }
}

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
