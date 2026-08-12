import type { StrategyInventoryResult } from './strategySuggestions'
import type { SolverResult } from './solver'
import type { ChartData } from '../types'
import type {
  SolveWorkerPayload,
  SolverWorkerJob,
  SolverWorkerRequest,
  SolverWorkerResponse,
  StrategyInventoryWorkerPayload,
} from './solverWorkerProtocol'
import { toSolverChartDto } from './solverWorkerProtocol'

type StrategyInventoryClientPayload = Omit<StrategyInventoryWorkerPayload, 'pool'> & {
  pool: ChartData[]
}

type SolveClientPayload = Omit<SolveWorkerPayload, 'pool'> & {
  pool: ChartData[]
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<SolverWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: SolverWorkerRequest): void
  terminate(): void
}

export type SolverWorkerFactory = () => WorkerLike

export class WorkerRequestCancelledError extends Error {
  constructor() {
    super('Worker request was superseded')
    this.name = 'WorkerRequestCancelledError'
  }
}

export const isWorkerRequestCancelled = (error: unknown): error is WorkerRequestCancelledError =>
  error instanceof WorkerRequestCancelledError

const createSolverWorker: SolverWorkerFactory = () =>
  new Worker(new URL('../workers/solver.worker.ts', import.meta.url), {
    type: 'module',
  })

interface PendingRequest {
  requestId: number
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export class SolverWorkerClient {
  private worker: WorkerLike | null = null
  private pending: PendingRequest | null = null
  private nextRequestId = 1

  constructor(private readonly workerFactory: SolverWorkerFactory = createSolverWorker) {}

  evaluateStrategyInventory(
    payload: StrategyInventoryClientPayload,
  ): Promise<StrategyInventoryResult> {
    return this.run<StrategyInventoryResult>(
      {
        type: 'strategy-inventory',
        payload: { ...payload, pool: payload.pool.map(toSolverChartDto) },
      },
      'strategy-inventory-result',
    )
  }

  solve(payload: SolveClientPayload): Promise<SolverResult[]> {
    return this.run<SolverResult[]>(
      { type: 'solve', payload: { ...payload, pool: payload.pool.map(toSolverChartDto) } },
      'solve-result',
    )
  }

  cancel() {
    const pending = this.pending
    this.pending = null
    this.worker?.terminate()
    this.worker = null
    pending?.reject(new WorkerRequestCancelledError())
  }

  private run<T>(
    job: SolverWorkerJob,
    expectedType: 'strategy-inventory-result' | 'solve-result',
  ): Promise<T> {
    this.cancel()
    const requestId = this.nextRequestId++

    return new Promise<T>((resolve, reject) => {
      let worker: WorkerLike
      try {
        worker = this.workerFactory()
      } catch (error) {
        reject(error)
        return
      }

      this.worker = worker
      this.pending = {
        requestId,
        resolve: resolve as (value: unknown) => void,
        reject,
      }

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
          finish(() => reject(new Error(data.message)))
          return
        }
        if (data.type !== expectedType) {
          finish(() =>
            reject(
              new Error(
                `Unexpected worker response: expected ${expectedType}, received ${data.type}`,
              ),
            ),
          )
          return
        }
        finish(() => resolve(data.result as T))
      }

      worker.onerror = (event) => {
        const message =
          event.message ||
          (event.error instanceof Error ? event.error.message : 'The solver worker failed')
        finish(() => reject(new Error(message)))
      }

      try {
        worker.postMessage({ ...job, requestId } as SolverWorkerRequest)
      } catch (error) {
        finish(() => reject(error))
      }
    })
  }
}
