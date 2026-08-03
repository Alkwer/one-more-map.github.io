import { buildSingleChartSearch } from '../logic/regex'
import type { Board, ChartData } from '../types'

export const BOARD_FILL_ORDER = [6, 7, 8, 3, 4, 5, 0, 1, 2] as const

export interface CopySequenceEntry {
  cell: number
  chartUid: string
}

export interface CopySequenceState {
  order: CopySequenceEntry[]
  step: number
}

export interface ClipboardWriter {
  writeText(text: string): Promise<void>
}

export type CopySequenceWriteResult =
  | {
      ok: true
      next: CopySequenceState | null
    }
  | {
      ok: false
      next: CopySequenceState
      reason: 'unavailable' | 'rejected'
      detail: string
      manualText: string
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

/** Write the current chart search before returning an advanced sequence. */
export async function writeCurrentCopyAndAdvance(
  sequence: CopySequenceState,
  chart: ChartData,
  clipboard: ClipboardWriter | undefined,
): Promise<CopySequenceWriteResult> {
  const manualText = buildSingleChartSearch(chart)
  if (!clipboard?.writeText) {
    return {
      ok: false,
      next: sequence,
      reason: 'unavailable',
      detail: 'The Clipboard API is unavailable in this browser.',
      manualText,
    }
  }

  try {
    await clipboard.writeText(manualText)
    return { ok: true, next: advanceCopySequence(sequence) }
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? error.message : 'Clipboard access was denied.'
    return { ok: false, next: sequence, reason: 'rejected', detail, manualText }
  }
}
