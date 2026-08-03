import { describe, expect, it } from 'vitest'
import type { Board, ChartData } from '../types'
import {
  advanceCopySequence,
  BOARD_FILL_ORDER,
  currentCopyEntry,
  startCopySequence,
  writeCurrentCopyAndAdvance,
} from './copySequence'

const boardWith = (...cells: number[]): Board => {
  const board: Board = Array(9).fill(null)
  for (const cell of cells) board[cell] = { chartUid: `chart-${cell}`, rotation: 0 }
  return board
}

const chart: ChartData = {
  uid: 'chart-6',
  name: 'Test Chart',
  level: 83,
  edges: [true, false, true, false],
  modIds: ['self:quant'],
}

describe('copy sequence', () => {
  it('uses the in-game bottom-left-first fill order and skips empty cells', () => {
    expect(BOARD_FILL_ORDER).toEqual([6, 7, 8, 3, 4, 5, 0, 1, 2])
    expect(startCopySequence(boardWith(0, 4, 6, 8))).toEqual({
      order: [
        { cell: 6, chartUid: 'chart-6' },
        { cell: 8, chartUid: 'chart-8' },
        { cell: 4, chartUid: 'chart-4' },
        { cell: 0, chartUid: 'chart-0' },
      ],
      step: 0,
    })
  })

  it('does not start for an empty board', () => {
    expect(startCopySequence(boardWith())).toBeNull()
  })

  it('advances through each cell and finishes after the final one', () => {
    const first = startCopySequence(boardWith(6, 7))!
    expect(currentCopyEntry(first)).toEqual({ cell: 6, chartUid: 'chart-6' })

    const second = advanceCopySequence(first)!
    expect(currentCopyEntry(second)).toEqual({ cell: 7, chartUid: 'chart-7' })
    expect(advanceCopySequence(second)).toBeNull()
  })

  it('snapshots chart identity across clear, swap, and solver board replacements', () => {
    const original = boardWith(6, 7)
    const sequence = startCopySequence(original)!

    const cleared: Board = Array(9).fill(null)
    const swapped = [...original] as Board
    ;[swapped[6], swapped[7]] = [swapped[7], swapped[6]]
    const solverApplied = boardWith(0, 1, 2)

    expect(cleared.every((placement) => placement === null)).toBe(true)
    expect(swapped[6]?.chartUid).toBe('chart-7')
    expect(solverApplied[6]).toBeNull()
    expect(currentCopyEntry(sequence)).toEqual({ cell: 6, chartUid: 'chart-6' })
  })

  it('awaits a successful clipboard write before advancing', async () => {
    const sequence = startCopySequence(boardWith(6, 7))!
    let written = ''
    const result = await writeCurrentCopyAndAdvance(sequence, chart, {
      writeText: async (text) => {
        written = text
      },
    })

    expect(written).not.toBe('')
    expect(result).toEqual({ ok: true, next: { ...sequence, step: 1 } })
  })

  it('keeps the current entry selected when clipboard writing is rejected', async () => {
    const sequence = startCopySequence(boardWith(6, 7))!
    const result = await writeCurrentCopyAndAdvance(sequence, chart, {
      writeText: async () => {
        throw new Error('Permission denied')
      },
    })

    expect(result).toMatchObject({
      ok: false,
      next: sequence,
      reason: 'rejected',
      detail: 'Permission denied',
    })
    expect(result.ok || result.manualText).toBeTruthy()
    expect(currentCopyEntry(sequence).chartUid).toBe('chart-6')
  })

  it('keeps the current entry selected when the Clipboard API is unavailable', async () => {
    const sequence = startCopySequence(boardWith(6, 7))!
    const result = await writeCurrentCopyAndAdvance(sequence, chart, undefined)

    expect(result).toMatchObject({ ok: false, next: sequence, reason: 'unavailable' })
    expect(result.ok || result.manualText).toBeTruthy()
    expect(currentCopyEntry(sequence).chartUid).toBe('chart-6')
  })
})
