import { buildSingleChartSearch } from '../logic/regex'
import { writeClipboardText, type ClipboardWriter } from '../logic/clipboard'
import type { Board, ChartData } from '../types'

export type { ClipboardWriter } from '../logic/clipboard'

export const BOARD_FILL_ORDER = [6, 7, 8, 3, 4, 5, 0, 1, 2] as const

export interface CopySequenceEntry {
  cell: number
  chartUid: string
}

export interface CopySequenceState {
  order: CopySequenceEntry[]
  step: number
}

export type CopySequenceWriteResult =
  | {
      ok: true
      next: CopySequenceState | null
    }
  | {
      ok: false
      next: CopySequenceState
      reason: 'unavailable' | 'rejected' | 'invalid'
      detail: string
      manualText: string | null
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
  const search = buildSingleChartSearch(chart)
  if (!search.ok) {
    return {
      ok: false,
      next: sequence,
      reason: 'invalid',
      detail: search.message,
      manualText: null,
    }
  }
  const result = await writeClipboardText(search.regex, clipboard)
  return result.ok
    ? { ok: true, next: advanceCopySequence(sequence) }
    : { ...result, next: sequence }
}
