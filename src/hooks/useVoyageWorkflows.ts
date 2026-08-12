import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import type { AppState } from '../logic/storage'
import {
  createVoyageFinishSnapshot,
  validateVoyageFinishSnapshot,
  type VoyageFinishSnapshot,
  type VoyageResearchFinishResult,
} from '../logic/voyageFinish'
import { summarizeVoyageFinish, type AppStateAction } from '../state/appStateReducer'
import {
  advanceCopySequence,
  CopyAttemptGuard,
  currentCopyEntry,
  settleCopyAttempt,
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
  snapshot: VoyageFinishSnapshot
}

export function useVoyageWorkflows(
  state: AppState,
  chartMap: Map<string, ChartData>,
  dispatch: Dispatch<AppStateAction>,
  researchSequenceId: string,
  onCommitFinish?: (expectedSequenceId: string) => VoyageResearchFinishResult,
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
  const copyAttempt = useRef(new CopyAttemptGuard())
  const previousState = useRef(state)

  const invalidateCopyAttempt = useCallback(() => {
    copyAttempt.current.invalidate()
    setCopyPending(false)
  }, [])

  const cancelCopySequence = useCallback(() => {
    invalidateCopyAttempt()
    setCopyFailure(null)
    setCopySequence(null)
  }, [invalidateCopyAttempt])

  const stopUnavailableCopySequence = useCallback(() => {
    cancelCopySequence()
    setVoyageMessage(
      'Copy sequence stopped: a chart from the original sequence is no longer in your library. Review the board and start Copy into game again.',
    )
    window.setTimeout(() => setVoyageMessage(''), 5000)
  }, [cancelCopySequence])

  const commitFinish = useCallback(
    (keptUids: Set<string>, snapshot: VoyageFinishSnapshot) => {
      const validation = validateVoyageFinishSnapshot(state, researchSequenceId, snapshot)
      if (!validation.ok) {
        setPreserveConfirmation(null)
        setVoyageMessage(
          validation.reason === 'board-changed'
            ? 'Finish Voyage canceled: the board changed after confirmation started. No charts were consumed.'
            : 'Finish Voyage canceled: the border-research Voyage changed after confirmation started. No charts were consumed.',
        )
        window.setTimeout(() => setVoyageMessage(''), 5000)
        return
      }

      const researchResult = onCommitFinish?.(snapshot.researchSequenceId)
      if (researchResult && !researchResult.ok) {
        setPreserveConfirmation(null)
        setVoyageMessage(researchResult.message)
        window.setTimeout(() => setVoyageMessage(''), 5000)
        return
      }

      const { consumed, kept } = summarizeVoyageFinish(state, keptUids, snapshot.boardUids)
      const borderSummary = researchResult?.summary ?? ''
      dispatch({
        type: 'voyage/finish',
        keptUids: [...keptUids],
        boardUids: [...snapshot.boardUids],
      })
      setVoyageMessage(
        `Voyage finished: consumed ${consumed} chart${consumed === 1 ? '' : 's'}` +
          (kept ? `, kept ${kept}` : '') +
          (borderSummary ? ` · ${borderSummary}` : ''),
      )
      window.setTimeout(() => setVoyageMessage(''), 4000)
      setPreserveConfirmation(null)
    },
    [dispatch, onCommitFinish, researchSequenceId, state],
  )
  const finishVoyage = useCallback(() => {
    const snapshot = createVoyageFinishSnapshot(state, researchSequenceId)
    const preserved = snapshot.boardUids
      .filter((uid): uid is string => uid !== null)
      .map((uid) => chartMap.get(uid))
      .filter((chart): chart is ChartData => !!chart && !!chart.preserved)
    if (preserved.length === 0) commitFinish(new Set(), snapshot)
    else setPreserveConfirmation({ charts: preserved, index: 0, kept: [], snapshot })
  }, [chartMap, commitFinish, researchSequenceId, state])
  const decidePreserve = useCallback(
    (survived: boolean) => {
      if (!preserveConfirmation) return
      const { charts, index, kept, snapshot } = preserveConfirmation
      const nextKept = survived ? [...kept, charts[index].uid] : kept
      if (index + 1 >= charts.length) commitFinish(new Set(nextKept), snapshot)
      else setPreserveConfirmation({ charts, index: index + 1, kept: nextKept, snapshot })
    },
    [commitFinish, preserveConfirmation],
  )
  const copyCurrentAndAdvance = useCallback(async () => {
    if (!copySequence) return
    const attempt = copyAttempt.current.begin()
    if (attempt === null) return
    const chart = chartMap.get(currentCopyEntry(copySequence).chartUid)
    if (!chart) {
      copyAttempt.current.finish(attempt)
      stopUnavailableCopySequence()
      return
    }
    setCopyPending(true)
    try {
      const result = await settleCopyAttempt(
        copyAttempt.current,
        attempt,
        writeCurrentCopyAndAdvance(copySequence, chart, navigator.clipboard),
      )
      if (!result) return
      if (!result.ok) {
        setCopyFailure(result)
        return
      }
      setCopyFailure(null)
      setCopySequence(result.next)
    } finally {
      if (copyAttempt.current.finish(attempt)) setCopyPending(false)
    }
  }, [chartMap, copySequence, stopUnavailableCopySequence])

  const confirmManualCopy = useCallback(() => {
    if (!copySequence || !copyFailure) return
    setCopyFailure(null)
    setCopySequence(advanceCopySequence(copySequence))
  }, [copyFailure, copySequence])

  useEffect(() => {
    if (previousState.current === state) return
    previousState.current = state
    if (copyAttempt.current.isPending) invalidateCopyAttempt()
  }, [invalidateCopyAttempt, state])

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
        cancelCopySequence()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cancelCopySequence, copyCurrentAndAdvance, copySequence])

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
    cancelPreserveConfirmation: () => {
      setPreserveConfirmation(null)
      setVoyageMessage('Finish Voyage canceled. No charts were consumed.')
      window.setTimeout(() => setVoyageMessage(''), 4000)
    },
    startCopySequence: () => {
      invalidateCopyAttempt()
      setCopyFailure(null)
      setCopySequence(startCopySequence(state.board))
    },
    copyCurrentAndAdvance,
    confirmManualCopy,
    cancelCopySequence,
  }
}
