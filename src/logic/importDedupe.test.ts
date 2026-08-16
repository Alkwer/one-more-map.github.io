import { describe, expect, it } from 'vitest'
import { dedupeNewCharts } from './importDedupe'
import type { ChartData } from '../types'

let n = 0
function chart(rawText?: string): ChartData {
  n += 1
  return {
    uid: `t${n}`,
    name: 'Test Chart',
    level: 83,
    edges: [true, false, true, false],
    modIds: [],
    rawText,
  }
}

describe('dedupeNewCharts', () => {
  it('keeps everything when the library is empty', () => {
    const incoming = [chart('A'), chart('B')]
    const { fresh, skipped } = dedupeNewCharts([], incoming)
    expect(fresh).toHaveLength(2)
    expect(skipped).toBe(0)
  })

  it('skips a full re-scan of the same inventory (issue #46)', () => {
    const pool = [chart('A'), chart('B'), chart('C')]
    const { fresh, skipped } = dedupeNewCharts(pool, [chart('A'), chart('B'), chart('C')])
    expect(fresh).toHaveLength(0)
    expect(skipped).toBe(3)
  })

  it('still imports copies beyond what the library holds', () => {
    const pool = [chart('A')]
    const { fresh, skipped } = dedupeNewCharts(pool, [chart('A'), chart('A')])
    expect(fresh).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('keeps two identical charts arriving in one sweep when none are held', () => {
    const { fresh, skipped } = dedupeNewCharts([], [chart('A'), chart('A')])
    expect(fresh).toHaveLength(2)
    expect(skipped).toBe(0)
  })

  it('never dedupes charts without verbatim text', () => {
    const pool = [chart(undefined)]
    const { fresh, skipped } = dedupeNewCharts(pool, [chart(undefined), chart(undefined)])
    expect(fresh).toHaveLength(2)
    expect(skipped).toBe(0)
  })
})
