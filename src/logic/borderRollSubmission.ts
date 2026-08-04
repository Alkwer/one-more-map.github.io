import {
  createBorderRollDataset,
  isCompleteBorderRollSequence,
  type BorderRollDataset,
  type BorderRollSample,
} from './borderRollResearch'
import {
  incompatibleAuxiliaryStore,
  unavailableAuxiliaryStore,
  type AuxiliaryStorageRecovery,
} from './auxiliaryStorageRecovery'

export const BORDER_SUBMISSION_STORAGE_KEY = 'allflame-border-roll-submission'
const STORE_VERSION = 3

const PRODUCTION_INTAKE_URL =
  'https://allflame-border-roll-intake.green-loom-6865.chatgpt.site/api/border-rolls'

// A Vite environment override remains useful for local and staging deployments.
export const BORDER_ROLL_INTAKE_URL =
  (import.meta.env.VITE_BORDER_ROLL_INTAKE_URL as string | undefined)?.trim() ||
  PRODUCTION_INTAKE_URL

export interface BorderSubmissionSettings {
  enabled: boolean
  submissionKey: string
}

export interface QueuedBorderSubmission {
  sequenceId: string
  dataset: BorderRollDataset
  delivery: {
    status: 'pending' | 'failed'
    attemptCount: number
    lastAttemptAt: string | null
    lastError: string | null
  }
}

export interface BorderSubmissionStore {
  version: typeof STORE_VERSION
  settings: BorderSubmissionSettings
  queue: QueuedBorderSubmission[]
  /** Present only in memory while incompatible or unavailable storage blocks writes. */
  recovery?: AuxiliaryStorageRecovery
}

export interface BorderSubmissionResponse {
  status: 'created' | 'duplicate'
  issueNumber: number
  issueUrl: string
}

export function createBorderSubmissionStore(): BorderSubmissionStore {
  return {
    version: STORE_VERSION,
    settings: { enabled: false, submissionKey: '' },
    queue: [],
  }
}

function isDeliveryState(value: unknown): value is QueuedBorderSubmission['delivery'] {
  if (!value || typeof value !== 'object') return false
  const delivery = value as Partial<QueuedBorderSubmission['delivery']>
  return (
    (delivery.status === 'pending' || delivery.status === 'failed') &&
    typeof delivery.attemptCount === 'number' &&
    Number.isInteger(delivery.attemptCount) &&
    delivery.attemptCount >= 0 &&
    (delivery.lastAttemptAt === null ||
      (typeof delivery.lastAttemptAt === 'string' &&
        Number.isFinite(Date.parse(delivery.lastAttemptAt)))) &&
    (delivery.lastError === null || typeof delivery.lastError === 'string')
  )
}

function isQueuedSubmission(
  value: unknown,
  requireDelivery = true,
): value is QueuedBorderSubmission {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<QueuedBorderSubmission>
  return (
    typeof item.sequenceId === 'string' &&
    item.sequenceId.length > 0 &&
    !!item.dataset &&
    item.dataset.schema === 'allflame-border-roll-dataset/v2' &&
    Array.isArray(item.dataset.samples) &&
    item.dataset.samples.length > 0 &&
    item.dataset.sampleCount === item.dataset.samples.length &&
    item.dataset.samples.every((sample) => sample.sequenceId === item.sequenceId) &&
    (!requireDelivery || isDeliveryState(item.delivery))
  )
}

function migrateQueuedSubmission(
  item: QueuedBorderSubmission,
  keepDelivery: boolean,
): QueuedBorderSubmission {
  return {
    sequenceId: item.sequenceId,
    dataset: {
      ...item.dataset,
      samples: item.dataset.samples.map((sample) =>
        sample.vesperUpgradeCount === undefined ? { ...sample, vesperUpgradeCount: null } : sample,
      ),
    },
    delivery:
      keepDelivery && isDeliveryState(item.delivery)
        ? item.delivery
        : { status: 'pending', attemptCount: 0, lastAttemptAt: null, lastError: null },
  }
}

