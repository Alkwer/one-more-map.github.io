import { describe, expect, it } from 'vitest'
import { emptyBorders } from '../types'
import {
  applyBorderOcrSnapshot,
  applyBorderOcrStateSnapshot,
  parseBorderOcrPayload,
} from './borderOcr'

const payload = (text: string) => `=== VOYAGE REROLL COST ===
${text}
=== END VOYAGE REROLL COST ===`

const divineTooltip = 'Rare Monsters in adjacent Areas drop an additional Divine Orb'
const chaosTooltip = 'Rare Monsters in adjacent Areas drop an additional Chaos Orb'
const borderBlock = (
  index: number,
  text = divineTooltip,
  language = '',
) => `=== VOYAGE BORDER ${index} ===
${language ? `OCR Language: ${language}\n` : ''}${text}
=== END VOYAGE BORDER ===`
const scanPayload = (blocks: string[], captured = blocks.length) => `=== VOYAGE BORDER SCAN META ===
Expected: 12
Captured: ${captured}
=== END VOYAGE BORDER SCAN META ===
${blocks.join('\n')}`
const existingBorders = () => {
  const borders = emptyBorders()
  borders.fill('b-chaos')
  return borders
}

describe('parseBorderOcrPayload reroll cost', () => {
  it.each([
    ['Border Modifiers Reroll Cost: 3 000', 3_000, 0],
    ['Border Modifiers Reroll Cost: 6 000', 6_000, 1],
    ['Border Modifiers Reroll Cost: 12000', 12_000, 2],
    ['Border Modifiers Reroll Cost: 24,000', 24_000, 3],
    ['Border Modifiers Reroll Cost: 48 OOO', 48_000, 4],
  ])('maps "%s" to the paid-reroll count', (ocrText, cost, rerollsUsed) => {
    const result = parseBorderOcrPayload(payload(ocrText))

    expect(result.rerollCost).toMatchObject({ cost, rerollsUsed })
    expect(result.rerollCostBlockCount).toBe(1)
    expect(result.rerollCostMisses).toEqual([])
    expect(result.chartText.trim()).toBe('')
  })

  it('does not guess an unknown cost', () => {
    const result = parseBorderOcrPayload(payload('Border Modifiers Reroll Cost: 9 000'))

    expect(result.rerollCost).toBeNull()
    expect(result.rerollCostMisses).toEqual(['Border Modifiers Reroll Cost: 9 000'])
  })

  it('finds a known cost when full-window OCR separates it from the tooltip label', () => {
    const result = parseBorderOcrPayload(
      payload(`GUILD STASH
Border Modifiers Reroll Cost:
Area Modifiers
Life 4 114/4 114
L:71 L:81 L:83
24 ooo
Mana 81/1 307`),
    )

    expect(result.rerollCost).toMatchObject({ cost: 24_000, rerollsUsed: 3 })
  })

  it('does not guess when the reroll OCR block contains two different known costs', () => {
    const result = parseBorderOcrPayload(
      payload(`Border Modifiers Reroll Cost:
6 000
Unrelated screen text 24 000`),
    )

    expect(result.rerollCost).toBeNull()
  })
})

