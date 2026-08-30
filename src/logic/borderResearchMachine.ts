import {
  addBorderRollSample,
  archiveBorderRollSequence,
  getActiveBorderRollGamePatch,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  removeBorderRollSample,
  restoreBorderRollSequence,
  setCurrentVesperUpgradeCount,
  setRandomizedResearchEnabled,
  startBorderRollSequence,
  type BorderResearchStore,
  type BorderRollSample,
} from './borderRollResearch'
import {
  enqueueBorderRollSequence,
  markQueuedBorderSubmissionFailed,
  removeQueuedBorderSubmission,
  retryQueuedBorderSubmission,
  updateBorderSubmissionSettings,
  type BorderSubmissionSettings,
  type BorderSubmissionStore,
} from './borderRollSubmission'
import { unavailableAuxiliaryStore } from './auxiliaryStorageRecovery'

export interface BorderResearchState {
  store: BorderResearchStore
  submissionStore: BorderSubmissionStore
  gamePatch: string
  message: string
  /** A generation token prevents a canceled request from committing a late response. */
  delivery: { sequenceId: string; attempt: number } | null
}

export interface NewBorderSequence {
  sequenceId: string
  randomValue: number
}

export type ResearchEvent =
  | { type: 'sample-added'; sample: BorderRollSample }
  | ({ type: 'sequence-started' } & NewBorderSequence)
  | { type: 'sampling-changed'; enabled: boolean; randomValue: number; activeRollObserved: boolean }
  | { type: 'vesper-changed'; value: number | null; nextSequence?: NewBorderSequence }
  | { type: 'sample-removed'; sampleId: string }
  | { type: 'sequence-archived' | 'sequence-restored'; sequenceId: string }
  | { type: 'delivery-archived'; sequenceId: string; nextSequence: NewBorderSequence }

export type SubmissionEvent =
  | { type: 'settings-changed'; patch: Partial<BorderSubmissionSettings> }
  | { type: 'sequence-enqueued'; samples: BorderRollSample[]; exportedAt: string }
  | { type: 'submission-removed' | 'submission-retried'; sequenceId: string }
  | { type: 'submission-failed'; sequenceId: string; message: string; attemptedAt: string }

export type BorderResearchEvent =
  | ResearchEvent
  | SubmissionEvent
  | { type: 'research-loaded'; store: BorderResearchStore }
  | { type: 'submissions-loaded'; store: BorderSubmissionStore }
  | { type: 'storage-unavailable'; target: 'research' | 'submission' }
  | { type: 'game-patch-changed'; value: string }
  | { type: 'message-changed'; message: string }
  | { type: 'delivery-started'; sequenceId: string; attempt: number }
  | { type: 'delivery-stopped'; attempt: number }

export function createBorderResearchState(
  store: BorderResearchStore,
  submissionStore: BorderSubmissionStore,
): BorderResearchState {
  return {
    store,
    submissionStore,
    gamePatch: getActiveBorderRollGamePatch(store),
    message: '',
    delivery: null,
  }
}

