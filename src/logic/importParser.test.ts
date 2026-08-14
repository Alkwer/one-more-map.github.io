import { describe, expect, it } from 'vitest'
import englishChart from './__fixtures__/charted.en.txt?raw'
import { assignImportChartUids, parseImportSource } from './importParser'

describe('import parser boundary', () => {
  it('preserves source ordering and the 250-chart accepted-result boundary', () => {
    const source = Array.from({ length: 300 }, (_, index) =>
      englishChart.replace('Armoured Coral Reef Chart of Ice', `Bulk Chart ${index + 1}`),
    ).join('\n')

    const result = parseImportSource(source, 250)

    expect(result.charts).toHaveLength(250)
    expect(result.charts[0].name).toBe('Bulk Chart 1')
    expect(result.charts[249].name).toBe('Bulk Chart 250')
    expect(result.rejected).toEqual([])
    expect(result.stoppedEarly).toEqual({
      reason: 'chart-capacity',
      unprocessedItems: 50,
    })
  })

  it('keeps border and chart diagnostics together across the worker payload', () => {
    const source = `=== VOYAGE BORDER 0 ===
Rare Monsters adjacent in Areas drop 1 additional Divine Orbs
=== END VOYAGE BORDER ===
${englishChart.replace('Chart Shape: Corner', 'Chart Shape: Spiral')}`

    const result = parseImportSource(source, 250)

    expect(result.borderOcr.matches).toEqual([
      expect.objectContaining({ index: 0, id: 'b-divine' }),
    ])
    expect(result.charts).toHaveLength(1)
    expect(result.unresolved).toEqual([
      expect.objectContaining({
        uid: result.charts[0].uid,
        reason: 'unknown Chart Shape: Spiral',
      }),
    ])
  })

  it('assigns final cross-worker ids without breaking unresolved references', () => {
    const parsed = parseImportSource(
      englishChart.replace('Chart Shape: Corner', 'Chart Shape: Spiral'),
      250,
    )
    const ids = ['final-chart-id']

    const assigned = assignImportChartUids(parsed, () => ids.shift()!)

    expect(assigned.charts[0].uid).toBe('final-chart-id')
    expect(assigned.unresolved[0].uid).toBe('final-chart-id')
  })
})
