import { describe, expect, it } from 'vitest'
import type { SolverWorkerRequest, SolverWorkerResponse } from './solverWorkerProtocol'
import {
  SolverWorkerClient,
  WorkerRequestCancelledError,
  type WorkerLike,
} from './solverWorkerClient'

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SolverWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: SolverWorkerRequest[] = []
  terminated = false

  postMessage(message: SolverWorkerRequest) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  respond(response: SolverWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<SolverWorkerResponse>)
  }
}

const solvePayload = {
  pool: [],
  borders: Array(12).fill(null),
  weights: {},
  options: {
    mode: 'strict' as const,
    allowRotation: true,
    adjacencyMode: 'physical' as const,
    adjacentAffectsSelf: false,
    disabledMods: [],
    topK: 5,
  },
}

describe('SolverWorkerClient', () => {
  it('resolves a matching response and releases the worker', async () => {
    const workers: FakeWorker[] = []
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    const resultPromise = client.solve(solvePayload)
    const request = workers[0].messages[0]
    workers[0].respond({
      type: 'solve-result',
      requestId: request.requestId,
      result: [],
    })

    await expect(resultPromise).resolves.toEqual([])
    expect(workers[0].terminated).toBe(true)
  })

  it('terminates and rejects a superseded request', async () => {
    const workers: FakeWorker[] = []
    const client = new SolverWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    const first = client.solve(solvePayload)
    const firstRejection = expect(first).rejects.toBeInstanceOf(WorkerRequestCancelledError)
    const second = client.solve(solvePayload)

    await firstRejection
    expect(workers[0].terminated).toBe(true)

    const secondRequest = workers[1].messages[0]
    workers[0].respond({
      type: 'solve-result',
      requestId: workers[0].messages[0].requestId,
      result: [],
    })
    workers[1].respond({
      type: 'solve-result',
      requestId: secondRequest.requestId,
      result: [],
    })

    await expect(second).resolves.toEqual([])
  })

  it('surfaces worker failures and releases the worker', async () => {
    const worker = new FakeWorker()
    const client = new SolverWorkerClient(() => worker)
    const resultPromise = client.solve(solvePayload)
    const request = worker.messages[0]

    worker.respond({
      type: 'error',
      requestId: request.requestId,
      message: 'boom',
    })

    await expect(resultPromise).rejects.toThrow('boom')
    expect(worker.terminated).toBe(true)
  })
})