/** Pure transitions: IDs, sampling draws and timestamps are supplied by the caller. */
export function borderResearchReducer(
  state: BorderResearchState,
  event: BorderResearchEvent,
): BorderResearchState {
  let store = state.store
  let submissionStore = state.submissionStore
  switch (event.type) {
    case 'sample-added':
      store = addBorderRollSample(store, event.sample).store
      break
    case 'sequence-started':
      store = startBorderRollSequence(store, event.randomValue, event.sequenceId)
      break
    case 'sampling-changed':
      store = setRandomizedResearchEnabled(
        store,
        event.enabled,
        event.randomValue,
        event.activeRollObserved,
      )
      break
    case 'vesper-changed':
      store = setCurrentVesperUpgradeCount(store, event.value)
      if (event.nextSequence) {
        store = startBorderRollSequence(
          store,
          event.nextSequence.randomValue,
          event.nextSequence.sequenceId,
        )
      }
      break
    case 'sample-removed':
      store = removeBorderRollSample(store, event.sampleId)
      break
    case 'sequence-archived':
      store = archiveBorderRollSequence(store, event.sequenceId)
      break
    case 'sequence-restored':
      store = restoreBorderRollSequence(store, event.sequenceId)
      break
    case 'delivery-archived':
      if (store.activeSequenceId === event.sequenceId) {
        store = startBorderRollSequence(
          store,
          event.nextSequence.randomValue,
          event.nextSequence.sequenceId,
        )
      }
      store = archiveBorderRollSequence(store, event.sequenceId)
      break
    case 'settings-changed':
      submissionStore = updateBorderSubmissionSettings(submissionStore, event.patch)
      break
    case 'sequence-enqueued':
      submissionStore = enqueueBorderRollSequence(submissionStore, event.samples, event.exportedAt)
      break
    case 'submission-removed':
      submissionStore = removeQueuedBorderSubmission(submissionStore, event.sequenceId)
      break
    case 'submission-retried':
      submissionStore = retryQueuedBorderSubmission(submissionStore, event.sequenceId)
      break
    case 'submission-failed':
      submissionStore = markQueuedBorderSubmissionFailed(
        submissionStore,
        event.sequenceId,
        event.message,
        event.attemptedAt,
      )
      break
    case 'research-loaded':
      store = event.store
      break
    case 'submissions-loaded':
      submissionStore = event.store
      break
    case 'storage-unavailable':
      return event.target === 'research'
        ? {
            ...state,
            store: {
              ...store,
              recovery: unavailableAuxiliaryStore('Border research storage became unavailable.'),
            },
            message: 'Border research storage became unavailable; further writes are paused.',
          }
        : {
            ...state,
            submissionStore: {
              ...submissionStore,
              recovery: unavailableAuxiliaryStore('Border submission storage became unavailable.'),
            },
            message: 'Border submission storage became unavailable; further writes are paused.',
          }
    case 'game-patch-changed':
      return { ...state, gamePatch: event.value }
    case 'message-changed':
      return { ...state, message: event.message }
    case 'delivery-started':
      return state.delivery
        ? state
        : { ...state, delivery: { sequenceId: event.sequenceId, attempt: event.attempt } }
    case 'delivery-stopped':
      return state.delivery?.attempt === event.attempt ? { ...state, delivery: null } : state
  }
  return {
    ...state,
    store,
    submissionStore,
    gamePatch:
      store.activeSequenceId === state.store.activeSequenceId
        ? state.gamePatch
        : getActiveBorderRollGamePatch(store),
  }
}

/** Finish persists the queue first, then advances research; no send may run between those writes. */
export function planBorderResearchFinish(
  state: BorderResearchState,
  expectedSequenceId: string,
  endpointConfigured: boolean,
):
  | { ok: false; message: string }
  | { ok: true; summary: string; queue: boolean; samples: BorderRollSample[] } {
  if (state.store.activeSequenceId !== expectedSequenceId) {
    return {
      ok: false,
      message:
        'Finish Voyage canceled: the border-research Voyage changed after confirmation started. No charts were consumed.',
    }
  }
  const samples = getBorderRollSequence(state.store.samples, state.store.activeSequenceId)
  const { settings } = state.submissionStore
  let summary: string
  let queue = false
  if (samples.length === 0) summary = 'no border scans recorded'
  else if (!isCompleteBorderRollSequence(samples))
    summary = 'incomplete border sequence kept locally'
  else if (!settings.enabled)
    summary = `${samples.length} border roll${samples.length === 1 ? '' : 's'} saved locally`
  else if (!endpointConfigured || !settings.submissionKey.trim())
    summary = 'border sequence saved; automatic submission needs setup'
  else {
    queue = true
    summary = `${samples.length} border roll${samples.length === 1 ? '' : 's'} queued for submission`
  }
  return { ok: true, summary, queue, samples }
}
