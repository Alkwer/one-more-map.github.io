import type { BorderOcrParseResult } from './borderOcr'
import { parseBorderOcrPayload } from './borderOcr'
import { MAX_IMPORT_REJECTIONS } from './importBudget'
import { parseChartText, type ParseResult } from './parser'

export { assignImportChartUids } from './importUidAssignment'

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
