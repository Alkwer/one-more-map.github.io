import { isImportBudgetError } from '../logic/importBudget'
import { parseImportSource } from '../logic/importParser'
import type { ImportWorkerRequest, ImportWorkerResponse } from '../logic/importWorkerProtocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<ImportWorkerRequest>) => void) | null
  postMessage(message: ImportWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({
      type: 'parse-result',
      requestId: data.requestId,
      result: parseImportSource(data.source, data.maxCharts),
    })
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId: data.requestId,
      code: isImportBudgetError(error) ? 'budget' : 'parse',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
