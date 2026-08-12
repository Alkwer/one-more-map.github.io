import { describe, expect, it } from 'vitest'
import {
  assertImportWithinBudget,
  ImportBudgetError,
  MAX_IMPORT_BORDER_BLOCKS,
  MAX_IMPORT_CHART_HEADERS,
  MAX_IMPORT_LINES_PER_OCR_BLOCK,
  MAX_IMPORT_LINE_LENGTH,
  MAX_IMPORT_TEXT_LENGTH,
} from './importBudget'

function textWithLength(length: number): string {
  const completeLine = `${'x'.repeat(MAX_IMPORT_LINE_LENGTH)}\n`
  const completeLines = Math.floor(length / completeLine.length)
  return completeLine.repeat(completeLines) + 'x'.repeat(length % completeLine.length)
}

function borderBlock(index: number, lines = ['recognized text']): string {
  return `=== VOYAGE BORDER ${index} ===\n${lines.join('\n')}\n=== END VOYAGE BORDER ===`
}

describe('clipboard import resource budget', () => {
  it('accepts the overall maximum and rejects maximum+1 before content scanning', () => {
    expect(() => assertImportWithinBudget(textWithLength(MAX_IMPORT_TEXT_LENGTH))).not.toThrow()
    expect(() => assertImportWithinBudget('x'.repeat(MAX_IMPORT_TEXT_LENGTH + 1))).toThrow(
      /maximum size/,
    )
  })

  it('caps chart item headers independently of the persisted library size', () => {
    const header = 'Item Class: Chart\n'
    expect(() => assertImportWithinBudget(header.repeat(MAX_IMPORT_CHART_HEADERS))).not.toThrow()
    expect(() => assertImportWithinBudget(header.repeat(MAX_IMPORT_CHART_HEADERS + 1))).toThrow(
      /chart item headers/,
    )
  })

  it('accepts one transactional 12-border snapshot and rejects additional blocks', () => {
    const maximum = Array.from({ length: MAX_IMPORT_BORDER_BLOCKS }, (_, index) =>
      borderBlock(index),
    ).join('\n')

    expect(() => assertImportWithinBudget(maximum)).not.toThrow()
    expect(() => assertImportWithinBudget(`${maximum}\n${borderBlock(0)}`)).toThrow(
      /border OCR blocks/,
    )
  })

  it('caps OCR lines and long fuzzy-match candidates at exact boundaries', () => {
    expect(() =>
      assertImportWithinBudget(
        borderBlock(
          0,
          Array.from({ length: MAX_IMPORT_LINES_PER_OCR_BLOCK }, () => 'x'),
        ),
      ),
    ).not.toThrow()
    expect(() =>
      assertImportWithinBudget(
        borderBlock(
          0,
          Array.from({ length: MAX_IMPORT_LINES_PER_OCR_BLOCK + 1 }, () => 'x'),
        ),
      ),
    ).toThrow(/content lines/)

    expect(() =>
      assertImportWithinBudget(borderBlock(0, ['x'.repeat(MAX_IMPORT_LINE_LENGTH)])),
    ).not.toThrow()
    expect(() =>
      assertImportWithinBudget(borderBlock(0, ['x'.repeat(MAX_IMPORT_LINE_LENGTH + 1)])),
    ).toThrow(/line exceeds/)
  })

  it('accepts a full bulk import with many charts and noisy Windows OCR blocks', () => {
    const charts = Array.from(
      { length: 120 },
      (_, index) => `Item Class: Chart\nRarity: Rare\nTest Chart ${index + 1}\n--------`,
    ).join('\n')
    const borders = Array.from({ length: MAX_IMPORT_BORDER_BLOCKS }, (_, index) =>
      borderBlock(
        index,
        Array.from({ length: 96 }, (__, line) => `recognized tooltip line ${line + 1}`),
      ),
    ).join('\n')

    expect(() => assertImportWithinBudget(`${charts}\n${borders}`)).not.toThrow()
  })

  it('rejects repeated or unterminated OCR markers without running block regexes', () => {
    expect(() =>
      assertImportWithinBudget('=== VOYAGE BORDER 0 ===\n=== VOYAGE BORDER 1 ==='),
    ).toThrow(ImportBudgetError)
    expect(() => assertImportWithinBudget('=== VOYAGE REROLL COST ===\nnoise')).toThrow(
      /unterminated OCR block/,
    )
  })
})
