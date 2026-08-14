import { assignImportChartUids, type ImportParseResult } from './importParser'
import type { ImportWorkerRequest, ImportWorkerResponse } from './importWorkerProtocol'

export interface ImportWorkerLike {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: ImportWorkerRequest): void
  terminate(): void
}

export type ImportWorkerFactory = () => ImportWorkerLike

export class ImportWorkerRequestCancelledError extends Error {
  constructor() {
    super('Import worker request was superseded')
    this.name = 'ImportWorkerRequestCancelledError'
  }
}

export class ImportWorkerError extends Error {
  constructor(
    message: string,
    readonly code: 'budget' | 'parse',
  ) {
    super(message)
    this.name = 'ImportWorkerError'
  }
}

export const isImportWorkerRequestCancelled = (
  error: unknown,
): error is ImportWorkerRequestCancelledError => error instanceof ImportWorkerRequestCancelledError

const createImportWorker: ImportWorkerFactory = () =>
  new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
    type: 'module',
  })

interface PendingRequest {
  requestId: number
  reject: (reason: unknown) => void
}

export class ImportWorkerClient {
  private worker: ImportWorkerLike | null = null
  private pending: PendingRequest | null = null
  private nextRequestId = 1

  constructor(private readonly workerFactory: ImportWorkerFactory = createImportWorker) {}

  parse(source: string, maxCharts: number): Promise<ImportParseResult> {
    this.cancel()
    const requestId = this.nextRequestId++

    return new Promise<ImportParseResult>((resolve, reject) => {
      let worker: ImportWorkerLike
      try {
        worker = this.workerFactory()
      } catch (error) {
        reject(error)
        return
      }

      this.worker = worker
      this.pending = { requestId, reject }

      const finish = (callback: () => void) => {
        if (this.pending?.requestId !== requestId) return
        this.pending = null
        this.worker = null
        worker.terminate()
        callback()
      }

      worker.onmessage = ({ data }) => {
        if (data.requestId !== requestId) return
        if (data.type === 'error') {
          finish(() => reject(new ImportWorkerError(data.message, data.code)))
          return
        }
        finish(() => resolve(assignImportChartUids(data.result)))
      }

      worker.onerror = (event) => {
        const message =
          event.message ||
          (event.error instanceof Error ? event.error.message : 'The import worker failed')
        finish(() => reject(new Error(message)))
      }

      try {
        worker.postMessage({ type: 'parse-import', requestId, source, maxCharts })
      } catch (error) {
        finish(() => reject(error))
      }
    })
  }

  cancel(): void {
    const pending = this.pending
    this.pending = null
    this.worker?.terminate()
    this.worker = null
    pending?.reject(new ImportWorkerRequestCancelledError())
  }
}
