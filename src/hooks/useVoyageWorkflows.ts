import { useCallback, useEffect, useState, type Dispatch } from 'react'
import { buildSingleChartSearch } from '../logic/regex'
import type { AppState } from '../logic/storage'
import { summarizeVoyageFinish, type AppStateAction } from '../state/appStateReducer'
import {
  advanceCopySequence,
  currentCopyCell,
  startCopySequence,
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
  const copyCurrentAndAdvance = useCallback(() => {
    if (!copySequence) return
    const placement = state.board[currentCopyCell(copySequence)]!
    const chart = chartMap.get(placement.chartUid)
    if (chart) navigator.clipboard.writeText(buildSingleChartSearch(chart)).catch(() => {})
    setCopySequence(advanceCopySequence(copySequence))
  }, [chartMap, copySequence, state.board])

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
    ? (state.board[currentCopyCell(copySequence)]?.chartUid ?? null)
    : preserveConfirmation
      ? preserveConfirmation.charts[preserveConfirmation.index].uid
      : null

  return {
    voyageMessage,
    preserveConfirmation,
    copySequence,
    sequenceActive,
    highlightUid,
    finishVoyage,
    decidePreserve,
    startCopySequence: () => setCopySequence(startCopySequence(state.board)),
    copyCurrentAndAdvance,
    cancelCopySequence: () => setCopySequence(null),
  }
}
