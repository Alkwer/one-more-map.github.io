import { describe, expect, it } from 'vitest'
import type { ImportParseResult } from './importParser'
import {
  ImportWorkerClient,
  ImportWorkerError,
  ImportWorkerRequestCancelledError,
  type ImportWorkerLike,
} from './importWorkerClient'
import type { ImportWorkerRequest, ImportWorkerResponse } from './importWorkerProtocol'
import { emptyBorders } from '../types'

class FakeWorker implements ImportWorkerLike {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: ImportWorkerRequest[] = []
  terminated = false

  postMessage(message: ImportWorkerRequest) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  respond(response: ImportWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<ImportWorkerResponse>)
  }
}

const parsedResult = (uid: string): ImportParseResult => ({
  borderOcr: {
    chartText: '',
    borders: emptyBorders(),
    matches: [],
    misses: [],
    blockCount: 0,
    uniqueBlockCount: 0,
    snapshotComplete: false,
    scanMeta: null,
    ocrLanguages: [],
    rerollCost: null,
    rerollCostBlockCount: 0,
    rerollCostMisses: [],
  },
  charts: [
    {
      uid,
      name: 'Worker Chart',
      level: 83,
      edges: [true, true, true, true],
      modIds: [],
      shape: 'Crossing',
      shapeResolved: true,
    },
  ],
  rejected: [],
  unresolved: [{ uid, name: 'Worker Chart', reason: 'test diagnostic' }],
})

describe('ImportWorkerClient', () => {
  it('posts the source and resolves only the matching worker result', async () => {
    const worker = new FakeWorker()
    const client = new ImportWorkerClient(() => worker)
    const resultPromise = client.parse('clipboard source', 17)
    const request = worker.messages[0]

    expect(request).toEqual({
      type: 'parse-import',
      requestId: 1,
      source: 'clipboard source',
      maxCharts: 17,
    })

    worker.respond({
      type: 'parse-result',
      requestId: request.requestId,
      result: parsedResult('worker-local-id'),
    })

    const result = await resultPromise
    expect(result.charts[0].uid).not.toBe('worker-local-id')
    expect(result.unresolved[0].uid).toBe(result.charts[0].uid)
    expect(worker.terminated).toBe(true)
  })

  it('terminates and rejects a superseded request while ignoring its stale response', async () => {
    const workers: FakeWorker[] = []
    const client = new ImportWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    const first = client.parse('first', 250)
    const firstRejection = expect(first).rejects.toBeInstanceOf(ImportWorkerRequestCancelledError)
    const second = client.parse('second', 250)

    await firstRejection
    expect(workers[0].terminated).toBe(true)
    workers[0].respond({ type: 'parse-result', requestId: 1, result: parsedResult('stale') })
    workers[1].respond({ type: 'parse-result', requestId: 2, result: parsedResult('current') })

    await expect(second).resolves.toMatchObject({ charts: [{ name: 'Worker Chart' }] })
  })

  it('surfaces classified budget failures and releases the worker', async () => {
    const worker = new FakeWorker()
    const client = new ImportWorkerClient(() => worker)
    const resultPromise = client.parse('oversized', 250)

    worker.respond({
      type: 'error',
      requestId: 1,
      code: 'budget',
      message: 'Import rejected: maximum size',
    })

    await expect(resultPromise).rejects.toEqual(
      new ImportWorkerError('Import rejected: maximum size', 'budget'),
    )
    expect(worker.terminated).toBe(true)
  })

  it('cancels in-flight work explicitly for component unmount cleanup', async () => {
    const worker = new FakeWorker()
    const client = new ImportWorkerClient(() => worker)
    const resultPromise = client.parse('pending', 250)

    client.cancel()

    await expect(resultPromise).rejects.toBeInstanceOf(ImportWorkerRequestCancelledError)
    expect(worker.terminated).toBe(true)
  })
})