export function loadBorderSubmissionStore(): BorderSubmissionStore {
  let raw: string | null
  try {
    raw = localStorage.getItem(BORDER_SUBMISSION_STORAGE_KEY)
  } catch {
    return {
      ...createBorderSubmissionStore(),
      recovery: unavailableAuxiliaryStore('Border submission storage is unavailable.'),
    }
  }
  if (!raw) return createBorderSubmissionStore()

  let value: {
    version?: number
    settings?: Partial<BorderSubmissionSettings>
    queue?: unknown[]
  }
  try {
    value = JSON.parse(raw) as typeof value
  } catch {
    return {
      ...createBorderSubmissionStore(),
      recovery: incompatibleAuxiliaryStore(
        BORDER_SUBMISSION_STORAGE_KEY,
        raw,
        'invalid',
        'Border submission queue is malformed JSON.',
      ),
    }
  }

  try {
    const legacyVersion = value.version === 1 || value.version === 2
    if (
      (!legacyVersion && value.version !== STORE_VERSION) ||
      !value.settings ||
      typeof value.settings.enabled !== 'boolean' ||
      !Array.isArray(value.queue) ||
      !value.queue.every((item) => isQueuedSubmission(item, !legacyVersion))
    ) {
      const newer =
        typeof value.version === 'number' &&
        Number.isInteger(value.version) &&
        value.version > STORE_VERSION
      return {
        ...createBorderSubmissionStore(),
        recovery: incompatibleAuxiliaryStore(
          BORDER_SUBMISSION_STORAGE_KEY,
          raw,
          newer ? 'incompatible' : 'invalid',
          newer
            ? `Border submission version ${value.version} is newer than supported version ${STORE_VERSION}.`
            : 'Border submission queue failed validation.',
        ),
      }
    }
    const clean: BorderSubmissionStore = {
      version: STORE_VERSION,
      settings: { enabled: value.settings.enabled, submissionKey: '' },
      queue: value.queue
        .filter((item) => isQueuedSubmission(item, !legacyVersion))
        .map((item) => migrateQueuedSubmission(item, !legacyVersion)),
    }
    // Version 1 persisted the key. Rewriting immediately is the migration and
    // rotation boundary: the old credential is removed before React renders.
    return saveBorderSubmissionStore(clean)
      ? clean
      : {
          ...clean,
          recovery: unavailableAuxiliaryStore(
            'The migrated border submission queue could not be saved because storage is unavailable.',
          ),
        }
  } catch {
    return {
      ...createBorderSubmissionStore(),
      recovery: incompatibleAuxiliaryStore(
        BORDER_SUBMISSION_STORAGE_KEY,
        raw,
        'invalid',
        'Border submission queue could not be decoded.',
      ),
    }
  }
}

export function saveBorderSubmissionStore(store: BorderSubmissionStore): boolean {
  if (store.recovery) return false
  try {
    localStorage.setItem(
      BORDER_SUBMISSION_STORAGE_KEY,
      JSON.stringify({
        version: STORE_VERSION,
        settings: { enabled: store.settings.enabled },
        queue: store.queue.map((item) => ({
          sequenceId: item.sequenceId,
          dataset: item.dataset,
          delivery: item.delivery,
        })),
      }),
    )
    return true
  } catch {
    return false
  }
}

export function resetBorderSubmissionStore(): BorderSubmissionStore {
  const clean = createBorderSubmissionStore()
  return saveBorderSubmissionStore(clean)
    ? clean
    : {
        ...clean,
        recovery: unavailableAuxiliaryStore('Border submission storage is unavailable.'),
      }
}

export function updateBorderSubmissionSettings(
  store: BorderSubmissionStore,
  patch: Partial<BorderSubmissionSettings>,
): BorderSubmissionStore {
  return { ...store, settings: { ...store.settings, ...patch } }
}

