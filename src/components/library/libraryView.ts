import { voyageModById } from '../../data/mods'
import { chartValue } from '../../logic/chartRanking'
import type { ChartData, Weights } from '../../types'

export type LibrarySortMode = 'value' | 'level' | 'name'
export type LibraryViewMode = 'grid' | 'list'

export function loadLibraryViewMode(): LibraryViewMode {
  try {
    const stored = globalThis.localStorage.getItem('library-view')
    return stored === 'grid' || stored === 'list' ? stored : 'grid'
  } catch {
    return 'grid'
  }
}

interface SelectVisibleChartsOptions {
  pool: ChartData[]
  query: string
  sort: LibrarySortMode
  weights: Weights
  disabledMods: ReadonlySet<string>
}

export function selectVisibleCharts({
  pool,
  query,
  sort,
  weights,
  disabledMods,
}: SelectVisibleChartsOptions): ChartData[] {
  const normalizedQuery = query.trim().toLowerCase()
  let visible = pool

  if (normalizedQuery) {
    visible = visible.filter((chart) => {
      if (chart.name.toLowerCase().includes(normalizedQuery)) return true
      return chart.modIds.some((id) =>
        voyageModById.get(id)?.text.toLowerCase().includes(normalizedQuery),
      )
    })
  }

  return [...visible].sort((left, right) => {
    if (sort === 'level') return right.level - left.level
    if (sort === 'name') return left.name.localeCompare(right.name)
    return chartValue(right, weights, disabledMods) - chartValue(left, weights, disabledMods)
  })
}
