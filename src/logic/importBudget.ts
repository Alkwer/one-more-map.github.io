import { formatNumber } from '../i18n/locale'
import { importSizeLimitMessage, MAX_IMPORT_TEXT_LENGTH } from './importLimits'

/**
 * Resource limits for user-assisted chart and Windows OCR clipboard imports.
 * These bounds are intentionally independent of the persisted chart limit:
 * they protect the synchronous parsing work performed on the browser thread.
 */
export const MAX_IMPORT_CHART_HEADERS = 300
export const MAX_IMPORT_BORDER_BLOCKS = 12
export const MAX_IMPORT_REROLL_BLOCKS = 1
export const MAX_IMPORT_SCAN_META_BLOCKS = 1
export const MAX_IMPORT_LINE_LENGTH = 2 * 1024
export const MAX_IMPORT_LINES_PER_OCR_BLOCK = 512
export const MAX_IMPORT_OCR_BLOCK_LENGTH = 16 * 1024
export const MAX_IMPORT_LINES_PER_CHART = 128
export const MAX_IMPORT_CHART_LENGTH = 64 * 1024

export {
  importSizeLimitMessage,
  MAX_IMPORT_REJECTIONS,
  MAX_IMPORT_SIGNATURE_PREFIX_LENGTH,
  MAX_IMPORT_TEXT_LENGTH,
} from './importLimits'

export class ImportBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportBudgetError'
  }
}

type OcrBlockKind = 'border' | 'reroll' | 'scan-meta'

interface ActiveOcrBlock {
  kind: OcrBlockKind
  lines: number
  length: number
}

const CHART_HEADER = /^(?:Item Class|아이템 종류)\s*[:：]/i
const BORDER_START = /^===\s*VOYAGE BORDER\s+\d{1,2}\s*===$/i
const BORDER_END = /^===\s*END VOYAGE BORDER\s*===$/i
const REROLL_START = /^===\s*VOYAGE REROLL COST\s*===$/i
const REROLL_END = /^===\s*END VOYAGE REROLL COST\s*===$/i
const SCAN_META_START = /^===\s*VOYAGE BORDER SCAN META\s*===$/i
const SCAN_META_END = /^===\s*END VOYAGE BORDER SCAN META\s*===$/i

function limitError(detail: string): ImportBudgetError {
  return new ImportBudgetError(`Import rejected: ${detail}. The pasted text was not retained.`)
}

function blockEndMatches(kind: OcrBlockKind, line: string): boolean {
  if (kind === 'border') return BORDER_END.test(line)
  if (kind === 'reroll') return REROLL_END.test(line)
  return SCAN_META_END.test(line)
}

/**
 * Validate every work-driving dimension with a single allocation-light scan.
 * The overall length check is deliberately first, before regex replacement,
 * newline splitting, Unicode normalization, or fuzzy modifier matching.
 */
export function assertImportWithinBudget(source: string): void {
  if (source.length > MAX_IMPORT_TEXT_LENGTH) {
    throw new ImportBudgetError(importSizeLimitMessage())
  }

  let chartHeaders = 0
  let borderBlocks = 0
  let rerollBlocks = 0
  let scanMetaBlocks = 0
  let activeOcr: ActiveOcrBlock | null = null
  let chartLines = 0
  let chartLength = 0

  for (let start = 0; start <= source.length;) {
    const newline = source.indexOf('\n', start)
    const end = newline < 0 ? source.length : newline
    const rawLineEnd = end > start && source.charCodeAt(end - 1) === 13 ? end - 1 : end
    const lineLength = rawLineEnd - start
    if (lineLength > MAX_IMPORT_LINE_LENGTH) {
      throw limitError(`a line exceeds ${formatNumber(MAX_IMPORT_LINE_LENGTH)} characters`)
    }

    const line = source.slice(start, rawLineEnd).trim()
    let openingKind: OcrBlockKind | null = null
    if (BORDER_START.test(line)) openingKind = 'border'
    else if (REROLL_START.test(line)) openingKind = 'reroll'
    else if (SCAN_META_START.test(line)) openingKind = 'scan-meta'

    if (openingKind) {
      if (activeOcr) throw limitError('nested or unterminated OCR block markers were found')
      if (openingKind === 'border') {
        borderBlocks += 1
        if (borderBlocks > MAX_IMPORT_BORDER_BLOCKS) {
          throw limitError(`more than ${MAX_IMPORT_BORDER_BLOCKS} border OCR blocks were found`)
        }
      } else if (openingKind === 'reroll') {
        rerollBlocks += 1
        if (rerollBlocks > MAX_IMPORT_REROLL_BLOCKS) {
          throw limitError(`more than ${MAX_IMPORT_REROLL_BLOCKS} reroll OCR block was found`)
        }
      } else {
        scanMetaBlocks += 1
        if (scanMetaBlocks > MAX_IMPORT_SCAN_META_BLOCKS) {
          throw limitError(`more than ${MAX_IMPORT_SCAN_META_BLOCKS} scan metadata block was found`)
        }
      }
      activeOcr = { kind: openingKind, lines: 0, length: 0 }
    } else if (activeOcr) {
      if (blockEndMatches(activeOcr.kind, line)) {
        activeOcr = null
      } else {
        activeOcr.lines += 1
        activeOcr.length += lineLength + (newline < 0 ? 0 : 1)
        if (activeOcr.lines > MAX_IMPORT_LINES_PER_OCR_BLOCK) {
          throw limitError(`an OCR block exceeds ${MAX_IMPORT_LINES_PER_OCR_BLOCK} content lines`)
        }
        if (activeOcr.length > MAX_IMPORT_OCR_BLOCK_LENGTH) {
          throw limitError(
            `an OCR block exceeds ${formatNumber(MAX_IMPORT_OCR_BLOCK_LENGTH)} characters`,
          )
        }
      }
    } else if (CHART_HEADER.test(line)) {
      chartHeaders += 1
      if (chartHeaders > MAX_IMPORT_CHART_HEADERS) {
        throw limitError(`more than ${MAX_IMPORT_CHART_HEADERS} chart item headers were found`)
      }
      chartLines = 1
      chartLength = lineLength
    } else if (chartHeaders > 0) {
      chartLines += 1
      chartLength += lineLength + (newline < 0 ? 0 : 1)
      if (chartLines > MAX_IMPORT_LINES_PER_CHART) {
        throw limitError(`a chart item exceeds ${MAX_IMPORT_LINES_PER_CHART} lines`)
      }
      if (chartLength > MAX_IMPORT_CHART_LENGTH) {
        throw limitError(`a chart item exceeds ${formatNumber(MAX_IMPORT_CHART_LENGTH)} characters`)
      }
    }

    if (newline < 0) break
    start = newline + 1
  }

  if (activeOcr) throw limitError('an unterminated OCR block marker was found')
}

export function isImportBudgetError(error: unknown): error is ImportBudgetError {
  return error instanceof ImportBudgetError
}
