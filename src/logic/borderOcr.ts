import { BORDER_MODS } from '../data/mods'
import { KOREAN_BORDER_MOD_EVIDENCE } from '../data/borderMods.ko'
import type { Borders } from '../types'
import { emptyBorders } from '../types'
import { assertImportWithinBudget } from './importBudget'
import { REROLL_COSTS } from './rerollAdvice'

const BORDER_BLOCK =
  /===\s*VOYAGE BORDER\s+(\d{1,2})\s*===\s*([\s\S]*?)===\s*END VOYAGE BORDER\s*===/gi
const BORDER_SCAN_META_BLOCK =
  /===\s*VOYAGE BORDER SCAN META\s*===\s*([\s\S]*?)===\s*END VOYAGE BORDER SCAN META\s*===/gi
const REROLL_COST_BLOCK =
  /===\s*VOYAGE REROLL COST\s*===\s*([\s\S]*?)===\s*END VOYAGE REROLL COST\s*===/gi
const OCR_LANGUAGE_LINE = /^\s*OCR Language:\s*([\w-]+)\s*$/gim

export const normalizeBorderOcrText = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    // Korean client text joins counters to their number (for example `8개`).
    // Split letter/number boundaries so numeric border tiers stay distinct.
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

interface BorderMatchVariant {
  id: string
  canonicalText: string
  matchText: string
}

const borderMatchVariants: BorderMatchVariant[] = BORDER_MODS.flatMap((mod) => {
  const korean = KOREAN_BORDER_MOD_EVIDENCE[mod.id as keyof typeof KOREAN_BORDER_MOD_EVIDENCE]
  return [
    { id: mod.id, canonicalText: mod.text, matchText: mod.text },
    ...(mod.aliases ?? []).map((matchText) => ({
      id: mod.id,
      canonicalText: mod.text,
      matchText,
    })),
    ...(korean ? [{ id: mod.id, canonicalText: mod.text, matchText: korean.text }] : []),
  ]
})

const exactBorderIdsByText = new Map<string, Set<string>>()
for (const variant of borderMatchVariants) {
  const text = normalizeBorderOcrText(variant.matchText)
  const ids = exactBorderIdsByText.get(text) ?? new Set<string>()
  ids.add(variant.id)
  exactBorderIdsByText.set(text, ids)
}

const borderTokenFrequency = new Map<string, number>()
for (const variant of borderMatchVariants) {
  const uniqueTokens = new Set(normalizeBorderOcrText(variant.matchText).split(' ').filter(Boolean))
  for (const token of uniqueTokens) {
    borderTokenFrequency.set(token, (borderTokenFrequency.get(token) ?? 0) + 1)
  }
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = next
  }
  return prev[b.length]
}

function tokenMatches(expected: string, actual: string): boolean {
  if (expected === actual) return true
  if (/^\d+$/.test(expected) || /^\d+$/.test(actual)) return false
  const korean = /[\u3131-\u318e\uac00-\ud7a3]/u
  if (korean.test(expected) || korean.test(actual)) {
    if (expected.length < 2 || actual.length < 2) return false
    const allowance = expected.length >= 6 ? 2 : 1
    return editDistance(expected, actual) <= allowance
  }
  if (expected.length < 5 || actual.length < 5) return false
  const allowance = expected.length >= 9 ? 2 : 1
  return editDistance(expected, actual) <= allowance
}

function signatureToken(token: string): boolean {
  if (/^\d+$/.test(token)) return false
  const isKorean = /[\u3131-\u318e\uac00-\ud7a3]/u.test(token)
  // One-syllable Korean nouns such as `게` (Crab) are distinctive enough to
  // use as exact signatures; fuzzy matching remains disabled for them.
  return token.length >= (isKorean ? 1 : 4)
}

function candidateWindows(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map(normalizeBorderOcrText).filter(Boolean)
  const candidates = [...lines]
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length) candidates.push(`${lines[i]} ${lines[i + 1]}`)
    if (i + 2 < lines.length) candidates.push(`${lines[i]} ${lines[i + 1]} ${lines[i + 2]}`)
  }
  return candidates
}

