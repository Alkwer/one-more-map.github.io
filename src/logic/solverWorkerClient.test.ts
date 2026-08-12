import { describe, expect, it } from 'vitest'
import type { ChartData } from '../types'
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
  it('posts only computational chart fields to the worker', async () => {
    const worker = new FakeWorker()
    const client = new SolverWorkerClient(() => worker)
    const chart: ChartData = {
      uid: 'chart-1',
      name: 'Pelagic Chart',
      level: 83,
      edges: [true, false, true, false],
      areaType: 'pelagic-abyss',
      modIds: ['adj-box-3'],
      rewards: [{ stat: 'quantity', percent: 42 }],
      shape: 'Straight',
      shapeResolved: true,
      shapeInput: 'Straight',
      implicitText: 'presentation-only implicit',
      rawText: 'presentation-only source text',
      preserved: true,
    }

    const resultPromise = client.solve({ ...solvePayload, pool: [chart] })

    expect(worker.messages[0]).toMatchObject({
      type: 'solve',
      payload: {
        pool: [
          {
            uid: chart.uid,
            name: chart.name,
            edges: chart.edges,
            areaType: chart.areaType,
            modIds: chart.modIds,
            rewards: chart.rewards,
            shapeResolved: true,
          },
        ],
      },
    })
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('rawText')
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('level')
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('implicitText')
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('shapeInput')
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('shape')
    expect(worker.messages[0].payload.pool[0]).not.toHaveProperty('preserved')

    const cancellation = expect(resultPromise).rejects.toBeInstanceOf(WorkerRequestCancelledError)
    client.cancel()
    await cancellation
  })

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
