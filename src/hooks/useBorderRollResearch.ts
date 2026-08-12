import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BorderRerollCostMatch } from '../logic/borderOcr'
import type { VoyageResearchFinishResult } from '../logic/voyageFinish'
import {
  addBorderRollSample,
  archiveBorderRollSequence,
  createBorderRollSample,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  loadBorderResearch,
  nextBorderRollIndex,
  removeBorderRollSample,
  resetBorderResearch,
  restoreBorderRollSequence,
  saveBorderResearch,
  setCurrentVesperUpgradeCount,
  setRandomizedResearchEnabled,
  startBorderRollSequence,
  type BorderResearchStore,
} from '../logic/borderRollResearch'
import {
  BORDER_ROLL_INTAKE_URL,
  enqueueBorderRollSequence,
  loadBorderSubmissionStore,
  markQueuedBorderSubmissionFailed,
  nextPendingBorderSubmission,
  removeQueuedBorderSubmission,
  resetBorderSubmissionStore,
  retryQueuedBorderSubmission,
  saveBorderSubmissionStore,
  sendQueuedBorderSubmission,
  updateBorderSubmissionSettings,
  type BorderSubmissionStore,
} from '../logic/borderRollSubmission'
import { unavailableAuxiliaryStore } from '../logic/auxiliaryStorageRecovery'
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

