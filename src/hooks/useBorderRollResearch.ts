import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BorderRerollCostMatch } from '../logic/borderOcr'
import {
  addBorderRollSample,
  createBorderRollSample,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  loadBorderResearch,
  nextBorderRollIndex,
  removeBorderRollSample,
  saveBorderResearch,
  startBorderRollSequence,
  type BorderResearchStore,
} from '../logic/borderRollResearch'
import {
  BORDER_ROLL_INTAKE_URL,
  enqueueBorderRollSequence,
  loadBorderSubmissionStore,
  removeQueuedBorderSubmission,
  saveBorderSubmissionStore,
  sendQueuedBorderSubmission,
  updateBorderSubmissionSettings,
  type BorderSubmissionStore,
} from '../logic/borderRollSubmission'
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
  setGamePatch: (value: string) => void
  setAutoSubmitEnabled: (enabled: boolean) => void
  setSubmissionKey: (value: string) => void
  recordCurrentRoll: (borders: Borders) => string
  captureImportedRoll: (borders: Borders, rerollCost: BorderRerollCostMatch | null) => string
  startNextSequence: () => void
  removeSample: (sampleId: string) => void
  finishVoyage: () => string
}

export function useBorderRollResearch(): BorderRollResearchController {
  const [store, setStore] = useState<BorderResearchStore>(loadBorderResearch)
  const [submissionStore, setSubmissionStore] =
    useState<BorderSubmissionStore>(loadBorderSubmissionStore)
  const [gamePatch, setGamePatch] = useState(
    () => store.samples[store.samples.length - 1]?.gamePatch ?? '3.29',
  )
  const [message, setMessage] = useState('')
  const storeRef = useRef(store)
  const submissionRef = useRef(submissionStore)
  const submittingRef = useRef(false)

  const activeSamples = useMemo(
    () => getBorderRollSequence(store.samples, store.activeSequenceId),
    [store.activeSequenceId, store.samples],
  )
  const nextRollIndex = nextBorderRollIndex(activeSamples)
  const displayedNextRerollCost = REROLL_COSTS[nextRollIndex] ?? null

  const commitStore = useCallback((next: BorderResearchStore) => {
    storeRef.current = next
    setStore(next)
    saveBorderResearch(next)
  }, [])

  const commitSubmissionStore = useCallback((next: BorderSubmissionStore) => {
    submissionRef.current = next
    setSubmissionStore(next)
    saveBorderSubmissionStore(next)
  }, [])

  const flushQueue = useCallback(async () => {
    if (submittingRef.current) return
    const current = submissionRef.current
    const item = current.queue[0]
    if (
      !item ||
      !current.settings.enabled ||
      !current.settings.submissionKey.trim() ||
      !BORDER_ROLL_INTAKE_URL
    ) {
      return
    }

    submittingRef.current = true
    try {
      const result = await sendQueuedBorderSubmission(item, {
        endpoint: BORDER_ROLL_INTAKE_URL,
        submissionKey: current.settings.submissionKey,
      })
      commitSubmissionStore(removeQueuedBorderSubmission(submissionRef.current, item.sequenceId))
      setMessage(
        `${result.status === 'created' ? 'Submitted' : 'Already submitted'} Voyage ${item.sequenceId.slice(-8)} as issue #${result.issueNumber}.`,
      )
      queueMicrotask(() => void flushQueue())
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : 'Automatic submission failed'} The Voyage remains queued locally.`,
      )
    } finally {
      submittingRef.current = false
    }
  }, [commitSubmissionStore])

  const addSample = useCallback(
    (borders: Borders, rerollIndex: number, nextCost: number | null, automatic = false): string => {
      const current = storeRef.current
      const existing = getBorderRollSequence(current.samples, current.activeSequenceId)
      const sequencePatch = existing[0]?.gamePatch ?? gamePatch
      const created = createBorderRollSample({
        sequenceId: current.activeSequenceId,
        gamePatch: sequencePatch,
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
      commitStore(added.store)
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
    commitStore(startBorderRollSequence(storeRef.current))
    setMessage('Started a new Voyage sequence. Its first complete scan will be roll 0.')
  }, [commitStore])

  const finishVoyage = useCallback(() => {
    const current = storeRef.current
    const sequence = getBorderRollSequence(current.samples, current.activeSequenceId)
    const settings = submissionRef.current.settings
    let summary: string

    if (sequence.length === 0) {
      summary = 'no border scans recorded'
    } else if (!isCompleteBorderRollSequence(sequence)) {
      summary = 'incomplete border sequence kept locally'
    } else if (!settings.enabled) {
      summary = `${sequence.length} border roll${sequence.length === 1 ? '' : 's'} saved locally`
    } else if (!BORDER_ROLL_INTAKE_URL || !settings.submissionKey.trim()) {
      summary = 'border sequence saved; automatic submission needs setup'
    } else {
      commitSubmissionStore(enqueueBorderRollSequence(submissionRef.current, sequence))
      summary = `${sequence.length} border roll${sequence.length === 1 ? '' : 's'} queued for submission`
      queueMicrotask(() => void flushQueue())
    }

    commitStore(startBorderRollSequence(current))
    return summary
  }, [commitStore, commitSubmissionStore, flushQueue])

  const setAutoSubmitEnabled = useCallback(
    (enabled: boolean) => {
      commitSubmissionStore(updateBorderSubmissionSettings(submissionRef.current, { enabled }))
      if (enabled) queueMicrotask(() => void flushQueue())
    },
    [commitSubmissionStore, flushQueue],
  )

  const setSubmissionKey = useCallback(
    (submissionKey: string) => {
      commitSubmissionStore(
        updateBorderSubmissionSettings(submissionRef.current, { submissionKey }),
      )
      if (submissionKey.trim() && submissionRef.current.settings.enabled) {
        queueMicrotask(() => void flushQueue())
      }
    },
    [commitSubmissionStore, flushQueue],
  )

  useEffect(() => {
    void flushQueue()
  }, [flushQueue])

  const removeSample = useCallback(
    (sampleId: string) => {
      commitStore(removeBorderRollSample(storeRef.current, sampleId))
      setMessage('Removed the local sample.')
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
    setGamePatch,
    setAutoSubmitEnabled,
    setSubmissionKey,
    recordCurrentRoll,
    captureImportedRoll,
    startNextSequence,
    removeSample,
    finishVoyage,
  }
}