describe('transactional border OCR snapshots', () => {
  it('applies borders and the recognized reroll counter as one fresh snapshot', () => {
    const parsed = parseBorderOcrPayload(
      `${scanPayload(Array.from({ length: 12 }, (_, index) => borderBlock(index)))}\n${payload(
        'Border Modifiers Reroll Cost: 24,000',
      )}`,
    )

    expect(applyBorderOcrStateSnapshot(existingBorders(), 1, parsed)).toMatchObject({
      borders: Array(12).fill('b-divine'),
      borderRerollsUsed: 3,
      status: 'complete',
      applied: true,
      invalidated: false,
    })
  })

  it('invalidates borders and rerolls when a recognized cost accompanies an incomplete scan', () => {
    const parsed = parseBorderOcrPayload(
      `${scanPayload(Array.from({ length: 11 }, (_, index) => borderBlock(index)))}\n${payload(
        'Border Modifiers Reroll Cost: 24,000',
      )}`,
    )

    expect(applyBorderOcrStateSnapshot(existingBorders(), 1, parsed)).toMatchObject({
      borders: Array(12).fill(null),
      borderRerollsUsed: 0,
      status: 'incomplete',
      applied: true,
      invalidated: true,
    })
  })

  it('invalidates borders and rerolls when a recognized cost accompanies a failed scan', () => {
    const parsed = parseBorderOcrPayload(
      `${scanPayload(
        Array.from({ length: 12 }, (_, index) => borderBlock(index, 'unreadable tooltip noise')),
      )}\n${payload('Border Modifiers Reroll Cost: 24,000')}`,
    )

    expect(applyBorderOcrStateSnapshot(existingBorders(), 1, parsed)).toMatchObject({
      borders: Array(12).fill(null),
      borderRerollsUsed: 0,
      status: 'failed',
      applied: true,
      invalidated: true,
    })
  })

  it('applies a complete 12-position importer sweep and records its OCR language', () => {
    const parsed = parseBorderOcrPayload(
      scanPayload(
        Array.from({ length: 12 }, (_, index) => borderBlock(index, divineTooltip, 'en-US')),
      ),
    )
    const applied = applyBorderOcrSnapshot(existingBorders(), parsed)

    expect(parsed.uniqueBlockCount).toBe(12)
    expect(parsed.snapshotComplete).toBe(true)
    expect(parsed.scanMeta?.complete).toBe(true)
    expect(parsed.ocrLanguages).toEqual(['en-US'])
    expect(applied.status).toBe('complete')
    expect(applied.borders).toEqual(Array(12).fill('b-divine'))
  })

  it('clears a missed position instead of retaining a stale border from a complete sweep', () => {
    const blocks = Array.from({ length: 12 }, (_, index) =>
      borderBlock(index, index === 11 ? 'unreadable tooltip noise' : divineTooltip),
    )
    const parsed = parseBorderOcrPayload(scanPayload(blocks))
    const applied = applyBorderOcrSnapshot(existingBorders(), parsed)

    expect(applied.status).toBe('partial')
    expect(applied.borders.slice(0, 11)).toEqual(Array(11).fill('b-divine'))
    expect(applied.borders[11]).toBeNull()
  })

  it('rejects an interrupted importer sweep without mixing it into existing borders', () => {
    const parsed = parseBorderOcrPayload(
      scanPayload(Array.from({ length: 11 }, (_, index) => borderBlock(index))),
    )
    const existing = existingBorders()
    const applied = applyBorderOcrSnapshot(existing, parsed)

    expect(parsed.scanMeta?.complete).toBe(false)
    expect(applied).toMatchObject({ status: 'incomplete', applied: false })
    expect(applied.borders).toEqual(existing)
  })

  it('rejects duplicated positions even when the importer reports 12 captured blocks', () => {
    const blocks = [...Array.from({ length: 11 }, (_, index) => borderBlock(index)), borderBlock(0)]
    const parsed = parseBorderOcrPayload(scanPayload(blocks, 12))
    const existing = existingBorders()
    const applied = applyBorderOcrSnapshot(existing, parsed)

    expect(parsed.blockCount).toBe(12)
    expect(parsed.uniqueBlockCount).toBe(11)
    expect(parsed.scanMeta?.complete).toBe(false)
    expect(applied.borders).toEqual(existing)
  })

  it('preserves manual borders when a structurally complete sweep recognises nothing', () => {
    const parsed = parseBorderOcrPayload(
      scanPayload(
        Array.from({ length: 12 }, (_, index) => borderBlock(index, 'OCR ERROR: unavailable')),
      ),
    )
    const existing = existingBorders()
    const applied = applyBorderOcrSnapshot(existing, parsed)

    expect(parsed.matches).toHaveLength(0)
    expect(applied).toMatchObject({ status: 'failed', applied: false })
    expect(applied.borders).toEqual(existing)
  })

  it('fails closed when the all-border overlay puts multiple tooltips in every OCR block', () => {
    const allBorderView = `${divineTooltip}\n${chaosTooltip}`
    const parsed = parseBorderOcrPayload(
      scanPayload(Array.from({ length: 12 }, (_, index) => borderBlock(index, allBorderView))),
    )
    const existing = existingBorders()
    const applied = applyBorderOcrSnapshot(existing, parsed)

    expect(parsed.matches).toHaveLength(0)
    expect(parsed.misses).toHaveLength(12)
    expect(applied).toMatchObject({ status: 'failed', applied: false })
    expect(applied.borders).toEqual(existing)
  })

  it('keeps legacy single-border clipboard patches compatible', () => {
    const parsed = parseBorderOcrPayload(borderBlock(0))
    const applied = applyBorderOcrSnapshot(emptyBorders(), parsed)

    expect(applied.status).toBe('legacy-patch')
    expect(applied.borders[0]).toBe('b-divine')
  })
})
