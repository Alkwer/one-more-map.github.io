import type { BorderRerollCostMatch } from './borderOcr'
import type { VoyageResearchFinishResult } from './voyageFinish'
import {
  addBorderRollSample,
  createBorderRollSample,
  getBorderRollSequence,
  nextBorderRollIndex,
  type BorderResearchStore,
  type BorderRollSample,
} from './borderRollResearch'
import {
  nextPendingBorderSubmission,
  queuedBorderSubmissionMatchesSamples,
  type BorderSubmissionResponse,
  type BorderSubmissionStore,
  type QueuedBorderSubmission,
} from './borderRollSubmission'
import {
  borderResearchReducer,
  createBorderResearchState,
  planBorderResearchFinish,
  type BorderResearchEvent,
  type NewBorderSequence,
  type ResearchEvent,
  type SubmissionEvent,
} from './borderResearchMachine'
import { REROLL_COSTS } from './rerollAdvice'
import type { Borders } from '../types'

/** Load/reset return a recovery-marked store when access or decoding fails. */
export interface BorderResearchPersistence<T> {
  load(): T
  save(store: T): boolean
  reset(): T
}

export interface BorderResearchTransport {
  send(
    item: QueuedBorderSubmission,
    options: {
      endpoint: string
      submissionKey: string
      currentSamples: BorderRollSample[]
      signal: AbortSignal
    },
  ): Promise<BorderSubmissionResponse>
}

export interface BorderResearchDependencies {
  research: BorderResearchPersistence<BorderResearchStore>
  submissions: BorderResearchPersistence<BorderSubmissionStore>
  transport: BorderResearchTransport
  endpoint: string
  newSequence: () => NewBorderSequence
  random: () => number
  now: () => string
  schedule?: (task: () => void) => void
}

