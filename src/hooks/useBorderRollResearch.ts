import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { BorderRerollCostMatch } from '../logic/borderOcr'
import type { VoyageResearchFinishResult } from '../logic/voyageFinish'
import {
  getBorderRollSequence,
  nextBorderRollIndex,
  type BorderResearchStore,
} from '../logic/borderRollResearch'
import type { BorderSubmissionStore } from '../logic/borderRollSubmission'
import { createBrowserBorderResearchService } from '../logic/borderResearchBrowser'
import { REROLL_COSTS } from '../logic/rerollAdvice'
import type { Borders } from '../types'

export interface BorderRollResearchController {
  store: BorderResearchStore
  submissionStore: BorderSubmissionStore
  gamePatch: string
  message: string
  endpointConfigured: boolean
  activeSamples: ReturnType<typeof getBorderRollSequence>
  nextRollIndex: number
  displayedNextRerollCost: number | null
  vesperUpgradeCount: number | null
  setGamePatch: (value: string) => void
  setVesperUpgradeCount: (value: number | null) => void
  setRandomizedResearchEnabled: (enabled: boolean) => void
  setAutoSubmitEnabled: (enabled: boolean) => void
  setSubmissionKey: (value: string) => void
  submitQueuedSequences: () => void
  recordCurrentRoll: (borders: Borders) => string
  captureImportedRoll: (borders: Borders, rerollCost: BorderRerollCostMatch | null) => string
  startNextSequence: () => void
  removeSample: (sampleId: string) => void
  archiveSequence: (sequenceId: string) => void
  restoreSequence: (sequenceId: string) => void
  cancelQueuedSequence: (sequenceId: string) => void
  retryQueuedSequence: (sequenceId: string) => void
  retryResearchRecovery: () => void
  resetResearchStore: () => void
  retrySubmissionRecovery: () => void
  resetSubmissionStore: () => void
  finishVoyage: (expectedSequenceId: string) => VoyageResearchFinishResult
}

export function useBorderRollResearch(currentBorders: Borders): BorderRollResearchController {
  const [service] = useState(createBrowserBorderResearchService)
  const { store, submissionStore, gamePatch, message } = useSyncExternalStore(
    service.subscribe,
    service.getSnapshot,
    service.getSnapshot,
  )

  useEffect(() => {
    service.start()
    return service.stop
  }, [service])

  const activeSamples = useMemo(
    () => getBorderRollSequence(store.samples, store.activeSequenceId),
    [store.activeSequenceId, store.samples],
  )
  const nextRollIndex = nextBorderRollIndex(activeSamples)
  const setRandomizedResearchEnabled = useCallback(
    (enabled: boolean) => {
      service.setRandomizedResearchEnabled(
        enabled,
        currentBorders.every((border) => border !== null),
      )
    },
    [service, currentBorders],
  )

  return {
    ...service,
    store,
    submissionStore,
    gamePatch,
    message,
    activeSamples,
    nextRollIndex,
    displayedNextRerollCost: REROLL_COSTS[nextRollIndex] ?? null,
    vesperUpgradeCount: store.vesperUpgradeCount,
    setRandomizedResearchEnabled,
  }
}
