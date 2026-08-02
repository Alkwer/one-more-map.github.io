import { describe, expect, it } from 'vitest'
import { adviseBorders } from './borderAdvisor'
import { strategyById } from '../data/strategies'
import { DEFAULT_WEIGHTS } from './rewards'
import { emptyBorders } from '../types'
import type { Borders } from '../types'

const withBorders = (...ids: (string | null)[]): Borders => {
  const b = emptyBorders()
  ids.forEach((id, i) => (b[i] = id))
  return b
}

describe('border reroll advisor', () => {
  it('is silent-neutral with no borders entered', () => {
    const advice = adviseBorders(emptyBorders(), DEFAULT_WEIGHTS, null)
    expect(advice.filled).toBe(0)
    expect(advice.percentile).toBe(50)
  })

  it('never advises rerolling away a rolled jackpot border', () => {
    const advice = adviseBorders(withBorders('b-divine'), DEFAULT_WEIGHTS, null)
    expect(advice.verdict).toBe('jackpot')
    expect(advice.jackpot.present).toBe(true)
  })

  it('uses the active strategy\'s required border as the jackpot target', () => {
    const divine = strategyById.get('divine-border-rares')!
    const advice = adviseBorders(withBorders('b-pack-1'), divine.weights, divine)
    expect(advice.jackpot.present).toBe(false)
    expect(advice.jackpot.label).toContain('Divine')
    expect(advice.jackpot.chancePct).toBeGreaterThan(0)
    expect(advice.jackpot.chancePct).toBeLessThan(100)
  })

  it('ranks a high-value set above a low-value set', () => {
    const good = adviseBorders(
      withBorders('b-curr-3', 'b-curr-3', 'b-curr-3', 'b-curr-3'),
      DEFAULT_WEIGHTS,
      null,
    )
    const bad = adviseBorders(
      withBorders('b-rarity-1', 'b-rarity-1', 'b-rarity-1', 'b-rarity-1'),
      DEFAULT_WEIGHTS,
      null,
    )
    expect(good.percentile).toBeGreaterThan(bad.percentile)
    expect(good.currentValue).toBeGreaterThan(bad.currentValue)
  })
})