/** Owns persistence ordering and request lifetime, independently of React. */
export function createBorderResearchService(dependencies: BorderResearchDependencies) {
  let state = createBorderResearchState(
    dependencies.research.load(),
    dependencies.submissions.load(),
  )
  const listeners = new Set<() => void>()
  let running = true
  let attempt = 0
  let activeRequest: { attempt: number; sequenceId: string; controller: AbortController } | null =
    null

  const dispatch = (event: BorderResearchEvent) => {
    const next = borderResearchReducer(state, event)
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }
  const setMessage = (message: string) => dispatch({ type: 'message-changed', message })

  const commitResearch = (event: ResearchEvent) => {
    if (state.store.recovery) {
      setMessage('Border research writes are paused until storage recovery is resolved.')
      return false
    }
    const next = borderResearchReducer(state, event)
    let saved = false
    try {
      saved = dependencies.research.save(next.store)
    } catch {
      // A throwing adapter has the same semantics as an unavailable browser store.
    }
    if (saved) {
      dispatch(event)
      return true
    }
    dispatch({ type: 'storage-unavailable', target: 'research' })
    return false
  }

  const commitSubmissions = (event: SubmissionEvent) => {
    if (state.submissionStore.recovery) {
      setMessage('Submission queue writes are paused until storage recovery is resolved.')
      return false
    }
    const next = borderResearchReducer(state, event)
    let saved = false
    try {
      saved = dependencies.submissions.save(next.submissionStore)
    } catch {
      // Do not publish an unpersisted queue transition.
    }
    if (saved) {
      dispatch(event)
      return true
    }
    dispatch({ type: 'storage-unavailable', target: 'submission' })
    return false
  }

  const cancelActiveRequest = (sequenceId?: string) => {
    if (!activeRequest || (sequenceId && activeRequest.sequenceId !== sequenceId)) return
    const request = activeRequest
    activeRequest = null
    dispatch({ type: 'delivery-stopped', attempt: request.attempt })
    request.controller.abort()
  }

  const requestFlush = () => (dependencies.schedule ?? queueMicrotask)(() => void flushQueue())

  async function flushQueue(): Promise<void> {
    while (running && !state.delivery && !state.store.recovery && !state.submissionStore.recovery) {
      const current = state.submissionStore
      const item = nextPendingBorderSubmission(current)
      if (
        !item ||
        !current.settings.enabled ||
        !current.settings.submissionKey.trim() ||
        !dependencies.endpoint
      )
        return

      const request = {
        sequenceId: item.sequenceId,
        attempt: ++attempt,
        controller: new AbortController(),
      }
      activeRequest = request
      dispatch({ type: 'delivery-started', sequenceId: item.sequenceId, attempt: request.attempt })
      const stillCurrent = () =>
        running &&
        activeRequest === request &&
        !request.controller.signal.aborted &&
        state.submissionStore.queue.some((queued) => queued.sequenceId === item.sequenceId)
      try {
        const currentSamples = getBorderRollSequence(state.store.samples, item.sequenceId)
        // Validate at the service boundary too, so injected transports cannot send stale data.
        if (!queuedBorderSubmissionMatchesSamples(item, currentSamples)) {
          throw new Error(
            'The queued Voyage no longer matches its current local sequence. Cancel it or rebuild it explicitly.',
          )
        }
        const result = await dependencies.transport.send(item, {
          endpoint: dependencies.endpoint,
          submissionKey: current.settings.submissionKey,
          currentSamples,
          signal: request.controller.signal,
        })
        if (!stillCurrent()) return
        if (
          !queuedBorderSubmissionMatchesSamples(
            item,
            getBorderRollSequence(state.store.samples, item.sequenceId),
          )
        ) {
          throw new Error(
            'The queued Voyage changed during submission. Cancel it or rebuild it explicitly.',
          )
        }
        const delivery = `${result.status === 'created' ? 'Submitted' : 'Already submitted'} Voyage ${item.sequenceId.slice(-8)} as issue #${result.issueNumber}`
        if (
          !commitResearch({
            type: 'delivery-archived',
            sequenceId: item.sequenceId,
            nextSequence: dependencies.newSequence(),
          })
        ) {
          setMessage(
            `${delivery}, but border research storage became unavailable. The Voyage was not archived and remains queued for recovery.`,
          )
          return
        }
        if (!commitSubmissions({ type: 'submission-removed', sequenceId: item.sequenceId })) {
          setMessage(
            `${delivery} and archived it locally, but submission queue storage became unavailable. Its queue entry remains for recovery.`,
          )
          return
        }
        setMessage(`${delivery}.`)
      } catch (error) {
        if (!stillCurrent()) return
        const message = error instanceof Error ? error.message : 'Automatic submission failed'
        if (
          !commitSubmissions({
            type: 'submission-failed',
            sequenceId: item.sequenceId,
            message,
            attemptedAt: dependencies.now(),
          })
        )
          return
        setMessage(
          `${message} The Voyage remains queued for an explicit retry; later Voyages will continue.`,
        )
      } finally {
        if (activeRequest === request) activeRequest = null
        dispatch({ type: 'delivery-stopped', attempt: request.attempt })
      }
    }
  }

  const addSample = (
    borders: Borders,
    rerollIndex: number,
    nextCost: number | null,
    automatic = false,
  ): string => {
    const current = state.store
    const existing = getBorderRollSequence(current.samples, current.activeSequenceId)
    const created = createBorderRollSample({
      sequenceId: current.activeSequenceId,
      gamePatch: existing[0]?.gamePatch ?? state.gamePatch,
      vesperUpgradeCount:
        existing.length > 0 ? existing[0].vesperUpgradeCount : current.vesperUpgradeCount,
      samplingReason: current.activeSequenceSamplingReason,
      rerollIndex,
      displayedNextRerollCost: nextCost,
      borders,
      capturedAt: dependencies.now(),
    })
    if (!created.ok) {
      setMessage(created.message)
      return created.message
    }
    const added = addBorderRollSample(current, created.sample)
    if (added.status !== 'added') {
      const message =
        added.status === 'duplicate'
          ? `Roll ${rerollIndex} is already saved for this Voyage.`
          : `Roll ${rerollIndex} conflicts with the saved scan; correct it in the research panel.`
      setMessage(message)
      return message
    }
    if (!commitResearch({ type: 'sample-added', sample: created.sample }))
      return 'Border research storage needs recovery; the roll was not saved.'
    const saved = `${automatic ? 'Auto-saved' : 'Saved'} ${rerollIndex === 0 ? 'natural board' : `paid reroll ${rerollIndex}`}`
    setMessage(`${saved}: 12 modifiers.`)
    return saved
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: () => {
      running = true
      requestFlush()
    },
    stop: () => {
      running = false
      cancelActiveRequest()
    },
    flushQueue,
    endpointConfigured: !!dependencies.endpoint,
    setGamePatch: (value: string) => dispatch({ type: 'game-patch-changed', value }),
    recordCurrentRoll: (borders: Borders) => {
      const index = nextBorderRollIndex(
        getBorderRollSequence(state.store.samples, state.store.activeSequenceId),
      )
      return addSample(borders, index, REROLL_COSTS[index] ?? null)
    },
    captureImportedRoll: (borders: Borders, rerollCost: BorderRerollCostMatch | null) => {
      if (borders.some((id) => id === null)) return 'Border scan was not saved: all 12 must match.'
      const samples = getBorderRollSequence(state.store.samples, state.store.activeSequenceId)
      if (!rerollCost && samples.length > 0) {
        const skipped = 'Border scan was not auto-saved: reroll cost was not recognised.'
        setMessage(skipped)
        return skipped
      }
      const index = rerollCost?.rerollsUsed ?? 0
      return addSample(borders, index, rerollCost?.cost ?? REROLL_COSTS[index] ?? null, true)
    },
    startNextSequence: () => {
      if (!commitResearch({ type: 'sequence-started', ...dependencies.newSequence() })) return
      setMessage('Started a new Voyage sequence. Its first complete scan will be roll 0.')
    },
    setRandomizedResearchEnabled: (enabled: boolean, activeRollObserved: boolean) => {
      const samples = getBorderRollSequence(state.store.samples, state.store.activeSequenceId)
      if (
        !commitResearch({
          type: 'sampling-changed',
          enabled,
          activeRollObserved,
          randomValue: dependencies.random(),
        })
      )
        return
      setMessage(
        enabled
          ? samples.length > 0 || activeRollObserved
            ? 'Randomized research enabled. Assignment starts with the next Voyage.'
            : state.store.activeSequenceSamplingReason === 'randomized-research'
              ? 'Randomized research enabled: this Voyage was assigned one research reroll.'
              : 'Randomized research enabled: this Voyage stays normal gameplay.'
          : 'Randomized research disabled. Existing sequence labels were preserved.',
      )
    },
    setVesperUpgradeCount: (value: number | null) => {
      const current = state.store
      const samples = getBorderRollSequence(current.samples, current.activeSequenceId)
      const protectsLegacySequence =
        value !== null &&
        current.vesperUpgradeCount === null &&
        samples.some((sample) => sample.vesperUpgradeCount === null)
      if (
        !commitResearch({
          type: 'vesper-changed',
          value,
          ...(protectsLegacySequence ? { nextSequence: dependencies.newSequence() } : {}),
        })
      )
        return
      const queuedSequenceChanged =
        state.submissionStore.queue.some((item) => item.sequenceId === current.activeSequenceId) &&
        JSON.stringify(samples) !==
          JSON.stringify(getBorderRollSequence(state.store.samples, current.activeSequenceId))
      if (queuedSequenceChanged) {
        cancelActiveRequest(current.activeSequenceId)
        if (
          !commitSubmissions({ type: 'submission-removed', sequenceId: current.activeSequenceId })
        )
          return
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
      if (queuedSequenceChanged) requestFlush()
    },
    finishVoyage: (expectedSequenceId: string): VoyageResearchFinishResult => {
      const plan = planBorderResearchFinish(state, expectedSequenceId, !!dependencies.endpoint)
      if (!plan.ok) return plan
      if (
        plan.queue &&
        !commitSubmissions({
          type: 'sequence-enqueued',
          samples: plan.samples,
          exportedAt: dependencies.now(),
        })
      ) {
        return {
          ok: false,
          message:
            'Finish Voyage canceled: submission queue storage needs recovery. No charts were consumed and the border sequence was not advanced.',
        }
      }
      if (!commitResearch({ type: 'sequence-started', ...dependencies.newSequence() })) {
        return {
          ok: false,
          message: plan.queue
            ? 'Finish Voyage canceled: the border sequence was queued, but research storage needs recovery. No charts were consumed and the sequence was not advanced.'
            : 'Finish Voyage canceled: border research storage needs recovery. No charts were consumed and the sequence was not advanced.',
        }
      }
      if (plan.queue) requestFlush()
      return { ok: true, summary: plan.summary }
    },
    setAutoSubmitEnabled: (enabled: boolean) => {
      if (!commitSubmissions({ type: 'settings-changed', patch: { enabled } })) return
      if (enabled) requestFlush()
      else cancelActiveRequest()
    },
    setSubmissionKey: (submissionKey: string) => {
      if (!commitSubmissions({ type: 'settings-changed', patch: { submissionKey } })) return
      cancelActiveRequest()
    },
    submitQueuedSequences: requestFlush,
    retryResearchRecovery: () => {
      cancelActiveRequest()
      const store = dependencies.research.load()
      dispatch({ type: 'research-loaded', store })
      setMessage(
        store.recovery
          ? store.recovery.message
          : 'Border research storage was decoded and normal writes resumed.',
      )
    },
    resetResearchStore: () => {
      cancelActiveRequest()
      const store = dependencies.research.reset()
      dispatch({ type: 'research-loaded', store })
      setMessage(
        store.recovery
          ? store.recovery.message
          : 'Border research was explicitly reset; the quarantined backup was preserved.',
      )
    },
    retrySubmissionRecovery: () => {
      cancelActiveRequest()
      const store = dependencies.submissions.load()
      dispatch({ type: 'submissions-loaded', store })
      setMessage(
        store.recovery
          ? store.recovery.message
          : 'Submission queue storage was decoded and normal writes resumed.',
      )
    },
    resetSubmissionStore: () => {
      cancelActiveRequest()
      const store = dependencies.submissions.reset()
      dispatch({ type: 'submissions-loaded', store })
      setMessage(
        store.recovery
          ? store.recovery.message
          : 'Submission queue was explicitly reset; the quarantined backup was preserved.',
      )
    },
    removeSample: (sampleId: string) => {
      const sample = state.store.samples.find((candidate) => candidate.sampleId === sampleId)
      if (!sample || !commitResearch({ type: 'sample-removed', sampleId })) return
      const wasQueued = state.submissionStore.queue.some(
        (item) => item.sequenceId === sample.sequenceId,
      )
      if (wasQueued) {
        cancelActiveRequest(sample.sequenceId)
        if (!commitSubmissions({ type: 'submission-removed', sequenceId: sample.sequenceId }))
          return
      }
      setMessage(
        wasQueued
          ? 'Removed the local sample and canceled its stale queued submission.'
          : 'Removed the local sample.',
      )
      if (wasQueued) requestFlush()
    },
    cancelQueuedSequence: (sequenceId: string) => {
      if (!state.submissionStore.queue.some((item) => item.sequenceId === sequenceId)) return
      cancelActiveRequest(sequenceId)
      if (!commitSubmissions({ type: 'submission-removed', sequenceId })) return
      setMessage(`Canceled queued Voyage ${sequenceId.slice(-8)}.`)
      requestFlush()
    },
    retryQueuedSequence: (sequenceId: string) => {
      const item = state.submissionStore.queue.find((queued) => queued.sequenceId === sequenceId)
      if (!item || item.delivery.status !== 'failed') return
      if (!commitSubmissions({ type: 'submission-retried', sequenceId })) return
      setMessage(`Retrying queued Voyage ${sequenceId.slice(-8)}.`)
      requestFlush()
    },
    archiveSequence: (sequenceId: string) => {
      if (!commitResearch({ type: 'sequence-archived', sequenceId })) return
      setMessage('Archived the submitted Voyage locally.')
    },
    restoreSequence: (sequenceId: string) => {
      if (!commitResearch({ type: 'sequence-restored', sequenceId })) return
      setMessage('Restored the Voyage to the saved sequence list.')
    },
  }
}

export type BorderResearchService = ReturnType<typeof createBorderResearchService>
