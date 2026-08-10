import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BORDER_MODS } from '../data/mods'
import type { Borders } from '../types'
import { createBorderRollSample } from './borderRollResearch'
import {
  BORDER_ROLL_INTAKE_URL,
  BORDER_SUBMISSION_STORAGE_KEY,
  createBorderSubmissionStore,
  enqueueBorderRollSequence,
  loadBorderSubmissionStore,
  markQueuedBorderSubmissionFailed,
  nextPendingBorderSubmission,
  queuedBorderSubmissionMatchesSamples,
  removeQueuedBorderSubmission,
  resetBorderSubmissionStore,
  retryQueuedBorderSubmission,
  saveBorderSubmissionStore,
  sendQueuedBorderSubmission,
  updateBorderSubmissionSettings,
} from './borderRollSubmission'

const borders = (): Borders =>
  Array.from({ length: 12 }, (_, index) => BORDER_MODS[index % BORDER_MODS.length].id)

function sample(rerollIndex = 0, sequenceId = 'voyage-auto-test') {
  const result = createBorderRollSample({
    sequenceId,
    gamePatch: '3.29.0',
    vesperUpgradeCount: 3,
    rerollIndex,
    displayedNextRerollCost: rerollIndex === 0 ? 3000 : 6000,
    borders: borders(),
    capturedAt: `2026-08-01T12:00:0${rerollIndex}.000Z`,
  })
  if (!result.ok) throw new Error(result.message)
  return result.sample
}

