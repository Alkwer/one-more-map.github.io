import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  StrategyEvaluationOptions,
  StrategyInventoryResult,
} from '../logic/strategySuggestions'
import { createStrategyInventoryKey } from '../logic/solverRequestKeys'
import { isWorkerRequestCancelled, SolverWorkerClient } from '../logic/solverWorkerClient'
import { isChartShapeResolved } from '../logic/chartShapes'
import type { Borders, ChartData } from '../types'

const CACHE_LIMIT = 20
const inventoryCache = new Map<string, StrategyInventoryResult>()

const cacheInventory = (key: string, result: StrategyInventoryResult) => {
  inventoryCache.delete(key)
  inventoryCache.set(key, result)
  if (inventoryCache.size > CACHE_LIMIT) {
    const oldestKey = inventoryCache.keys().next().value
    if (oldestKey !== undefined) inventoryCache.delete(oldestKey)
  }
}

const emptyInventory = (pool: ChartData[], borders: Borders): StrategyInventoryResult => ({
  suggestions: [],
  evaluations: [],
  enteredBorders: borders.filter(Boolean).length,
  availableCharts: pool.length,
  hasEvidence: pool.length > 0 || borders.some(Boolean),
})

interface InventoryState {
  key: string
  result: StrategyInventoryResult | null
  error: string | null
}

export function useStrategyInventory(
  pool: ChartData[],
  borders: Borders,
  options: StrategyEvaluationOptions,
) {
  const eligiblePool = useMemo(() => pool.filter(isChartShapeResolved), [pool])
  const key = useMemo(
    () => createStrategyInventoryKey(eligiblePool, borders, options),
    [eligiblePool, borders, options],
  )
  const placeholder = useMemo(() => emptyInventory(eligiblePool, borders), [eligiblePool, borders])
  const [state, setState] = useState<InventoryState>({
    key: '',
    result: null,
    error: null,
  })
  const clientRef = useRef<SolverWorkerClient | null>(null)
  if (clientRef.current === null) clientRef.current = new SolverWorkerClient()

  const cached = inventoryCache.get(key) ?? null
  const currentResult = cached ?? (state.key === key ? state.result : null)
  const currentError = state.key === key ? state.error : null

  useEffect(() => {
    const client = clientRef.current!
    if (!placeholder.hasEvidence) {
      client.cancel()
      setState({ key, result: placeholder, error: null })
      return
    }

    const cachedResult = inventoryCache.get(key)
    if (cachedResult) {
      client.cancel()
      setState({ key, result: cachedResult, error: null })
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      client
        .evaluateStrategyInventory({
          pool: eligiblePool,
          borders,
          options: {
            ...options,
            disabledMods: [...(options.disabledMods ?? [])],
          },
        })
        .then((result) => {
          if (!active) return
          cacheInventory(key, result)
          setState({ key, result, error: null })
        })
        .catch((error: unknown) => {
          if (!active || isWorkerRequestCancelled(error)) return
          setState({
            key,
            result: null,
            error: error instanceof Error ? error.message : 'Strategy analysis failed',
          })
        })
    }, 80)

    return () => {
      active = false
      window.clearTimeout(timer)
      client.cancel()
    }
  }, [borders, eligiblePool, key, options, placeholder])

  return {
    inventory: currentResult ?? placeholder,
    loading: placeholder.hasEvidence && !currentResult && !currentError,
    error: currentError,
  }
}
