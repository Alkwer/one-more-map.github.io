import {
  createBorderRollDataset,
  isCompleteBorderRollSequence,
  type BorderRollDataset,
  type BorderRollSample,
} from './borderRollResearch'

const STORAGE_KEY = 'allflame-border-roll-submission'
const STORE_VERSION = 1

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
  queuedAt: string
  dataset: BorderRollDataset
}

export interface BorderSubmissionStore {
  version: typeof STORE_VERSION
  settings: BorderSubmissionSettings
  queue: QueuedBorderSubmission[]
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

function isQueuedSubmission(value: unknown): value is QueuedBorderSubmission {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<QueuedBorderSubmission>
  return (
    typeof item.sequenceId === 'string' &&
    item.sequenceId.length > 0 &&
    typeof item.queuedAt === 'string' &&
    Number.isFinite(Date.parse(item.queuedAt)) &&
    !!item.dataset &&
    item.dataset.schema === 'allflame-border-roll-dataset/v2' &&
    Array.isArray(item.dataset.samples) &&
    item.dataset.samples.length > 0 &&
    item.dataset.sampleCount === item.dataset.samples.length &&
    item.dataset.samples.every((sample) => sample.sequenceId === item.sequenceId)
  )
}

export function loadBorderSubmissionStore(): BorderSubmissionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createBorderSubmissionStore()
    const value = JSON.parse(raw) as Partial<BorderSubmissionStore>
    if (
      value.version !== STORE_VERSION ||
      !value.settings ||
      typeof value.settings.enabled !== 'boolean' ||
      typeof value.settings.submissionKey !== 'string' ||
      !Array.isArray(value.queue) ||
      !value.queue.every(isQueuedSubmission)
    ) {
      return createBorderSubmissionStore()
    }
    return value as BorderSubmissionStore
  } catch {
    return createBorderSubmissionStore()
  }
}

export function saveBorderSubmissionStore(store: BorderSubmissionStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage full or unavailable */
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
  queuedAt = new Date().toISOString(),
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
        queuedAt,
        dataset: createBorderRollDataset(
          [...samples].sort((a, b) => a.rerollIndex - b.rerollIndex),
        ),
      },
    ],
  }
}

export function removeQueuedBorderSubmission(
  store: BorderSubmissionStore,
  sequenceId: string,
): BorderSubmissionStore {
  return { ...store, queue: store.queue.filter((item) => item.sequenceId !== sequenceId) }
}

export async function sendQueuedBorderSubmission(
  item: QueuedBorderSubmission,
  options: {
    endpoint: string
    submissionKey: string
    fetcher?: typeof fetch
  },
): Promise<BorderSubmissionResponse> {
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
