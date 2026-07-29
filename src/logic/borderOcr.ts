import { BORDER_MODS } from '../data/mods'
import type { Borders } from '../types'
import { emptyBorders } from '../types'

const BORDER_BLOCK =
  /===\s*VOYAGE BORDER\s+(\d{1,2})\s*===\s*([\s\S]*?)===\s*END VOYAGE BORDER\s*===/gi

const normalize = (text: string): string =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const borderTokenFrequency = new Map<string, number>()
for (const mod of BORDER_MODS) {
  const uniqueTokens = new Set(normalize(mod.text).split(' ').filter(Boolean))
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
  if (expected.length < 5 || actual.length < 5) return false
  const allowance = expected.length >= 9 ? 2 : 1
  return editDistance(expected, actual) <= allowance
}

function candidateLines(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean)
  const candidates = new Set(lines)
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length) candidates.add(`${lines[i]} ${lines[i + 1]}`)
    if (i + 2 < lines.length) candidates.add(`${lines[i]} ${lines[i + 1]} ${lines[i + 2]}`)
  }
  if (lines.length === 0) {
    const whole = normalize(raw)
    if (whole) candidates.add(whole)
  }
  return [...candidates]
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

  const scored = BORDER_MODS.flatMap((mod) => {
    const expected = normalize(mod.text)
    const expectedTokens = expected.split(' ')
    const expectedNumbers = expectedTokens.filter((token) => /^\d+$/.test(token))

    return candidates.map((candidate) => {
      const exact = candidate.includes(expected)
      if (exact) return { id: mod.id, text: mod.text, confidence: 1, exact }

      const actualTokens = candidate.split(' ')
      const signatureTokens = expectedTokens.filter(
        (token) =>
          !/^\d+$/.test(token) &&
          token.length >= 4 &&
          (borderTokenFrequency.get(token) ?? 0) <= 3,
      )
      const hasSignatureMatch =
        signatureTokens.length === 0 ||
        signatureTokens.some((token) =>
          actualTokens.some((actual) => tokenMatches(token, actual)),
        )
      if (!hasSignatureMatch) {
        return { id: mod.id, text: mod.text, confidence: 0, exact }
      }

      const matched = expectedTokens.filter((token) =>
        actualTokens.some((actual) => tokenMatches(token, actual)),
      ).length
      let confidence = matched / expectedTokens.length

      // Tiers often differ only by a number. Never guess a tier when OCR did
      // not read that number from the same tooltip line.
      if (
        expectedNumbers.length > 0 &&
        !expectedNumbers.every((number) => actualTokens.includes(number))
      ) {
        confidence *= 0.6
      }
      return { id: mod.id, text: mod.text, confidence, exact }
    })
  })

  scored.sort((a, b) => b.confidence - a.confidence)
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

export interface BorderOcrParseResult {
  /** Clipboard payload with OCR blocks removed, ready for the chart parser. */
  chartText: string
  /** Only recognized positions are populated. */
  borders: Borders
  matches: BorderOcrMatch[]
  misses: BorderOcrMiss[]
  blockCount: number
}

export function parseBorderOcrPayload(source: string): BorderOcrParseResult {
  const borders = emptyBorders()
  const matches: BorderOcrMatch[] = []
  const misses: BorderOcrMiss[] = []
  let blockCount = 0

  const chartText = source.replace(BORDER_BLOCK, (_block, indexText: string, raw: string) => {
    blockCount++
    const index = Number.parseInt(indexText, 10)
    if (index < 0 || index >= 12) return '\n'

    const match = matchBorder(raw)
    if (match) {
      borders[index] = match.id
      matches.push({ index, ...match })
    } else {
      misses.push({ index, raw: raw.trim() })
    }
    return '\n'
  })

  return { chartText, borders, matches, misses, blockCount }
}
