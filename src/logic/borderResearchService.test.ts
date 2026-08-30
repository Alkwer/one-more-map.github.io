import { describe, expect, it, vi } from 'vitest'
import {
  createBorderResearchStore,
  createBorderRollSample,
  type BorderResearchStore,
  type BorderRollSample,
} from './borderRollResearch'
import {
  createBorderSubmissionStore,
  enqueueBorderRollSequence,
  markQueuedBorderSubmissionFailed,
  type BorderSubmissionResponse,
  type BorderSubmissionStore,
} from './borderRollSubmission'
import {
  createBorderResearchService,
  type BorderResearchDependencies,
} from './borderResearchService'
import {
  borderResearchReducer,
  createBorderResearchState,
  planBorderResearchFinish,
  type BorderResearchEvent,
} from './borderResearchMachine'
import { unavailableAuxiliaryStore } from './auxiliaryStorageRecovery'
import type { Borders } from '../types'

const now = '2026-08-30T12:00:00.000Z'
const borders = Array(12).fill('b-divine') as Borders
const accepted: BorderSubmissionResponse = {
  status: 'created',
  issueNumber: 123,
  issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/123',
}

function sample(sequenceId = 'voyage-original', rerollIndex = 0): BorderRollSample {
  const result = createBorderRollSample({
    sequenceId,
    gamePatch: '3.29.2',
    vesperUpgradeCount: 5,
    samplingReason: 'gameplay',
    rerollIndex,
    displayedNextRerollCost: 3_000,
    borders,
    capturedAt: now,
  })
  if (!result.ok) throw new Error(result.message)
  return { ...result.sample, sampleId: `${sequenceId}-roll-${rerollIndex}` }
}