function candidateLines(raw: string): string[] {
  const candidates = new Set(candidateWindows(raw))
  if (candidates.size === 0) {
    const whole = normalizeBorderOcrText(raw)
    if (whole) candidates.add(whole)
  }
  return [...candidates]
}

const rerollsUsedByCost = new Map<number, number>(
  REROLL_COSTS.map((cost, rerollsUsed) => [cost, rerollsUsed]),
)

function matchRerollCost(raw: string): { cost: number; rerollsUsed: number } | null {
  const hasTooltipLabel = candidateLines(raw).some((candidate) =>
    /\bborder\s+modifiers?\s+reroll\s+cost\b/.test(candidate),
  )
  if (!hasTooltipLabel) return null

  const tokens = normalizeBorderOcrText(raw).split(' ').filter(Boolean)
  const matchedCosts = new Set<number>()
  for (let start = 0; start < tokens.length; start++) {
    let digits = ''
    for (const token of tokens.slice(start, start + 3)) {
      // Windows OCR sometimes reads zeroes as the letter O in a spaced
      // thousands value (for example, "6 OOO"). Only normalize tokens that
      // otherwise look numeric, then accept one of the five known costs.
      if (!/^[0-9oil]+$/.test(token)) break
      digits += token.replace(/[oil]/g, (character) => (character === 'o' ? '0' : '1'))
      const cost = Number.parseInt(digits, 10)
      if (rerollsUsedByCost.has(cost)) matchedCosts.add(cost)
    }
  }

  // Full-window OCR can interleave unrelated UI numbers with the tooltip.
  // Accept one unambiguous known cost anywhere in this dedicated block, but
  // preserve the current counter rather than guessing when two costs appear.
  if (matchedCosts.size !== 1) return null
  const [cost] = matchedCosts
  return { cost, rerollsUsed: rerollsUsedByCost.get(cost)! }
}

interface Match {
  id: string
  text: string
  confidence: number
  exact: boolean
}

function matchBorder(raw: string): Match | null {
  const candidates = candidateLines(raw)
  if (candidates.length === 0) return null

  // PoE 3.29.3 can display all 12 border tooltips at once. A scan block is
  // position-tagged by the importer and must contain exactly one tooltip; if
  // full-window OCR sees multiple exact tooltip windows, assigning the first
  // one to that position would silently corrupt the board snapshot.
  const exactHitWindows = candidateWindows(raw).filter((candidate) =>
    exactBorderIdsByText.has(candidate),
  )
  const exactHitIds = new Set(
    exactHitWindows.flatMap((candidate) => [...(exactBorderIdsByText.get(candidate) ?? [])]),
  )
  if (exactHitWindows.length > 1 || exactHitIds.size > 1) return null

  const scored = borderMatchVariants.flatMap((variant) => {
    const expected = normalizeBorderOcrText(variant.matchText)
    const expectedTokens = expected.split(' ')
    const expectedNumbers = expectedTokens.filter((token) => /^\d+$/.test(token))

    return candidates.map((candidate) => {
      const exact = candidate === expected
      if (exact) {
        return {
          id: variant.id,
          text: variant.canonicalText,
          confidence: 1,
          exact,
        }
      }

      const actualTokens = candidate.split(' ')
      const signatureTokens = expectedTokens.filter(
        (token) => signatureToken(token) && (borderTokenFrequency.get(token) ?? 0) <= 3,
      )
      const hasSignatureMatch =
        signatureTokens.length === 0 ||
        signatureTokens.some((token) => actualTokens.some((actual) => tokenMatches(token, actual)))
      if (!hasSignatureMatch) {
        return {
          id: variant.id,
          text: variant.canonicalText,
          confidence: 0,
          exact,
        }
      }

      const matchedExpected = expectedTokens.filter((token) =>
        actualTokens.some((actual) => tokenMatches(token, actual)),
      ).length
      const matchedActual = actualTokens.filter((token) =>
        expectedTokens.some((expectedToken) => tokenMatches(expectedToken, token)),
      ).length
      const recall = matchedExpected / expectedTokens.length
      const precision = matchedActual / actualTokens.length
      let confidence =
        recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision)

      // Tiers often differ only by a number. Never guess a tier when OCR did
      // not read that number from the same tooltip line.
      if (
        expectedNumbers.length > 0 &&
        !expectedNumbers.every((number) => actualTokens.includes(number))
      ) {
        confidence *= 0.6
      }
      return {
        id: variant.id,
        text: variant.canonicalText,
        confidence,
        exact,
      }
    })
  })

  scored.sort((a, b) => Number(b.exact) - Number(a.exact) || b.confidence - a.confidence)
  const best = scored[0]
  const runnerUp = scored.find((item) => item.id !== best.id)
  if (best.confidence < 0.72) return null
  if (!best.exact && runnerUp && best.confidence - runnerUp.confidence < 0.04) return null
  return best
}

