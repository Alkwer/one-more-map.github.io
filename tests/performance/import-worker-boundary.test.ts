import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { makeMaximumChartImportSource } from '../../benchmarks/import-performance-fixture'
import {
  ImportWorkerClient,
  ImportWorkerRequestCancelledError,
  type ImportWorkerLike,
} from '../../src/logic/importWorkerClient'
import type {
  ImportWorkerRequest,
  ImportWorkerResponse,
} from '../../src/logic/importWorkerProtocol'

const MAIN_THREAD_TASK_BUDGET_MS = 50
const SAMPLE_COUNT = 5

class StructuredCloneWorkerBoundary implements ImportWorkerLike {
  onmessage: ((event: MessageEvent<ImportWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(message: ImportWorkerRequest) {
    structuredClone(message)
  }

  terminate() {}
}

describe('clipboard import worker performance boundary', () => {
  it('dispatches the maximum 512 KiB import without a 50 ms main-thread task', async () => {
    const source = makeMaximumChartImportSource()
    const samples: number[] = []

    for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
      const client = new ImportWorkerClient(() => new StructuredCloneWorkerBoundary())
      const started = performance.now()
      const pending = client.parse(source, 250)
      samples.push(performance.now() - started)
      const cancelled = pending.catch((error: unknown) => error)
      client.cancel()
      assert.ok((await cancelled) instanceof ImportWorkerRequestCancelledError)
    }

    const maximumMs = Math.max(...samples)
    console.info(
      `Maximum import main-thread dispatch: max ${maximumMs.toFixed(2)} ms (${source.length.toLocaleString('en-US')} characters)`,
    )
    assert.ok(
      maximumMs < MAIN_THREAD_TASK_BUDGET_MS,
      `Maximum import dispatch ${maximumMs.toFixed(2)} ms exceeded the ${MAIN_THREAD_TASK_BUDGET_MS} ms main-thread task budget`,
    )
  })
})