export function useBorderRollResearch(): BorderRollResearchController {
  const [store, setStore] = useState<BorderResearchStore>(loadBorderResearch)
  const [submissionStore, setSubmissionStore] =
    useState<BorderSubmissionStore>(loadBorderSubmissionStore)
  const [gamePatch, setGamePatch] = useState(
    () => store.samples[store.samples.length - 1]?.gamePatch ?? '3.29.2',
  )
  const [message, setMessage] = useState('')
  const storeRef = useRef(store)
  const submissionRef = useRef(submissionStore)
  const submittingRef = useRef(false)
  const activeSubmissionRef = useRef<{
    sequenceId: string
    controller: AbortController
  } | null>(null)

  const activeSamples = useMemo(
    () => getBorderRollSequence(store.samples, store.activeSequenceId),
    [store.activeSequenceId, store.samples],
  )
  const nextRollIndex = nextBorderRollIndex(activeSamples)
  const displayedNextRerollCost = REROLL_COSTS[nextRollIndex] ?? null

  const commitStore = useCallback((next: BorderResearchStore) => {
    if (storeRef.current.recovery) {
      setMessage('Border research writes are paused until storage recovery is resolved.')
      return false
    }
    if (!saveBorderResearch(next)) {
      const blocked = {
        ...storeRef.current,
        recovery: unavailableAuxiliaryStore('Border research storage became unavailable.'),
      }
      storeRef.current = blocked
      setStore(blocked)
      setMessage('Border research storage became unavailable; further writes are paused.')
      return false
    }
    storeRef.current = next
    setStore(next)
    return true
  }, [])

  const commitSubmissionStore = useCallback((next: BorderSubmissionStore) => {
    if (submissionRef.current.recovery) {
      setMessage('Submission queue writes are paused until storage recovery is resolved.')
      return false
    }
    if (!saveBorderSubmissionStore(next)) {
      const blocked = {
        ...submissionRef.current,
        recovery: unavailableAuxiliaryStore('Border submission storage became unavailable.'),
      }
      submissionRef.current = blocked
      setSubmissionStore(blocked)
      setMessage('Border submission storage became unavailable; further writes are paused.')
      return false
    }
    submissionRef.current = next
    setSubmissionStore(next)
    return true
  }, [])

  const flushQueue = useCallback(async () => {
    if (submittingRef.current) return
    if (storeRef.current.recovery) return
    const current = submissionRef.current
    if (current.recovery) return
    const item = nextPendingBorderSubmission(current)
    if (
      !item ||
      !current.settings.enabled ||
      !current.settings.submissionKey.trim() ||
      !BORDER_ROLL_INTAKE_URL
    ) {
      return
    }

    submittingRef.current = true
    const abortController = new AbortController()
    activeSubmissionRef.current = { sequenceId: item.sequenceId, controller: abortController }
    try {
      const currentSamples = getBorderRollSequence(storeRef.current.samples, item.sequenceId)
      const result = await sendQueuedBorderSubmission(item, {
        endpoint: BORDER_ROLL_INTAKE_URL,
        submissionKey: current.settings.submissionKey,
        currentSamples,
        signal: abortController.signal,
      })
      const delivery = `${result.status === 'created' ? 'Submitted' : 'Already submitted'} Voyage ${item.sequenceId.slice(-8)} as issue #${result.issueNumber}`
      const researchAfterDelivery = archiveBorderRollSequence(
        storeRef.current.activeSequenceId === item.sequenceId
          ? startBorderRollSequence(storeRef.current)
          : storeRef.current,
        item.sequenceId,
      )
      if (!commitStore(researchAfterDelivery)) {
        setMessage(
          `${delivery}, but border research storage became unavailable. The Voyage was not archived and remains queued for recovery.`,
        )
        return
      }
      if (
        !commitSubmissionStore(removeQueuedBorderSubmission(submissionRef.current, item.sequenceId))
      ) {
        setMessage(
          `${delivery} and archived it locally, but submission queue storage became unavailable. Its queue entry remains for recovery.`,
        )
        return
      }
      setMessage(`${delivery}.`)
      queueMicrotask(() => void flushQueue())
    } catch (error) {
      if (!submissionRef.current.queue.some((queued) => queued.sequenceId === item.sequenceId)) {
        queueMicrotask(() => void flushQueue())
        return
      }
      const errorMessage = error instanceof Error ? error.message : 'Automatic submission failed'
      if (
        !commitSubmissionStore(
          markQueuedBorderSubmissionFailed(submissionRef.current, item.sequenceId, errorMessage),
        )
      ) {
        return
      }
      setMessage(
        `${errorMessage} The Voyage remains queued for an explicit retry; later Voyages will continue.`,
      )
      queueMicrotask(() => void flushQueue())
    } finally {
      if (activeSubmissionRef.current?.sequenceId === item.sequenceId) {
        activeSubmissionRef.current = null
      }
      submittingRef.current = false
    }
  }, [commitStore, commitSubmissionStore])

  const addSample = useCallback(
    (borders: Borders, rerollIndex: number, nextCost: number | null, automatic = false): string => {
      const current = storeRef.current
      const existing = getBorderRollSequence(current.samples, current.activeSequenceId)
      const sequencePatch = existing[0]?.gamePatch ?? gamePatch
      const sequenceVesperUpgradeCount =
        existing.length > 0 ? existing[0].vesperUpgradeCount : current.vesperUpgradeCount
      const created = createBorderRollSample({
        sequenceId: current.activeSequenceId,
        gamePatch: sequencePatch,
        vesperUpgradeCount: sequenceVesperUpgradeCount,
        samplingReason: current.activeSequenceSamplingReason,
        rerollIndex,
        displayedNextRerollCost: nextCost,
        borders,
      })
      if (!created.ok) {
        setMessage(created.message)
        return created.message
      }
      const added = addBorderRollSample(current, created.sample)
      if (added.status === 'duplicate') {
        const duplicate = `Roll ${rerollIndex} is already saved for this Voyage.`
        setMessage(duplicate)
        return duplicate
      }
      if (added.status === 'conflict') {
        const conflict = `Roll ${rerollIndex} conflicts with the saved scan; correct it in the research panel.`
        setMessage(conflict)
        return conflict
      }
      if (!commitStore(added.store)) {
        return 'Border research storage needs recovery; the roll was not saved.'
      }
      const saved = `${automatic ? 'Auto-saved' : 'Saved'} ${
        rerollIndex === 0 ? 'natural board' : `paid reroll ${rerollIndex}`
      }`
      setMessage(`${saved}: 12 modifiers.`)
      return saved
    },
    [commitStore, gamePatch],
  )

  const recordCurrentRoll = useCallback(
    (borders: Borders) => {
      const currentSamples = getBorderRollSequence(
        storeRef.current.samples,
        storeRef.current.activeSequenceId,
      )
      const index = nextBorderRollIndex(currentSamples)
      return addSample(borders, index, REROLL_COSTS[index] ?? null)
    },
    [addSample],
  )

  const captureImportedRoll = useCallback(
    (borders: Borders, rerollCost: BorderRerollCostMatch | null) => {
      if (borders.some((id) => id === null)) return 'Border scan was not saved: all 12 must match.'
      const currentSamples = getBorderRollSequence(
        storeRef.current.samples,
        storeRef.current.activeSequenceId,
      )
      if (!rerollCost && currentSamples.length > 0) {
        const skipped = 'Border scan was not auto-saved: reroll cost was not recognised.'
        setMessage(skipped)
        return skipped
      }
      const index = rerollCost?.rerollsUsed ?? 0
      return addSample(borders, index, rerollCost?.cost ?? REROLL_COSTS[index] ?? null, true)
    },
    [addSample],
  )

  const startNextSequence = useCallback(() => {
    if (!commitStore(startBorderRollSequence(storeRef.current))) return
    setMessage('Started a new Voyage sequence. Its first complete scan will be roll 0.')
  }, [commitStore])

  const setResearchSamplingEnabled = useCallback(
    (enabled: boolean) => {
      const current = storeRef.current
      const next = setRandomizedResearchEnabled(current, enabled)
      if (!commitStore(next)) return
      const activeSamples = getBorderRollSequence(current.samples, current.activeSequenceId)
      setMessage(
        enabled
          ? activeSamples.length > 0
            ? 'Randomized research enabled. Assignment starts with the next Voyage.'
            : next.activeSequenceSamplingReason === 'randomized-research'
              ? 'Randomized research enabled: this Voyage was assigned one research reroll.'
              : 'Randomized research enabled: this Voyage stays normal gameplay.'
          : 'Randomized research disabled. Existing sequence labels were preserved.',
      )
    },
    [commitStore],
  )

  const setVesperUpgradeCount = useCallback(
    (value: number | null) => {
      const current = storeRef.current
      const activeSamples = getBorderRollSequence(current.samples, current.activeSequenceId)
      const protectsLegacySequence =
        value !== null &&
        current.vesperUpgradeCount === null &&
        activeSamples.some((sample) => sample.vesperUpgradeCount === null)
      const updated = setCurrentVesperUpgradeCount(current, value)
      const next = protectsLegacySequence ? startBorderRollSequence(updated) : updated
      if (!commitStore(next)) return
      const queuedSequenceChanged =
        submissionRef.current.queue.some((item) => item.sequenceId === current.activeSequenceId) &&
        JSON.stringify(getBorderRollSequence(current.samples, current.activeSequenceId)) !==
          JSON.stringify(getBorderRollSequence(next.samples, current.activeSequenceId))
      if (queuedSequenceChanged) {
        if (activeSubmissionRef.current?.sequenceId === current.activeSequenceId) {
          activeSubmissionRef.current.controller.abort()
        }
        if (
          !commitSubmissionStore(
            removeQueuedBorderSubmission(submissionRef.current, current.activeSequenceId),
          )
        ) {
          return
        }
      }
      setMessage(
        queuedSequenceChanged
          ? `Vesper progress changed; canceled the stale queued Voyage ${current.activeSequenceId.slice(-8)}.`
          : value === null
            ? 'Select Superior Sovereign progress before saving another roll.'
            : protectsLegacySequence
              ? `Vesper ${value}/5 saved. Started a new Voyage so legacy samples remain unknown.`
              : `New rolls will be tagged with Vesper ${value}/5.`,
      )
    },
    [commitStore, commitSubmissionStore],
  )

  const finishVoyage = useCallback(
    (expectedSequenceId: string): VoyageResearchFinishResult => {
      const current = storeRef.current
      if (current.activeSequenceId !== expectedSequenceId) {
        return {
          ok: false,
          message:
            'Finish Voyage canceled: the border-research Voyage changed after confirmation started. No charts were consumed.',
        }
      }
      const sequence = getBorderRollSequence(current.samples, current.activeSequenceId)
      const settings = submissionRef.current.settings
      let summary: string
      let queuedForSubmission = false

      if (sequence.length === 0) {
        summary = 'no border scans recorded'
      } else if (!isCompleteBorderRollSequence(sequence)) {
        summary = 'incomplete border sequence kept locally'
      } else if (!settings.enabled) {
        summary = `${sequence.length} border roll${sequence.length === 1 ? '' : 's'} saved locally`
      } else if (!BORDER_ROLL_INTAKE_URL || !settings.submissionKey.trim()) {
        summary = 'border sequence saved; automatic submission needs setup'
      } else {
        if (!commitSubmissionStore(enqueueBorderRollSequence(submissionRef.current, sequence))) {
          return {
            ok: false,
            message:
              'Finish Voyage canceled: submission queue storage needs recovery. No charts were consumed and the border sequence was not advanced.',
          }
        }
        summary = `${sequence.length} border roll${sequence.length === 1 ? '' : 's'} queued for submission`
        queuedForSubmission = true
      }

      if (!commitStore(startBorderRollSequence(current))) {
        return {
          ok: false,
          message: queuedForSubmission
            ? 'Finish Voyage canceled: the border sequence was queued, but research storage needs recovery. No charts were consumed and the sequence was not advanced.'
            : 'Finish Voyage canceled: border research storage needs recovery. No charts were consumed and the sequence was not advanced.',
        }
      }
      if (queuedForSubmission) queueMicrotask(() => void flushQueue())
      return { ok: true, summary }
    },
    [commitStore, commitSubmissionStore, flushQueue],
  )

  const setAutoSubmitEnabled = useCallback(
    (enabled: boolean) => {
      if (
        !commitSubmissionStore(updateBorderSubmissionSettings(submissionRef.current, { enabled }))
      ) {
        return
      }
      if (enabled) queueMicrotask(() => void flushQueue())
    },
    [commitSubmissionStore, flushQueue],
  )

  const setSubmissionKey = useCallback(
    (submissionKey: string) => {
      if (
        !commitSubmissionStore(
          updateBorderSubmissionSettings(submissionRef.current, { submissionKey }),
        )
      ) {
        return
      }
    },
    [commitSubmissionStore],
  )

  const submitQueuedSequences = useCallback(() => {
    queueMicrotask(() => void flushQueue())
  }, [flushQueue])

  useEffect(() => {
    void flushQueue()
  }, [flushQueue])

  const retryResearchRecovery = useCallback(() => {
    const next = loadBorderResearch()
    storeRef.current = next
    setStore(next)
    setMessage(
      next.recovery
        ? next.recovery.message
        : 'Border research storage was decoded and normal writes resumed.',
    )
  }, [])

  const resetResearchStore = useCallback(() => {
    const next = resetBorderResearch()
    storeRef.current = next
    setStore(next)
    setMessage(
      next.recovery
        ? next.recovery.message
        : 'Border research was explicitly reset; the quarantined backup was preserved.',
    )
  }, [])

  const retrySubmissionRecovery = useCallback(() => {
    const next = loadBorderSubmissionStore()
    submissionRef.current = next
    setSubmissionStore(next)
    setMessage(
      next.recovery
        ? next.recovery.message
        : 'Submission queue storage was decoded and normal writes resumed.',
    )
  }, [])

  const resetSubmissionStore = useCallback(() => {
    const next = resetBorderSubmissionStore()
    submissionRef.current = next
    setSubmissionStore(next)
    setMessage(
      next.recovery
        ? next.recovery.message
        : 'Submission queue was explicitly reset; the quarantined backup was preserved.',
    )
  }, [])

  const removeSample = useCallback(
    (sampleId: string) => {
      const sample = storeRef.current.samples.find((candidate) => candidate.sampleId === sampleId)
      if (!sample || !commitStore(removeBorderRollSample(storeRef.current, sampleId))) return

      const wasQueued = submissionRef.current.queue.some(
        (item) => item.sequenceId === sample.sequenceId,
      )
      if (wasQueued) {
        if (activeSubmissionRef.current?.sequenceId === sample.sequenceId) {
          activeSubmissionRef.current.controller.abort()
        }
        if (
          !commitSubmissionStore(
            removeQueuedBorderSubmission(submissionRef.current, sample.sequenceId),
          )
        ) {
          return
        }
      }
      setMessage(
        wasQueued
          ? 'Removed the local sample and canceled its stale queued submission.'
          : 'Removed the local sample.',
      )
    },
    [commitStore, commitSubmissionStore],
  )

  const cancelQueuedSequence = useCallback(
    (sequenceId: string) => {
      if (!submissionRef.current.queue.some((item) => item.sequenceId === sequenceId)) return
      if (activeSubmissionRef.current?.sequenceId === sequenceId) {
        activeSubmissionRef.current.controller.abort()
      }
      if (!commitSubmissionStore(removeQueuedBorderSubmission(submissionRef.current, sequenceId))) {
        return
      }
      setMessage(`Canceled queued Voyage ${sequenceId.slice(-8)}.`)
      queueMicrotask(() => void flushQueue())
    },
    [commitSubmissionStore, flushQueue],
  )

  const retryQueuedSequence = useCallback(
    (sequenceId: string) => {
      const item = submissionRef.current.queue.find((queued) => queued.sequenceId === sequenceId)
      if (!item || item.delivery.status !== 'failed') return
      if (!commitSubmissionStore(retryQueuedBorderSubmission(submissionRef.current, sequenceId))) {
        return
      }
      setMessage(`Retrying queued Voyage ${sequenceId.slice(-8)}.`)
      queueMicrotask(() => void flushQueue())
    },
    [commitSubmissionStore, flushQueue],
  )

  const archiveSequence = useCallback(
    (sequenceId: string) => {
      if (!commitStore(archiveBorderRollSequence(storeRef.current, sequenceId))) return
      setMessage('Archived the submitted Voyage locally.')
    },
    [commitStore],
  )

  const restoreSequence = useCallback(
    (sequenceId: string) => {
      if (!commitStore(restoreBorderRollSequence(storeRef.current, sequenceId))) return
      setMessage('Restored the Voyage to the saved sequence list.')
    },
    [commitStore],
  )

  return {
    store,
    submissionStore,
    gamePatch,
    message,
    endpointConfigured: !!BORDER_ROLL_INTAKE_URL,
    activeSamples,
    nextRollIndex,
    displayedNextRerollCost,
    vesperUpgradeCount: store.vesperUpgradeCount,
    setGamePatch,
    setVesperUpgradeCount,
    setRandomizedResearchEnabled: setResearchSamplingEnabled,
    setAutoSubmitEnabled,
    setSubmissionKey,
    submitQueuedSequences,
    recordCurrentRoll,
    captureImportedRoll,
    startNextSequence,
    removeSample,
    archiveSequence,
    restoreSequence,
    cancelQueuedSequence,
    retryQueuedSequence,
    retryResearchRecovery,
    resetResearchStore,
    retrySubmissionRecovery,
    resetSubmissionStore,
    finishVoyage,
  }
}