export interface BorderOcrMatch {
  index: number
  id: string
  text: string
  confidence: number
}

export interface BorderOcrMiss {
  index: number
  raw: string
}

export interface BorderRerollCostMatch {
  cost: number
  rerollsUsed: number
  raw: string
}

export interface BorderOcrScanMeta {
  expectedBlockCount: number
  capturedBlockCount: number
  complete: boolean
}

export interface BorderOcrParseResult {
  /** Clipboard payload with OCR blocks removed, ready for the chart parser. */
  chartText: string
  /** Only recognized positions are populated. */
  borders: Borders
  matches: BorderOcrMatch[]
  misses: BorderOcrMiss[]
  blockCount: number
  uniqueBlockCount: number
  snapshotComplete: boolean
  scanMeta: BorderOcrScanMeta | null
  ocrLanguages: string[]
  rerollCost: BorderRerollCostMatch | null
  rerollCostBlockCount: number
  rerollCostMisses: string[]
}

export type BorderOcrApplicationStatus =
  'none' | 'legacy-patch' | 'complete' | 'partial' | 'incomplete' | 'failed'

export interface BorderOcrApplication {
  borders: Borders
  status: BorderOcrApplicationStatus
  applied: boolean
}

export interface BorderOcrStateApplication extends BorderOcrApplication {
  borderRerollsUsed: number
  /** A transactional importer scan was rejected and the previous snapshot was invalidated. */
  invalidated: boolean
}

function stripOcrLanguage(raw: string, languages: Set<string>): string {
  for (const match of raw.matchAll(OCR_LANGUAGE_LINE)) languages.add(match[1])
  return raw.replace(OCR_LANGUAGE_LINE, '').trim()
}