export function enqueueBorderRollSequence(
  store: BorderSubmissionStore,
  samples: BorderRollSample[],
): BorderSubmissionStore {
  if (!isCompleteBorderRollSequence(samples)) {
    throw new Error('Only a complete Voyage sequence can be queued for submission.')
  }
  const sequenceId = samples[0].sequenceId
  if (store.queue.some((item) => item.sequenceId === sequenceId)) return store
  return {
    ...store,
    queue: [
      ...store.queue,
      {
        sequenceId,
        dataset: createBorderRollDataset(
          [...samples].sort((a, b) => a.rerollIndex - b.rerollIndex),
        ),
        delivery: { status: 'pending', attemptCount: 0, lastAttemptAt: null, lastError: null },
      },
    ],
  }
}

export function nextPendingBorderSubmission(
  store: BorderSubmissionStore,
): QueuedBorderSubmission | undefined {
  return store.queue.find((item) => item.delivery.status === 'pending')
}

export function markQueuedBorderSubmissionFailed(
  store: BorderSubmissionStore,
  sequenceId: string,
  error: string,
  attemptedAt = new Date().toISOString(),
): BorderSubmissionStore {
  return {
    ...store,
    queue: store.queue.map((item) =>
      item.sequenceId === sequenceId
        ? {
            ...item,
            delivery: {
              status: 'failed',
              attemptCount: item.delivery.attemptCount + 1,
              lastAttemptAt: attemptedAt,
              lastError: error,
            },
          }
        : item,
    ),
  }
}

export function retryQueuedBorderSubmission(
  store: BorderSubmissionStore,
  sequenceId: string,
): BorderSubmissionStore {
  return {
    ...store,
    queue: store.queue.map((item) =>
      item.sequenceId === sequenceId
        ? {
            ...item,
            delivery: { ...item.delivery, status: 'pending', lastError: null },
          }
        : item,
    ),
  }
}

export function removeQueuedBorderSubmission(
  store: BorderSubmissionStore,
  sequenceId: string,
): BorderSubmissionStore {
  return { ...store, queue: store.queue.filter((item) => item.sequenceId !== sequenceId) }
}

export function queuedBorderSubmissionMatchesSamples(
  item: QueuedBorderSubmission,
  samples: BorderRollSample[],
): boolean {
  if (!isCompleteBorderRollSequence(samples)) return false
  const ordered = [...samples].sort((left, right) => left.rerollIndex - right.rerollIndex)
  return (
    item.dataset.sampleCount === ordered.length &&
    item.dataset.samples.length === ordered.length &&
    item.dataset.samples.every(
      (queuedSample, index) => JSON.stringify(queuedSample) === JSON.stringify(ordered[index]),
    )
  )
}

export async function sendQueuedBorderSubmission(
  item: QueuedBorderSubmission,
  options: {
    endpoint: string
    submissionKey: string
    currentSamples: BorderRollSample[]
    signal?: AbortSignal
    fetcher?: typeof fetch
  },
): Promise<BorderSubmissionResponse> {
  if (!queuedBorderSubmissionMatchesSamples(item, options.currentSamples)) {
    throw new Error(
      'The queued Voyage no longer matches its current local sequence. Cancel it or rebuild it explicitly.',
    )
  }
  const endpoint = options.endpoint.trim()
  const submissionKey = options.submissionKey.trim()
  if (!endpoint) throw new Error('The automatic submission endpoint is not configured.')
  if (!submissionKey) throw new Error('Enter the private submission key first.')

  const response = await (options.fetcher ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${submissionKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item.dataset),
    signal: options.signal,
  })
  const body = (await response.json().catch(() => null)) as Partial<BorderSubmissionResponse> | null
  if (
    !response.ok ||
    !body ||
    (body.status !== 'created' && body.status !== 'duplicate') ||
    !Number.isInteger(body.issueNumber) ||
    typeof body.issueUrl !== 'string'
  ) {
    throw new Error(
      response.status === 401
        ? 'The private submission key was rejected.'
        : 'The border-roll service could not accept this Voyage yet.',
    )
  }
  return body as BorderSubmissionResponse
}
