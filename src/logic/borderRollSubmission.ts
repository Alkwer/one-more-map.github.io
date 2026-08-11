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
  /** Present only in memory after a persisted legacy credential was removed. */
  credentialRotationRequired?: boolean
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

interface CredentialScrubResult {
  raw: string | null
  removed: boolean
  rotationRequired: boolean
}

const LEGACY_CREDENTIAL_PATTERN = /"submissionKey"\s*:/
const SUBMISSION_RECOVERY_PREFIX = `${BORDER_SUBMISSION_STORAGE_KEY}-recovery-`
const MAX_CREDENTIAL_SCRUB_NODES = 10_000

function scrubCredentialPayload(raw: string): CredentialScrubResult {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    const containsCredential = LEGACY_CREDENTIAL_PATTERN.test(raw)
    return {
      raw: containsCredential ? null : raw,
      removed: containsCredential,
      rotationRequired: containsCredential,
    }
  }

  const pending: unknown[] = [value]
  let visited = 0
  let removed = false
  let rotationRequired = false
  while (pending.length > 0) {
    visited += 1
    if (visited > MAX_CREDENTIAL_SCRUB_NODES) {
      return {
        raw: null,
        removed: true,
        rotationRequired: true,
      }
    }
    const current = pending.pop()
    if (!current || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      pending.push(...current)
      continue
    }
    const record = current as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(record, 'submissionKey')) {
      const credential = record.submissionKey
      rotationRequired ||= typeof credential !== 'string' || credential.trim().length > 0
      delete record.submissionKey
      removed = true
    }
    pending.push(...Object.values(record))
  }

  return { raw: removed ? JSON.stringify(value) : raw, removed, rotationRequired }
}

function scrubCredentialBackups(): boolean {
  let rotationRequired = false
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(SUBMISSION_RECOVERY_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      const scrubbed = scrubCredentialPayload(raw)
      rotationRequired ||= scrubbed.rotationRequired
      if (!scrubbed.removed) continue
      if (scrubbed.raw === null) {
        localStorage.removeItem(key)
        continue
      }
      try {
        localStorage.setItem(key, scrubbed.raw)
        if (localStorage.getItem(key) !== scrubbed.raw)
          throw new Error('backup verification failed')
      } catch {
        localStorage.removeItem(key)
      }
    }
  } catch {
    /* The normal unavailable-storage recovery path handles inaccessible storage. */
  }
  return rotationRequired
}

function withCredentialRotation(
  store: BorderSubmissionStore,
  credentialRotationRequired: boolean,
): BorderSubmissionStore {
  return credentialRotationRequired ? { ...store, credentialRotationRequired: true } : store
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
      samples: item.dataset.samples.map((sample) => ({
        ...sample,
        ...(sample.vesperUpgradeCount === undefined ? { vesperUpgradeCount: null } : {}),
        ...(sample.samplingReason === undefined ? { samplingReason: 'unknown' as const } : {}),
      })),
    },
    delivery:
      keepDelivery && isDeliveryState(item.delivery)
        ? item.delivery
        : { status: 'pending', attemptCount: 0, lastAttemptAt: null, lastError: null },
  }
}

export function loadBorderSubmissionStore(): BorderSubmissionStore {
  let credentialRotationRequired = scrubCredentialBackups()
  let raw: string | null
  try {
    raw = localStorage.getItem(BORDER_SUBMISSION_STORAGE_KEY)
  } catch {
    return withCredentialRotation(
      {
        ...createBorderSubmissionStore(),
        recovery: unavailableAuxiliaryStore('Border submission storage is unavailable.'),
      },
      credentialRotationRequired,
    )
  }
  if (!raw) return withCredentialRotation(createBorderSubmissionStore(), credentialRotationRequired)

  const scrubbed = scrubCredentialPayload(raw)
  credentialRotationRequired ||= scrubbed.rotationRequired
  if (scrubbed.removed) {
    try {
      if (scrubbed.raw === null) {
        localStorage.removeItem(BORDER_SUBMISSION_STORAGE_KEY)
        return withCredentialRotation(createBorderSubmissionStore(), credentialRotationRequired)
      }
      localStorage.setItem(BORDER_SUBMISSION_STORAGE_KEY, scrubbed.raw)
      if (localStorage.getItem(BORDER_SUBMISSION_STORAGE_KEY) !== scrubbed.raw) {
        throw new Error('credential scrub verification failed')
      }
      raw = scrubbed.raw
    } catch {
      try {
        localStorage.removeItem(BORDER_SUBMISSION_STORAGE_KEY)
      } catch {
        /* storage is unavailable */
      }
      return withCredentialRotation(
        {
          ...createBorderSubmissionStore(),
          recovery: unavailableAuxiliaryStore(
            'A persisted legacy submission key could not be scrubbed because storage is unavailable.',
          ),
        },
        credentialRotationRequired,
      )
    }
  }

  let value: {
    version?: number
    settings?: Partial<BorderSubmissionSettings>
    queue?: unknown[]
  }
  try {
    value = JSON.parse(raw) as typeof value
  } catch {
    return withCredentialRotation(
      {
        ...createBorderSubmissionStore(),
        recovery: incompatibleAuxiliaryStore(
          BORDER_SUBMISSION_STORAGE_KEY,
          raw,
          'invalid',
          'Border submission queue is malformed JSON.',
        ),
      },
      credentialRotationRequired,
    )
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
      return withCredentialRotation(
        {
          ...createBorderSubmissionStore(),
          recovery: incompatibleAuxiliaryStore(
            BORDER_SUBMISSION_STORAGE_KEY,
            raw,
            newer ? 'incompatible' : 'invalid',
            newer
              ? `Border submission version ${value.version} is newer than supported version ${STORE_VERSION}.`
              : 'Border submission queue failed validation.',
          ),
        },
        credentialRotationRequired,
      )
    }
    const clean: BorderSubmissionStore = {
      version: STORE_VERSION,
      settings: { enabled: value.settings.enabled, submissionKey: '' },
      queue: value.queue
        .filter((item) => isQueuedSubmission(item, !legacyVersion))
        .map((item) => migrateQueuedSubmission(item, !legacyVersion)),
      ...(credentialRotationRequired ? { credentialRotationRequired: true } : {}),
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
    return withCredentialRotation(
      {
        ...createBorderSubmissionStore(),
        recovery: incompatibleAuxiliaryStore(
          BORDER_SUBMISSION_STORAGE_KEY,
          raw,
          'invalid',
          'Border submission queue could not be decoded.',
        ),
      },
      credentialRotationRequired,
    )
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
  let credentialRotationRequired = scrubCredentialBackups()
  try {
    const raw = localStorage.getItem(BORDER_SUBMISSION_STORAGE_KEY)
    if (raw !== null) {
      const scrubbed = scrubCredentialPayload(raw)
      credentialRotationRequired ||= scrubbed.rotationRequired
      if (scrubbed.removed) {
        if (scrubbed.raw === null) localStorage.removeItem(BORDER_SUBMISSION_STORAGE_KEY)
        else localStorage.setItem(BORDER_SUBMISSION_STORAGE_KEY, scrubbed.raw)
      }
    }
  } catch {
    try {
      localStorage.removeItem(BORDER_SUBMISSION_STORAGE_KEY)
    } catch {
      /* saveBorderSubmissionStore reports unavailable storage below */
    }
  }
  const clean = withCredentialRotation(createBorderSubmissionStore(), credentialRotationRequired)
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