export function parseBorderOcrPayload(source: string): BorderOcrParseResult {
  assertImportWithinBudget(source)
  const borders = emptyBorders()
  const matches: BorderOcrMatch[] = []
  const misses: BorderOcrMiss[] = []
  const blockIndices: number[] = []
  const ocrLanguages = new Set<string>()
  let blockCount = 0
  const rawScanMeta: Omit<BorderOcrScanMeta, 'complete'> & { found: boolean } = {
    expectedBlockCount: 0,
    capturedBlockCount: 0,
    found: false,
  }
  let rerollCost: BorderRerollCostMatch | null = null
  let rerollCostBlockCount = 0
  const rerollCostMisses: string[] = []

  const chartText = source
    .replace(BORDER_SCAN_META_BLOCK, (_block, raw: string) => {
      const expected = raw.match(/\bExpected:\s*(\d+)/i)
      const captured = raw.match(/\bCaptured:\s*(\d+)/i)
      if (expected && captured) {
        rawScanMeta.expectedBlockCount = Number.parseInt(expected[1], 10)
        rawScanMeta.capturedBlockCount = Number.parseInt(captured[1], 10)
        rawScanMeta.found = true
      }
      return '\n'
    })
    .replace(REROLL_COST_BLOCK, (_block, raw: string) => {
      rerollCostBlockCount++
      const ocrText = stripOcrLanguage(raw, ocrLanguages)
      const match = matchRerollCost(ocrText)
      if (match) rerollCost = { ...match, raw: ocrText }
      else rerollCostMisses.push(ocrText)
      return '\n'
    })
    .replace(BORDER_BLOCK, (_block, indexText: string, raw: string) => {
      blockCount++
      const index = Number.parseInt(indexText, 10)
      blockIndices.push(index)
      if (index < 0 || index >= 12) return '\n'

      const ocrText = stripOcrLanguage(raw, ocrLanguages)
      const match = matchBorder(ocrText)
      if (match) {
        borders[index] = match.id
        matches.push({ index, ...match })
      } else {
        misses.push({ index, raw: ocrText })
      }
      return '\n'
    })

  const uniqueBlockCount = new Set(blockIndices.filter((index) => index >= 0 && index < 12)).size
  const snapshotComplete = blockCount === 12 && uniqueBlockCount === 12
  const scanMeta: BorderOcrScanMeta | null = rawScanMeta.found
    ? {
        expectedBlockCount: rawScanMeta.expectedBlockCount,
        capturedBlockCount: rawScanMeta.capturedBlockCount,
        complete:
          rawScanMeta.expectedBlockCount === 12 &&
          rawScanMeta.capturedBlockCount === 12 &&
          rawScanMeta.capturedBlockCount === blockCount &&
          snapshotComplete,
      }
    : null

  return {
    chartText,
    borders,
    matches,
    misses,
    blockCount,
    uniqueBlockCount,
    snapshotComplete,
    scanMeta,
    ocrLanguages: [...ocrLanguages].sort(),
    rerollCost,
    rerollCostBlockCount,
    rerollCostMisses,
  }
}

export function applyBorderOcrSnapshot(
  currentBorders: Borders,
  result: BorderOcrParseResult,
): BorderOcrApplication {
  if (result.scanMeta && !result.scanMeta.complete) {
    return { borders: [...currentBorders], status: 'incomplete', applied: false }
  }

  if (result.blockCount === 0) {
    return { borders: [...currentBorders], status: 'none', applied: false }
  }

  // A systemic OCR failure must not erase borders entered manually or imported
  // by an earlier successful sweep.
  if (result.matches.length === 0) {
    return { borders: [...currentBorders], status: 'failed', applied: false }
  }

  // New importer sweeps are transactional. A killed helper or missing output
  // must not create a hybrid snapshot containing new and stale border values.
  if (result.snapshotComplete) {
    return {
      borders: [...result.borders],
      status: result.matches.length === 12 ? 'complete' : 'partial',
      applied: true,
    }
  }

  // Preserve compatibility with older helpers and intentionally pasted
  // single-border fixtures, which predate transactional scan metadata.
  const borders = [...currentBorders]
  for (const match of result.matches) borders[match.index] = match.id
  return { borders, status: 'legacy-patch', applied: true }
}

export function applyBorderOcrStateSnapshot(
  currentBorders: Borders,
  currentRerollsUsed: number,
  result: BorderOcrParseResult,
): BorderOcrStateApplication {
  const borderApplication = applyBorderOcrSnapshot(currentBorders, result)
  const freshBorderSnapshot =
    borderApplication.status === 'complete' || borderApplication.status === 'partial'

  // Scan metadata identifies a current importer sweep. Its borders and reroll
  // counter form one snapshot: if either half is unavailable, invalidate the
  // old snapshot so stale recommendations cannot survive the failed scan.
  if (result.scanMeta && (!freshBorderSnapshot || !result.rerollCost)) {
    return {
      borders: emptyBorders(),
      borderRerollsUsed: 0,
      status: borderApplication.status,
      applied: true,
      invalidated: true,
    }
  }

  return {
    ...borderApplication,
    borderRerollsUsed:
      freshBorderSnapshot && result.rerollCost ? result.rerollCost.rerollsUsed : currentRerollsUsed,
    invalidated: false,
  }
}
