import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BORDER_MODS } from '../data/mods'
import type { Borders } from '../types'
import { createBorderRollSample } from './borderRollResearch'
import {
  BORDER_ROLL_INTAKE_URL,
  createBorderSubmissionStore,
  enqueueBorderRollSequence,
  loadBorderSubmissionStore,
  removeQueuedBorderSubmission,
  saveBorderSubmissionStore,
  sendQueuedBorderSubmission,
  updateBorderSubmissionSettings,
} from './borderRollSubmission'

const borders = (): Borders =>
  Array.from({ length: 12 }, (_, index) => BORDER_MODS[index % BORDER_MODS.length].id)

function sample(rerollIndex = 0) {
  const result = createBorderRollSample({
    sequenceId: 'voyage-auto-test',
    gamePatch: '3.29.0',
    rerollIndex,
    displayedNextRerollCost: rerollIndex === 0 ? 3000 : 6000,
    borders: borders(),
    capturedAt: `2026-08-01T12:00:0${rerollIndex}.000Z`,
  })
  if (!result.ok) throw new Error(result.message)
  return result.sample
}

describe('border roll automatic submission queue', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    })
  })

  it('uses the deployed production intake endpoint by default', () => {
    expect(BORDER_ROLL_INTAKE_URL).toBe(
      'https://allflame-border-roll-intake.green-loom-6865.chatgpt.site/api/border-rolls',
    )
  })

  it('queues one complete sequence once and persists private settings locally', () => {
    let store = updateBorderSubmissionSettings(createBorderSubmissionStore(), {
      enabled: true,
      submissionKey: 'private-test-key',
    })
    store = enqueueBorderRollSequence(store, [sample(0), sample(1)], '2026-08-01T13:00:00.000Z')
    store = enqueueBorderRollSequence(store, [sample(0), sample(1)], '2026-08-01T13:01:00.000Z')
    saveBorderSubmissionStore(store)

    expect(loadBorderSubmissionStore()).toMatchObject({
      settings: { enabled: true, submissionKey: 'private-test-key' },
      queue: [
        {
          sequenceId: 'voyage-auto-test',
          dataset: { sampleCount: 2, samples: [{ rerollIndex: 0 }, { rerollIndex: 1 }] },
        },
      ],
    })
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
        fetcher: vi.fn(async () => new Response('{}', { status: 401 })),
      }),
    ).rejects.toThrow('private submission key was rejected')
  })
})