describe('border roll automatic submission queue', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size
      },
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      key: vi.fn((index: number) => [...values.keys()][index] ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    })
  })

  it('uses the deployed production intake endpoint by default', () => {
    expect(BORDER_ROLL_INTAKE_URL).toBe(
      'https://allflame-border-roll-intake.green-loom-6865.chatgpt.site/api/border-rolls',
    )
  })

  it('queues one complete sequence once without persisting the private key', () => {
    let store = updateBorderSubmissionSettings(createBorderSubmissionStore(), {
      enabled: true,
      submissionKey: 'private-test-key',
    })
    store = enqueueBorderRollSequence(store, [sample(0), sample(1)])
    store = enqueueBorderRollSequence(store, [sample(0), sample(1)])
    saveBorderSubmissionStore(store)

    expect(loadBorderSubmissionStore()).toMatchObject({
      settings: { enabled: true, submissionKey: '' },
      queue: [
        {
          sequenceId: 'voyage-auto-test',
          dataset: { sampleCount: 2, samples: [{ rerollIndex: 0 }, { rerollIndex: 1 }] },
        },
      ],
    })
    const persisted = values.get('allflame-border-roll-submission')!
    expect(persisted).not.toContain('private-test-key')
    expect(persisted).not.toContain('submissionKey')
    expect(persisted).not.toContain('queuedAt')
  })

  it('scrubs a previously persisted version 1 key while preserving its outbox', () => {
    const queued = enqueueBorderRollSequence(createBorderSubmissionStore(), [sample()]).queue
    const legacySample = { ...queued[0].dataset.samples[0] }
    delete (legacySample as { vesperUpgradeCount?: number | null }).vesperUpgradeCount
    values.set(
      'allflame-border-roll-submission',
      JSON.stringify({
        version: 1,
        settings: { enabled: true, submissionKey: 'rotate-this-key' },
        queue: [
          {
            ...queued[0],
            queuedAt: '2026-08-01T13:00:00.000Z',
            dataset: { ...queued[0].dataset, samples: [legacySample] },
          },
        ],
      }),
    )
    values.set(
      `${BORDER_SUBMISSION_STORAGE_KEY}-recovery-old`,
      JSON.stringify({ settings: { submissionKey: 'old-backup-key' }, queue: [] }),
    )

    expect(loadBorderSubmissionStore()).toMatchObject({
      version: 3,
      settings: { enabled: true, submissionKey: '' },
      credentialRotationRequired: true,
      queue: [
        {
          sequenceId: 'voyage-auto-test',
          dataset: { samples: [{ vesperUpgradeCount: null }] },
        },
      ],
    })
    const migrated = values.get('allflame-border-roll-submission')!
    expect(migrated).not.toContain('rotate-this-key')
    expect(migrated).not.toContain('submissionKey')
    expect(migrated).not.toContain('queuedAt')
    for (const value of values.values()) {
      expect(value).not.toContain('rotate-this-key')
      expect(value).not.toContain('old-backup-key')
      expect(value).not.toContain('submissionKey')
    }
  })

  it('quarantines an invalid legacy outbox only after removing its private key', () => {
    values.set(
      BORDER_SUBMISSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { enabled: true, submissionKey: 'invalid-store-key' },
        queue: [{ sequenceId: 'broken', dataset: { samples: [] } }],
      }),
    )

    const loaded = loadBorderSubmissionStore()

    expect(loaded).toMatchObject({
      credentialRotationRequired: true,
      recovery: { code: 'invalid' },
    })
    expect(loaded.recovery?.raw).not.toContain('invalid-store-key')
    expect(loaded.recovery?.raw).not.toContain('submissionKey')
    for (const value of values.values()) {
      expect(value).not.toContain('invalid-store-key')
      expect(value).not.toContain('submissionKey')
    }
  })

  it('discards malformed legacy JSON rather than backing up or exporting its private key', () => {
    values.set(
      BORDER_SUBMISSION_STORAGE_KEY,
      '{"version":1,"settings":{"enabled":true,"submissionKey":"discard-this-key"',
    )

    const loaded = loadBorderSubmissionStore()

    expect(loaded).toMatchObject({
      settings: { enabled: false, submissionKey: '' },
      queue: [],
      credentialRotationRequired: true,
    })
    expect(loaded.recovery).toBeUndefined()
    expect(values.has(BORDER_SUBMISSION_STORAGE_KEY)).toBe(false)
    expect([...values.values()].join('\n')).not.toContain('discard-this-key')
  })

  it('purges legacy credentials from active and recovery storage during reset', () => {
    values.set(
      BORDER_SUBMISSION_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { submissionKey: 'active-reset-key' } }),
    )
    values.set(
      `${BORDER_SUBMISSION_STORAGE_KEY}-recovery-reset`,
      JSON.stringify({ settings: { submissionKey: 'backup-reset-key' } }),
    )

    expect(resetBorderSubmissionStore()).toMatchObject({
      settings: { enabled: false, submissionKey: '' },
      credentialRotationRequired: true,
    })
    for (const value of values.values()) {
      expect(value).not.toContain('active-reset-key')
      expect(value).not.toContain('backup-reset-key')
      expect(value).not.toContain('submissionKey')
    }
  })

  it('persists failed delivery state without a busy flag across reloads', () => {
    let store = enqueueBorderRollSequence(createBorderSubmissionStore(), [sample()])
    store = markQueuedBorderSubmissionFailed(
      store,
      'voyage-auto-test',
      'permanent rejection',
      '2026-08-04T18:00:00.000Z',
    )
    saveBorderSubmissionStore(store)

    expect(loadBorderSubmissionStore().queue[0].delivery).toEqual({
      status: 'failed',
      attemptCount: 1,
      lastAttemptAt: '2026-08-04T18:00:00.000Z',
      lastError: 'permanent rejection',
    })
    expect(values.get(BORDER_SUBMISSION_STORAGE_KEY)).not.toContain('busy')
  })

  it.each([
    ['malformed JSON', '{not-json', 'invalid'],
    ['a newer store from a downgrade', JSON.stringify({ version: 99 }), 'incompatible'],
  ])('quarantines %s without overwriting the active queue', (_name, raw, code) => {
    values.set(BORDER_SUBMISSION_STORAGE_KEY, raw)

    const loaded = loadBorderSubmissionStore()

    expect(loaded.recovery).toMatchObject({ code, raw })
    expect(loaded.recovery?.backupKey).toMatch(/^allflame-border-roll-submission-recovery-/)
    expect(values.get(BORDER_SUBMISSION_STORAGE_KEY)).toBe(raw)
    expect(values.get(loaded.recovery!.backupKey!)).toBe(raw)
    expect(saveBorderSubmissionStore(loaded)).toBe(false)
    expect(values.get(BORDER_SUBMISSION_STORAGE_KEY)).toBe(raw)
  })

  it('quarantines a partially invalid queue instead of dropping the bad item', () => {
    const valid = enqueueBorderRollSequence(createBorderSubmissionStore(), [sample()]).queue[0]
    const raw = JSON.stringify({
      version: 2,
      settings: { enabled: true },
      queue: [valid, { sequenceId: 'broken', dataset: { samples: [] } }],
    })
    values.set(BORDER_SUBMISSION_STORAGE_KEY, raw)

    const loaded = loadBorderSubmissionStore()

    expect(loaded.recovery).toMatchObject({ code: 'invalid', raw })
    expect(values.get(BORDER_SUBMISSION_STORAGE_KEY)).toBe(raw)
    expect(values.get(loaded.recovery!.backupKey!)).toBe(raw)
  })

  it('distinguishes unavailable queue storage from invalid data', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('storage denied')
      }),
      setItem,
    })

    expect(loadBorderSubmissionStore().recovery).toEqual({
      code: 'unavailable',
      message: 'Border submission storage is unavailable.',
      raw: null,
      backupKey: null,
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rejects incomplete sequences before they enter the queue', () => {
    expect(() => enqueueBorderRollSequence(createBorderSubmissionStore(), [sample(1)])).toThrow(
      'complete Voyage sequence',
    )
  })

  it('posts one dataset with the limited submission key and removes it after success', async () => {
    const queued = enqueueBorderRollSequence(createBorderSubmissionStore(), [sample()])
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'created',
            issueNumber: 58,
            issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/58',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
    )

    await expect(
      sendQueuedBorderSubmission(queued.queue[0], {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'limited-key',
        currentSamples: queued.queue[0].dataset.samples,
        fetcher,
      }),
    ).resolves.toMatchObject({ status: 'created', issueNumber: 58 })
    expect(fetcher).toHaveBeenCalledWith(
      'https://intake.example/api/border-rolls',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer limited-key' }),
      }),
    )
    expect(removeQueuedBorderSubmission(queued, 'voyage-auto-test').queue).toEqual([])
  })

  it('keeps authentication errors actionable without exposing a server response', async () => {
    const queued = enqueueBorderRollSequence(createBorderSubmissionStore(), [sample()])
    await expect(
      sendQueuedBorderSubmission(queued.queue[0], {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'wrong-key',
        currentSamples: queued.queue[0].dataset.samples,
        fetcher: vi.fn(async () => new Response('{}', { status: 401 })),
      }),
    ).rejects.toThrow('private submission key was rejected')
  })

  it('never retries a failed snapshot after a local sample is removed', async () => {
    const samples = [sample(0), sample(1)]
    const queued = enqueueBorderRollSequence(createBorderSubmissionStore(), samples)
    const firstAttempt = vi.fn(async () => {
      throw new Error('network unavailable')
    })

    await expect(
      sendQueuedBorderSubmission(queued.queue[0], {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'limited-key',
        currentSamples: samples,
        fetcher: firstAttempt,
      }),
    ).rejects.toThrow('network unavailable')

    const afterRemoval = [samples[0]]
    const retry = vi.fn()
    expect(queuedBorderSubmissionMatchesSamples(queued.queue[0], afterRemoval)).toBe(false)
    await expect(
      sendQueuedBorderSubmission(queued.queue[0], {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'limited-key',
        currentSamples: afterRemoval,
        fetcher: retry,
      }),
    ).rejects.toThrow('no longer matches')
    expect(retry).not.toHaveBeenCalled()
    expect(removeQueuedBorderSubmission(queued, samples[0].sequenceId).queue).toEqual([])
  })

  it('delivers a later Voyage after the first fails and lets the first be retried or canceled', async () => {
    let store = enqueueBorderRollSequence(createBorderSubmissionStore(), [
      sample(0, 'voyage-first'),
    ])
    store = enqueueBorderRollSequence(store, [sample(0, 'voyage-second')])

    const first = nextPendingBorderSubmission(store)!
    await expect(
      sendQueuedBorderSubmission(first, {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'limited-key',
        currentSamples: first.dataset.samples,
        fetcher: vi.fn(async () => new Response('{}', { status: 422 })),
      }),
    ).rejects.toThrow('could not accept')
    store = markQueuedBorderSubmissionFailed(
      store,
      first.sequenceId,
      'The border-roll service could not accept this Voyage yet.',
      '2026-08-04T18:01:00.000Z',
    )

    const second = nextPendingBorderSubmission(store)!
    expect(second.sequenceId).toBe('voyage-second')
    await expect(
      sendQueuedBorderSubmission(second, {
        endpoint: 'https://intake.example/api/border-rolls',
        submissionKey: 'limited-key',
        currentSamples: second.dataset.samples,
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                status: 'created',
                issueNumber: 115,
                issueUrl: 'https://github.com/Alkwer/one-more-map.github.io/issues/115',
              }),
              { status: 201, headers: { 'Content-Type': 'application/json' } },
            ),
        ),
      }),
    ).resolves.toMatchObject({ status: 'created', issueNumber: 115 })

    store = removeQueuedBorderSubmission(store, second.sequenceId)
    expect(nextPendingBorderSubmission(store)).toBeUndefined()
    store = retryQueuedBorderSubmission(store, first.sequenceId)
    expect(nextPendingBorderSubmission(store)?.sequenceId).toBe('voyage-first')
    expect(removeQueuedBorderSubmission(store, first.sequenceId).queue).toEqual([])
  })
})
