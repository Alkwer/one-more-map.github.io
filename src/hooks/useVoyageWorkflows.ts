import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import type { AppState } from '../logic/storage'
import { summarizeVoyageFinish, type AppStateAction } from '../state/appStateReducer'
import {
  advanceCopySequence,
  currentCopyEntry,
  startCopySequence,
  writeCurrentCopyAndAdvance,
  type CopySequenceWriteResult,
  type CopySequenceState,
} from '../state/copySequence'
import type { ChartData } from '../types'

export interface PreserveConfirmation {
  charts: ChartData[]
  index: number
  kept: string[]
}

export function useVoyageWorkflows(
  state: AppState,
  chartMap: Map<string, ChartData>,
  dispatch: Dispatch<AppStateAction>,
  onCommitFinish?: () => string,
) {
  const [voyageMessage, setVoyageMessage] = useState('')
  const [preserveConfirmation, setPreserveConfirmation] = useState<PreserveConfirmation | null>(
    null,
  )
  const [copySequence, setCopySequence] = useState<CopySequenceState | null>(null)
  const [copyFailure, setCopyFailure] = useState<Extract<
    CopySequenceWriteResult,
    { ok: false }
  > | null>(null)
  const [copyPending, setCopyPending] = useState(false)
  const copyInFlight = useRef(false)

  const stopUnavailableCopySequence = useCallback(() => {
    setCopySequence(null)
    setCopyFailure(null)
    setVoyageMessage(
      'Copy sequence stopped: a chart from the original sequence is no longer in your library. Review the board and start Copy into game again.',
    )
    window.setTimeout(() => setVoyageMessage(''), 5000)
  }, [])

  const commitFinish = useCallback(
    (keptUids: Set<string>) => {
      const { consumed, kept } = summarizeVoyageFinish(state, keptUids)
      const borderSummary = onCommitFinish?.() ?? ''
      dispatch({ type: 'voyage/finish', keptUids: [...keptUids] })
      setVoyageMessage(
        `Voyage finished: consumed ${consumed} chart${consumed === 1 ? '' : 's'}` +
          (kept ? `, kept ${kept}` : '') +
          (borderSummary ? ` · ${borderSummary}` : ''),
      )
      window.setTimeout(() => setVoyageMessage(''), 4000)
      setPreserveConfirmation(null)
    },
    [dispatch, onCommitFinish, state],
  )
  const finishVoyage = useCallback(() => {
    const preserved = state.board
      .filter(Boolean)
      .map((placement) => chartMap.get(placement!.chartUid))
      .filter((chart): chart is ChartData => !!chart && !!chart.preserved)
    if (preserved.length === 0) commitFinish(new Set())
    else setPreserveConfirmation({ charts: preserved, index: 0, kept: [] })
  }, [chartMap, commitFinish, state.board])
  const decidePreserve = useCallback(
    (survived: boolean) => {
      if (!preserveConfirmation) return
      const { charts, index, kept } = preserveConfirmation
      const nextKept = survived ? [...kept, charts[index].uid] : kept
      if (index + 1 >= charts.length) commitFinish(new Set(nextKept))
      else setPreserveConfirmation({ charts, index: index + 1, kept: nextKept })
    },
    [commitFinish, preserveConfirmation],
  )
  const copyCurrentAndAdvance = useCallback(async () => {
    if (!copySequence || copyInFlight.current) return
    const chart = chartMap.get(currentCopyEntry(copySequence).chartUid)
    if (!chart) {
      stopUnavailableCopySequence()
      return
    }
    copyInFlight.current = true
    setCopyPending(true)
    try {
      const result = await writeCurrentCopyAndAdvance(copySequence, chart, navigator.clipboard)
      if (!result.ok) {
        setCopyFailure(result)
        return
      }
      setCopyFailure(null)
      setCopySequence(result.next)
    } finally {
      copyInFlight.current = false
      setCopyPending(false)
    }
  }, [chartMap, copySequence, stopUnavailableCopySequence])

  const confirmManualCopy = useCallback(() => {
    if (!copySequence || !copyFailure) return
    setCopyFailure(null)
    setCopySequence(advanceCopySequence(copySequence))
  }, [copyFailure, copySequence])

  useEffect(() => {
    if (!copySequence) return
    if (!chartMap.has(currentCopyEntry(copySequence).chartUid)) {
      stopUnavailableCopySequence()
    }
  }, [chartMap, copySequence, stopUnavailableCopySequence])

  useEffect(() => {
    if (!copySequence) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault()
        copyCurrentAndAdvance()
      } else if (event.key === 'Escape') {
        setCopySequence(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [copyCurrentAndAdvance, copySequence])

  const sequenceActive = !!copySequence || !!preserveConfirmation
  const highlightUid = copySequence
    ? currentCopyEntry(copySequence).chartUid
    : preserveConfirmation
      ? preserveConfirmation.charts[preserveConfirmation.index].uid
      : null

  return {
    voyageMessage,
    preserveConfirmation,
    copySequence,
    copyFailure,
    copyPending,
    sequenceActive,
    highlightUid,
    finishVoyage,
    decidePreserve,
    startCopySequence: () => {
      setCopyFailure(null)
      setCopySequence(startCopySequence(state.board))
    },
    copyCurrentAndAdvance,
    confirmManualCopy,
    cancelCopySequence: () => {
      setCopyFailure(null)
      setCopySequence(null)
    },
  }
}
