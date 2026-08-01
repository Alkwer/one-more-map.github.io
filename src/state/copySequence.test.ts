import { describe, expect, it } from 'vitest'
import type { Board } from '../types'
import {
  advanceCopySequence,
  BOARD_FILL_ORDER,
  currentCopyCell,
  startCopySequence,
} from './copySequence'

const boardWith = (...cells: number[]): Board => {
  const board: Board = Array(9).fill(null)
  for (const cell of cells) board[cell] = { chartUid: `chart-${cell}`, rotation: 0 }
  return board
}

describe('copy sequence', () => {
  it('uses the in-game bottom-left-first fill order and skips empty cells', () => {
    expect(BOARD_FILL_ORDER).toEqual([6, 7, 8, 3, 4, 5, 0, 1, 2])
    expect(startCopySequence(boardWith(0, 4, 6, 8))).toEqual({
      order: [6, 8, 4, 0],
      step: 0,
    })
  })

  it('does not start for an empty board', () => {
    expect(startCopySequence(boardWith())).toBeNull()
  })

  it('advances through each cell and finishes after the final one', () => {
    const first = startCopySequence(boardWith(6, 7))!
    expect(currentCopyCell(first)).toBe(6)

    const second = advanceCopySequence(first)!
    expect(currentCopyCell(second)).toBe(7)
    expect(advanceCopySequence(second)).toBeNull()
  })
})