function harness(
  options: {
    queued?: boolean
    failed?: boolean
    samples?: BorderRollSample[]
    enabled?: boolean
    endpoint?: string
  } = {},
) {
  let researchDisk: BorderResearchStore = {
    ...createBorderResearchStore(),
    activeSequenceId: 'voyage-original',
    vesperUpgradeCount: 5,
    samples: options.samples ?? [sample()],
  }
  let submissionDisk: BorderSubmissionStore = {
    ...createBorderSubmissionStore(),
    settings: { enabled: options.enabled ?? true, submissionKey: '' },
  }
  if (options.queued || options.failed)
    submissionDisk = enqueueBorderRollSequence(submissionDisk, [sample()], now)
  if (options.failed)
    submissionDisk = markQueuedBorderSubmissionFailed(
      submissionDisk,
      'voyage-original',
      'Offline',
      now,
    )
  const writes: string[] = []
  const scheduled: (() => void)[] = []
  let sequence = 0
  const research = {
    load: vi.fn(() => structuredClone(researchDisk)),
    save: vi.fn((store: BorderResearchStore) => {
      writes.push('research')
      researchDisk = structuredClone(store)
      return true
    }),
    reset: vi.fn(() => {
      researchDisk = createBorderResearchStore()
      return structuredClone(researchDisk)
    }),
  }
  const submissions = {
    load: vi.fn(() => structuredClone(submissionDisk)),
    save: vi.fn((store: BorderSubmissionStore) => {
      writes.push('submissions')
      // Match the browser adapter: the credential is memory-only, including across recovery.
      submissionDisk = structuredClone({
        ...store,
        settings: { enabled: store.settings.enabled, submissionKey: '' },
      })
      return true
    }),
    reset: vi.fn(() => {
      submissionDisk = createBorderSubmissionStore()
      return structuredClone(submissionDisk)
    }),
  }
  const transport = {
    send: vi.fn<BorderResearchDependencies['transport']['send']>().mockResolvedValue(accepted),
  }
  const dependencies: BorderResearchDependencies = {
    research,
    submissions,
    transport,
    endpoint: options.endpoint ?? 'https://intake.example.test',
    newSequence: () => ({ sequenceId: `voyage-next-${++sequence}`, randomValue: 0.1 }),
    random: () => 0.1,
    now: () => now,
    schedule: (task) => {
      scheduled.push(task)
    },
  }
  const service = createBorderResearchService(dependencies)
  service.setSubmissionKey('private-session-key')
  writes.length = 0
  submissions.save.mockClear()
  return {
    service,
    research,
    submissions,
    transport,
    dependencies,
    writes,
    scheduled,
    disk: () => ({ research: researchDisk, submissions: submissionDisk }),
    restart: () => createBorderResearchService(dependencies),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('pure border research transitions', () => {
  it('replays research and queue transitions deterministically without changing the input', () => {
    const initial = createBorderResearchState(
      {
        ...createBorderResearchStore(),
        activeSequenceId: 'voyage-original',
        vesperUpgradeCount: 5,
      },
      createBorderSubmissionStore(),
    )
    const original = structuredClone(initial)
    const events: BorderResearchEvent[] = [
      { type: 'sampling-changed', enabled: true, activeRollObserved: false, randomValue: 0.1 },
      { type: 'sample-added', sample: sample() },
      { type: 'sequence-enqueued', samples: [sample()], exportedAt: now },
      {
        type: 'submission-failed',
        sequenceId: 'voyage-original',
        message: 'offline',
        attemptedAt: now,
      },
      { type: 'submission-retried', sequenceId: 'voyage-original' },
      { type: 'sequence-started', sequenceId: 'voyage-next', randomValue: 0.9 },
      {
        type: 'delivery-archived',
        sequenceId: 'voyage-original',
        nextSequence: { sequenceId: 'unused', randomValue: 0 },
      },
      { type: 'submission-removed', sequenceId: 'voyage-original' },
    ]
    const replay = () => events.reduce(borderResearchReducer, initial)
    expect(replay()).toEqual(replay())
    expect(initial).toEqual(original)
    expect(replay()).toMatchObject({
      store: {
        activeSequenceId: 'voyage-next',
        activeSequenceSamplingReason: 'gameplay',
        archivedSequenceIds: ['voyage-original'],
      },
      submissionStore: { queue: [] },
    })
  })

  it('ignores a stale delivery completion while a newer attempt is running', () => {
    const state = createBorderResearchState(
      createBorderResearchStore(),
      createBorderSubmissionStore(),
    )
    const sending = borderResearchReducer(state, {
      type: 'delivery-started',
      sequenceId: 'voyage',
      attempt: 2,
    })
    expect(borderResearchReducer(sending, { type: 'delivery-stopped', attempt: 1 })).toBe(sending)
    expect(
      borderResearchReducer(sending, { type: 'delivery-started', sequenceId: 'other', attempt: 3 }),
    ).toBe(sending)
  })

  it.each([
    {
      samples: [],
      enabled: true,
      endpoint: true,
      key: 'key',
      text: 'no border scans recorded',
      queue: false,
    },
    {
      samples: [sample('voyage-original', 1)],
      enabled: true,
      endpoint: true,
      key: 'key',
      text: 'incomplete border sequence kept locally',
      queue: false,
    },
    {
      samples: [sample()],
      enabled: false,
      endpoint: true,
      key: 'key',
      text: '1 border roll saved locally',
      queue: false,
    },
    {
      samples: [sample()],
      enabled: true,
      endpoint: false,
      key: 'key',
      text: 'border sequence saved; automatic submission needs setup',
      queue: false,
    },
    {
      samples: [sample()],
      enabled: true,
      endpoint: true,
      key: ' ',
      text: 'border sequence saved; automatic submission needs setup',
      queue: false,
    },
    {
      samples: [sample()],
      enabled: true,
      endpoint: true,
      key: 'key',
      text: '1 border roll queued for submission',
      queue: true,
    },
  ])('plans finish: $text', ({ samples, enabled, endpoint, key, text, queue }) => {
    const state = createBorderResearchState(
      { ...createBorderResearchStore(), activeSequenceId: 'voyage-original', samples },
      { ...createBorderSubmissionStore(), settings: { enabled, submissionKey: key } },
    )
    expect(planBorderResearchFinish(state, 'voyage-original', endpoint)).toMatchObject({
      ok: true,
      summary: text,
      queue,
    })
  })
})

describe('finish persistence boundaries', () => {
  it('persists queue before research, then archives before removing the delivered queue item', async () => {
    const h = harness()
    expect(h.service.finishVoyage('voyage-original')).toEqual({
      ok: true,
      summary: '1 border roll queued for submission',
    })
    expect(h.writes).toEqual(['submissions', 'research'])
    expect(h.transport.send).not.toHaveBeenCalled()
    expect(h.disk().submissions.queue).toHaveLength(1)
    expect(JSON.stringify(h.disk())).not.toContain('private-session-key')
    await h.service.flushQueue()
    expect(h.writes).toEqual(['submissions', 'research', 'research', 'submissions'])
    expect(h.disk().research.archivedSequenceIds).toEqual(['voyage-original'])
    expect(h.disk().submissions.queue).toEqual([])
    expect(h.transport.send.mock.calls[0][1]).toMatchObject({
      endpoint: h.dependencies.endpoint,
      submissionKey: 'private-session-key',
      currentSamples: [sample()],
    })
  })

  it('does no writes or transport when confirmation points to another sequence', async () => {
    const h = harness()
    expect(h.service.finishVoyage('voyage-other')).toMatchObject({
      ok: false,
      message: expect.stringContaining('changed after confirmation'),
    })
    await h.service.flushQueue()
    expect(h.writes).toEqual([])
    expect(h.transport.send).not.toHaveBeenCalled()
  })

  it('does not advance research when queue persistence fails, and can finish after restart', async () => {
    const h = harness()
    h.submissions.save.mockReturnValueOnce(false)
    expect(h.service.finishVoyage('voyage-original')).toMatchObject({
      ok: false,
      message: expect.stringContaining('submission queue storage needs recovery'),
    })
    expect(h.research.save).not.toHaveBeenCalled()
    expect(h.service.getSnapshot()).toMatchObject({
      store: { activeSequenceId: 'voyage-original' },
      submissionStore: { recovery: { code: 'unavailable' }, queue: [] },
    })
    await h.service.flushQueue()
    expect(h.transport.send).not.toHaveBeenCalled()
    const restarted = h.restart()
    restarted.setSubmissionKey('new-session-key')
    expect(restarted.finishVoyage('voyage-original').ok).toBe(true)
    await restarted.flushQueue()
    expect(h.disk().submissions.queue).toEqual([])
  })

  it('keeps a durable queue when advancing research fails, and restart does not duplicate it', async () => {
    const h = harness()
    h.research.save.mockImplementationOnce(() => {
      throw new Error('quota')
    })
    expect(h.service.finishVoyage('voyage-original')).toMatchObject({
      ok: false,
      message: expect.stringContaining('was queued, but research storage needs recovery'),
    })
    expect(h.disk().research.activeSequenceId).toBe('voyage-original')
    expect(h.disk().submissions.queue).toHaveLength(1)
    await h.service.flushQueue()
    expect(h.transport.send).not.toHaveBeenCalled()
    const restarted = h.restart()
    await restarted.flushQueue()
    expect(h.transport.send).not.toHaveBeenCalled()
    restarted.setSubmissionKey('new-session-key')
    expect(restarted.finishVoyage('voyage-original').ok).toBe(true)
    expect(h.disk().submissions.queue).toHaveLength(1)
    await restarted.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(1)
    expect(h.disk().research.samples).toEqual([sample()])
  })

  it('reports research failure when finishing a local-only sequence', () => {
    const h = harness({ enabled: false })
    h.research.save.mockReturnValueOnce(false)
    expect(h.service.finishVoyage('voyage-original')).toMatchObject({
      ok: false,
      message: expect.stringContaining('border research storage needs recovery'),
    })
    expect(h.disk().research.activeSequenceId).toBe('voyage-original')
    expect(h.submissions.save).not.toHaveBeenCalled()
  })
})

describe('send, archive and retry recovery', () => {
  it.each(['disabled', 'endpoint', 'key'] as const)(
    'does not send an existing queue without %s setup',
    async (missing) => {
      const h = harness({
        queued: true,
        enabled: missing !== 'disabled',
        endpoint: missing === 'endpoint' ? '' : undefined,
      })
      if (missing === 'key') h.service.setSubmissionKey(' ')
      await h.service.flushQueue()
      expect(h.transport.send).not.toHaveBeenCalled()
      expect(h.disk().submissions.queue).toHaveLength(1)
      expect(h.disk().research.archivedSequenceIds).toEqual([])
    },
  )

  it.each(['archive', 'queue removal'] as const)(
    'recovers from a failed %s after delivery, including a duplicate response after restart',
    async (step) => {
      const h = harness({ queued: true })
      if (step === 'archive') h.research.save.mockReturnValueOnce(false)
      else h.submissions.save.mockReturnValueOnce(false)
      await h.service.flushQueue()
      expect(h.transport.send).toHaveBeenCalledTimes(1)
      expect(h.disk().submissions.queue).toHaveLength(1)
      expect(h.disk().research.archivedSequenceIds).toEqual(
        step === 'archive' ? [] : ['voyage-original'],
      )
      expect(h.service.getSnapshot().message).toContain('remains')
      await h.service.flushQueue()
      expect(h.transport.send).toHaveBeenCalledTimes(1)

      h.transport.send.mockResolvedValue({ ...accepted, status: 'duplicate' })
      const restarted = h.restart()
      const nextSequenceBeforeRetry = restarted.getSnapshot().store.activeSequenceId
      await restarted.flushQueue()
      expect(h.transport.send).toHaveBeenCalledTimes(1)
      restarted.setSubmissionKey('new-session-key')
      await restarted.flushQueue()
      expect(h.transport.send).toHaveBeenCalledTimes(2)
      expect(h.disk().submissions.queue).toEqual([])
      expect(h.disk().research.archivedSequenceIds).toEqual(['voyage-original'])
      expect(restarted.getSnapshot().message).toContain('Already submitted')
      if (step === 'queue removal')
        expect(h.disk().research.activeSequenceId).toBe(nextSequenceBeforeRetry)
    },
  )

  it('persists a failed send, skips it for later Voyages, and requires explicit retry after restart', async () => {
    const h = harness({ queued: true, samples: [sample(), sample('voyage-later')] })
    const later = enqueueBorderRollSequence(h.disk().submissions, [sample('voyage-later')], now)
    h.submissions.save(later)
    h.service.retrySubmissionRecovery()
    h.service.setSubmissionKey('private-session-key')
    h.transport.send.mockRejectedValueOnce(new Error('offline'))
    await h.service.flushQueue()
    expect(h.transport.send.mock.calls.map(([item]) => item.sequenceId)).toEqual([
      'voyage-original',
      'voyage-later',
    ])
    expect(h.disk().submissions.queue).toHaveLength(1)
    expect(h.disk().submissions.queue[0].delivery).toEqual({
      status: 'failed',
      attemptCount: 1,
      lastAttemptAt: now,
      lastError: 'offline',
    })
    const restarted = h.restart()
    restarted.setSubmissionKey('new-session-key')
    await restarted.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(2)
    restarted.retryQueuedSequence('voyage-original')
    await restarted.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(3)
    expect(h.disk().submissions.queue).toEqual([])
  })

  it('pauses without archiving when recording a transport failure also fails', async () => {
    const h = harness({ queued: true })
    h.transport.send.mockRejectedValueOnce(new Error('offline'))
    h.submissions.save.mockReturnValueOnce(false)
    await h.service.flushQueue()
    expect(h.service.getSnapshot().submissionStore.recovery?.code).toBe('unavailable')
    expect(h.disk().submissions.queue[0].delivery.status).toBe('pending')
    expect(h.disk().research.archivedSequenceIds).toEqual([])
    await h.service.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(1)
    h.service.retrySubmissionRecovery()
    expect(h.service.getSnapshot().submissionStore.settings.submissionKey).toBe('')
    h.service.setSubmissionKey('new-session-key')
    await h.service.flushQueue()
    expect(h.disk().submissions.queue).toEqual([])
  })

  it('does not retry transport if persisting the explicit retry fails', async () => {
    const h = harness({ failed: true })
    h.submissions.save.mockReturnValueOnce(false)
    h.service.retryQueuedSequence('voyage-original')
    await h.service.flushQueue()
    expect(h.disk().submissions.queue[0].delivery.status).toBe('failed')
    expect(h.transport.send).not.toHaveBeenCalled()
    const restarted = h.restart()
    restarted.setSubmissionKey('new-session-key')
    restarted.retryQueuedSequence('voyage-original')
    await restarted.flushQueue()
    expect(h.disk().submissions.queue).toEqual([])
  })

  it('persists repeated retry failures without creating an automatic retry loop', async () => {
    const h = harness({ failed: true })
    h.transport.send.mockRejectedValue(new Error('still offline'))
    h.service.retryQueuedSequence('voyage-original')
    await h.service.flushQueue()
    expect(h.disk().submissions.queue[0].delivery).toMatchObject({
      status: 'failed',
      attemptCount: 2,
      lastError: 'still offline',
    })
    await h.service.flushQueue()
    const restarted = h.restart()
    restarted.setSubmissionKey('new-session-key')
    await restarted.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale persisted dataset before it reaches any injected transport', async () => {
    const h = harness({ queued: true, samples: [] })
    await h.service.flushQueue()
    expect(h.transport.send).not.toHaveBeenCalled()
    expect(h.disk().submissions.queue[0].delivery).toMatchObject({
      status: 'failed',
      lastError: expect.stringContaining('no longer matches'),
    })
    expect(h.disk().research.archivedSequenceIds).toEqual([])
  })

  it.each(['archive', 'restore'] as const)(
    'keeps the original research state when manual %s fails',
    (operation) => {
      const h = harness({ samples: [sample(), sample('voyage-older')] })
      if (operation === 'restore') h.service.archiveSequence('voyage-older')
      const before = structuredClone(h.disk().research)
      h.research.save.mockReturnValueOnce(false)
      if (operation === 'archive') h.service.archiveSequence('voyage-older')
      else h.service.restoreSequence('voyage-older')
      expect(h.disk().research).toEqual(before)
      expect(h.service.getSnapshot().store.archivedSequenceIds).toEqual(before.archivedSequenceIds)
      expect(h.service.getSnapshot().store.recovery?.code).toBe('unavailable')
      h.service.retryResearchRecovery()
      expect(h.service.getSnapshot().store.recovery).toBeUndefined()
      if (operation === 'archive') h.service.archiveSequence('voyage-older')
      else h.service.restoreSequence('voyage-older')
      expect(h.disk().research.archivedSequenceIds).toEqual(
        operation === 'archive' ? ['voyage-older'] : [],
      )
    },
  )
})

describe('request lifetime and recovery controls', () => {
  it('allows only one active send and ignores its late success after cancellation', async () => {
    const h = harness({ queued: true })
    const response = deferred<BorderSubmissionResponse>()
    h.transport.send.mockReturnValueOnce(response.promise)
    const sending = h.service.flushQueue()
    await h.service.flushQueue()
    expect(h.transport.send).toHaveBeenCalledTimes(1)
    h.service.cancelQueuedSequence('voyage-original')
    expect(h.transport.send.mock.calls[0][1].signal.aborted).toBe(true)
    response.resolve(accepted)
    await sending
    expect(h.disk().submissions.queue).toEqual([])
    expect(h.disk().research.archivedSequenceIds).toEqual([])
    expect(h.service.getSnapshot().message).toContain('Canceled')
  })

  it('pauses a failed cancellation write and ignores an abort-ignoring response', async () => {
    const h = harness({ queued: true })
    const response = deferred<BorderSubmissionResponse>()
    h.transport.send.mockReturnValueOnce(response.promise)
    const sending = h.service.flushQueue()
    h.submissions.save.mockReturnValueOnce(false)
    h.service.cancelQueuedSequence('voyage-original')
    response.resolve(accepted)
    await sending
    expect(h.disk().submissions.queue).toHaveLength(1)
    expect(h.disk().research.archivedSequenceIds).toEqual([])
    expect(h.service.getSnapshot().submissionStore.recovery?.code).toBe('unavailable')
  })

  it.each([
    'stop',
    'resetResearchStore',
    'resetSubmissionStore',
    'retryResearchRecovery',
    'retrySubmissionRecovery',
  ] as const)('invalidates an in-flight send on %s', async (operation) => {
    const h = harness({ queued: true })
    const response = deferred<BorderSubmissionResponse>()
    h.transport.send.mockReturnValueOnce(response.promise)
    const sending = h.service.flushQueue()
    h.service[operation]()
    const before = structuredClone(h.disk())
    expect(h.transport.send.mock.calls[0][1].signal.aborted).toBe(true)
    response.resolve(accepted)
    await sending
    expect(h.disk()).toEqual(before)
    expect(h.service.getSnapshot().delivery).toBeNull()
  })

  it('does not let an old stopped request clear the delivery state of a restarted service', async () => {
    const h = harness({ queued: true })
    const first = deferred<BorderSubmissionResponse>()
    const second = deferred<BorderSubmissionResponse>()
    h.transport.send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const originalSend = h.service.flushQueue()
    h.service.stop()
    h.service.start()
    const resumedSend = h.service.flushQueue()
    first.reject(new Error('aborted'))
    await originalSend
    expect(h.service.getSnapshot().delivery?.attempt).toBe(2)
    expect(h.disk().submissions.queue[0].delivery.status).toBe('pending')
    second.resolve(accepted)
    await resumedSend
    expect(h.disk().submissions.queue).toEqual([])
  })

  it.each(['disable', 'key', 'sample', 'vesper'] as const)(
    'cancels an active request after a %s change',
    async (change) => {
      const h = harness({ queued: true })
      const response = deferred<BorderSubmissionResponse>()
      h.transport.send.mockReturnValueOnce(response.promise)
      const sending = h.service.flushQueue()
      if (change === 'disable') h.service.setAutoSubmitEnabled(false)
      if (change === 'key') h.service.setSubmissionKey('replacement')
      if (change === 'sample') h.service.removeSample(sample().sampleId)
      if (change === 'vesper') h.service.setVesperUpgradeCount(4)
      expect(h.transport.send.mock.calls[0][1].signal.aborted).toBe(true)
      const before = structuredClone(h.disk())
      response.resolve(accepted)
      await sending
      expect(h.disk()).toEqual(before)
      expect(h.disk().research.archivedSequenceIds).toEqual([])
    },
  )

  it.each(['research', 'submissions'] as const)(
    'keeps %s recovery blocked when reload and explicit reset still fail',
    async (target) => {
      const h = harness({ queued: true })
      const blocked = {
        ...h.disk()[target],
        recovery: unavailableAuxiliaryStore('Still unavailable'),
      }
      if (target === 'research') {
        h.research.load.mockReturnValueOnce(blocked as BorderResearchStore)
        h.service.retryResearchRecovery()
        h.research.reset.mockReturnValueOnce(blocked as BorderResearchStore)
        h.service.resetResearchStore()
      } else {
        h.submissions.load.mockReturnValueOnce(blocked as BorderSubmissionStore)
        h.service.retrySubmissionRecovery()
        h.submissions.reset.mockReturnValueOnce(blocked as BorderSubmissionStore)
        h.service.resetSubmissionStore()
      }
      await h.service.flushQueue()
      expect(h.transport.send).not.toHaveBeenCalled()
      expect(h.service.getSnapshot().message).toBe('Still unavailable')
    },
  )

  it('publishes stable snapshots and supports unsubscribe without exposing React to orchestration', () => {
    const h = harness()
    const original = h.service.getSnapshot()
    expect(h.service.getSnapshot()).toBe(original)
    const listener = vi.fn()
    const unsubscribe = h.service.subscribe(listener)
    h.service.setGamePatch('next-patch')
    expect(listener).toHaveBeenCalledOnce()
    expect(h.service.getSnapshot().gamePatch).toBe('next-patch')
    unsubscribe()
    h.service.setGamePatch('another-patch')
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('research capture through the service', () => {
  it('keeps the sequence patch and Vesper progress fixed when capturing another roll', () => {
    const h = harness()
    h.service.setGamePatch('new-patch')
    expect(h.service.recordCurrentRoll(borders)).toBe('Saved paid reroll 1')
    expect(h.disk().research.samples[1]).toMatchObject({
      gamePatch: '3.29.2',
      vesperUpgradeCount: 5,
      rerollIndex: 1,
      capturedAt: now,
    })
  })

  it('does not label observed or recorded natural boards as randomly assigned', () => {
    const observed = harness({ samples: [] })
    observed.service.setRandomizedResearchEnabled(true, true)
    expect(observed.disk().research.activeSequenceSamplingReason).toBe('gameplay')
    const recorded = harness()
    recorded.service.setRandomizedResearchEnabled(true, false)
    expect(recorded.disk().research.activeSequenceSamplingReason).toBe('gameplay')
    const unseen = harness({ samples: [] })
    unseen.service.setRandomizedResearchEnabled(true, false)
    expect(unseen.disk().research.activeSequenceSamplingReason).toBe('randomized-research')
  })

  it('starts a new sequence when assigning Vesper progress would relabel unknown legacy samples', () => {
    const legacy = { ...sample(), vesperUpgradeCount: null }
    const h = harness({ samples: [legacy] })
    h.research.save({ ...h.disk().research, vesperUpgradeCount: null })
    h.service.retryResearchRecovery()
    h.service.setVesperUpgradeCount(5)
    expect(h.disk().research.activeSequenceId).not.toBe('voyage-original')
    expect(h.disk().research.samples).toEqual([legacy])
    expect(h.disk().research.vesperUpgradeCount).toBe(5)
  })

  it('rejects duplicate, conflicting and ambiguous scans without overwriting saved samples', () => {
    const h = harness()
    const cost = { rerollsUsed: 0, cost: 3_000 } as Parameters<
      typeof h.service.captureImportedRoll
    >[1]
    expect(h.service.captureImportedRoll(borders, cost)).toContain('already saved')
    expect(h.service.captureImportedRoll(Array(12).fill('b-curr-1') as Borders, cost)).toContain(
      'conflicts',
    )
    expect(h.service.captureImportedRoll(borders, null)).toContain('cost was not recognised')
    expect(h.research.save).not.toHaveBeenCalled()
    expect(h.disk().research.samples).toEqual([sample()])
  })

  it('does not report a saved roll after research persistence fails', () => {
    const h = harness({ samples: [] })
    h.research.save.mockReturnValueOnce(false)
    expect(h.service.recordCurrentRoll(borders)).toContain('roll was not saved')
    expect(h.disk().research.samples).toEqual([])
    expect(h.service.getSnapshot().store.recovery?.code).toBe('unavailable')
    h.service.recordCurrentRoll(borders)
    expect(h.research.save).toHaveBeenCalledTimes(1)
  })
})
