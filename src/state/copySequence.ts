import type { Board } from '../types'

export const BOARD_FILL_ORDER = [6, 7, 8, 3, 4, 5, 0, 1, 2] as const

export interface CopySequenceEntry {
  cell: number
  chartUid: string
}

export interface CopySequenceState {
  order: CopySequenceEntry[]
  step: number
}

export function startCopySequence(board: Board): CopySequenceState | null {
  const order = BOARD_FILL_ORDER.flatMap((cell) => {
    const placement = board[cell]
    return placement ? [{ cell, chartUid: placement.chartUid }] : []
  })
  return order.length > 0 ? { order, step: 0 } : null
}

export function currentCopyEntry(sequence: CopySequenceState): CopySequenceEntry {
  return sequence.order[sequence.step]
}

export function advanceCopySequence(sequence: CopySequenceState): CopySequenceState | null {
  if (sequence.step + 1 >= sequence.order.length) return null
  return { ...sequence, step: sequence.step + 1 }
}
