import { evaluateStrategyInventory } from '../logic/strategySuggestions'
import { solve } from '../logic/solver'
import type { SolverWorkerRequest, SolverWorkerResponse } from '../logic/solverWorkerProtocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<SolverWorkerRequest>) => void) | null
  postMessage(message: SolverWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data }) => {
  try {
    if (data.type === 'strategy-inventory') {
      const { pool, borders, options, limit } = data.payload
      const result = evaluateStrategyInventory(
        borders,
        new Map(pool.map((chart) => [chart.uid, chart])),
        pool,
        {
          ...options,
          disabledMods: new Set(options.disabledMods),
        },
        limit,
      )
      workerScope.postMessage({
        type: 'strategy-inventory-result',
        requestId: data.requestId,
        result,
      })
      return
    }

    const { pool, borders, weights, options } = data.payload
    const result = solve(pool, borders, weights, {
      ...options,
      disabledMods: new Set(options.disabledMods),
    })
    workerScope.postMessage({
      type: 'solve-result',
      requestId: data.requestId,
      result,
    })
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
