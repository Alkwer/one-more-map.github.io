import { describe, expect, it } from 'vitest'
import { parseBorderOcrPayload } from './borderOcr'

const payload = (text: string) => `=== VOYAGE REROLL COST ===
${text}
=== END VOYAGE REROLL COST ===`

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
