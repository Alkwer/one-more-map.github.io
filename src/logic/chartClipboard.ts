import { MAX_IMPORT_TEXT_LENGTH } from './importLimits'

const CHART_CLASS = /^[ \t]*(?:Item Class\s*[:：]\s*Chart|아이템 종류\s*[:：]\s*해도)[ \t]*$/im

/** Allocation-light check used before intercepting a page-level paste event. */
export function isChartClipboardText(text: string): boolean {
  if (text.length > MAX_IMPORT_TEXT_LENGTH) return false
  return CHART_CLASS.test(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'))
}
