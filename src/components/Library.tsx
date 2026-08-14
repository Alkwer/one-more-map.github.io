import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { StrategyReservationPreferences } from '../data/strategies'
import { selectPieceBank, type PieceType } from '../logic/pieceKeeps'
import { newUid } from '../logic/parser'
import { MAX_POOL_CHARTS } from '../logic/storage'
import type { ChartAdditionResult } from '../logic/chartCapacity'
import type { Board, ChartData, Weights } from '../types'
import { ChartGrid } from './library/ChartGrid'
import { ChartList } from './library/ChartList'
import {
  loadLibraryViewMode,
  LIBRARY_PAGE_SIZE,
  paginateLibrary,
  selectVisibleCharts,
  type LibrarySortMode,
  type LibraryViewMode,
} from './library/libraryView'

interface Props {
  pool: ChartData[]
  board: Board
  weights: Weights
  disabledMods: Set<string>
  reservations: StrategyReservationPreferences
  pieceKeeps: Record<string, number>
  selected: string | null
  onSelect: (uid: string) => void
  onAdd: (charts: ChartData[]) => ChartAdditionResult
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
  onClearCharts: () => void
  onOpenSaveWizard?: () => void
}

export function Library(props: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LibrarySortMode>('value')
  const [view, setView] = useState<LibraryViewMode>(loadLibraryViewMode)
  const [page, setPage] = useState(0)
  const libraryRef = useRef<HTMLElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<{
    uid: string | null
    target: 'primary' | 'editor' | 'shape' | 'add'
  } | null>(null)
  const pageStatusId = useId()
  const setViewPersist = (nextView: LibraryViewMode) => {
    setView(nextView)
    try {
      localStorage.setItem('library-view', nextView)
    } catch {
      /* ignore */
    }
  }
  const onBoard = new Set(props.board.filter(Boolean).map((placement) => placement!.chartUid))
  const bank = useMemo<Map<string, PieceType>>(
    () => selectPieceBank(props.pool, props.pieceKeeps, props.reservations),
    [props.pool, props.pieceKeeps, props.reservations],
  )

  const addBlank = () => {
    const chart: ChartData = {
      uid: newUid(),
      name: `Chart ${props.pool.length + 1}`,
      level: 80,
      edges: [true, true, true, true],
      modIds: [],
      shape: 'Crossing',
      shapeResolved: true,
    }
    const result = props.onAdd([chart])
    if (result.added === 0) return
    pendingFocus.current = { uid: chart.uid, target: 'editor' }
    setViewPersist('list')
    setEditing(chart.uid)
  }

  const visible = useMemo(
    () =>
      selectVisibleCharts({
        pool: props.pool,
        query,
        sort,
        weights: props.weights,
        disabledMods: props.disabledMods,
      }),
    [props.pool, props.weights, props.disabledMods, query, sort],
  )

  const editingIndex =
    view === 'list' && editing ? visible.findIndex((chart) => chart.uid === editing) : -1
  const editingPage = editingIndex >= 0 ? Math.floor(editingIndex / LIBRARY_PAGE_SIZE) : null
  const paged = paginateLibrary(visible, editingPage ?? page)

  useLayoutEffect(() => {
    const request = pendingFocus.current
    if (!request) return

    if (request.target === 'add') {
      addButtonRef.current?.focus()
      pendingFocus.current = null
      return
    }

    const card = Array.from(
      libraryRef.current?.querySelectorAll<HTMLElement>('[data-library-chart-uid]') ?? [],
    ).find((element) => element.dataset.libraryChartUid === request.uid)
    const target =
      request.target === 'shape'
        ? card?.querySelector<HTMLSelectElement>('.shape-confirmation select')
        : request.target === 'editor'
          ? card?.querySelector<HTMLInputElement>('.chart-editor input')
          : card?.querySelector<HTMLButtonElement>('.chart-sq-main, .chart-card-main')
    if (!target) return

    target.focus()
    pendingFocus.current = null
  }, [editing, paged.page, paged.totalCount, view])

  const changePage = (nextPage: number) => {
    setEditing(null)
    setPage(nextPage)
  }

  const removeChart = (uid: string) => {
    const index = visible.findIndex((chart) => chart.uid === uid)
    const nextChart = visible[index + 1] ?? visible[index - 1]
    pendingFocus.current = nextChart
      ? { uid: nextChart.uid, target: 'primary' }
      : { uid: null, target: 'add' }
    if (editing === uid) setEditing(null)
    props.onRemove(uid)
  }

  const clearCharts = () => {
    pendingFocus.current = { uid: null, target: 'add' }
    setEditing(null)
    setPage(0)
    props.onClearCharts()
  }

  const updateChart = (chart: ChartData) => {
    const nextPool = props.pool.map((candidate) =>
      candidate.uid === chart.uid ? chart : candidate,
    )
    const nextVisible = selectVisibleCharts({
      pool: nextPool,
      query,
      sort,
      weights: props.weights,
      disabledMods: props.disabledMods,
    })
    const nextEditingIndex = nextVisible.findIndex((candidate) => candidate.uid === chart.uid)
    if (nextEditingIndex >= 0) setPage(Math.floor(nextEditingIndex / LIBRARY_PAGE_SIZE))
    props.onUpdate(chart)
  }

  const pageStatus =
    paged.totalCount === 0
      ? 'No charts match the current filter.'
      : `Showing charts ${paged.startIndex + 1}\u2013${paged.endIndex} of ${paged.totalCount}. Page ${paged.page + 1} of ${paged.pageCount}.`

  return (
    <section ref={libraryRef} className="library" aria-labelledby="chart-library-title">
      <div className="panel-title">
        <h2 id="chart-library-title" className="panel-title-heading">
          Chart Library{' '}
          <span className="muted">
            ({query ? `${visible.length}/` : ''}
            {props.pool.length})
          </span>
        </h2>
        <span className="spacer" />
        <button
          ref={addButtonRef}
          type="button"
          onClick={addBlank}
          disabled={props.pool.length >= MAX_POOL_CHARTS}
          title={
            props.pool.length >= MAX_POOL_CHARTS
              ? `Library is full (${MAX_POOL_CHARTS}-chart limit)`
              : 'Add a chart manually'
          }
        >
          + Add chart
        </button>
        {props.pool.length > 0 && (
          <button
            className="clear-charts"
            onClick={clearCharts}
            title="Remove every chart from the library and clear the board (borders and weights are kept)"
          >
            Clear all
          </button>
        )}
      </div>
      {props.pool.length >= MAX_POOL_CHARTS && (
        <div className="muted pad" role="status" aria-live="polite">
          Library is full ({MAX_POOL_CHARTS}-chart limit). Remove a chart to add another.
        </div>
      )}
      {props.pool.length > 0 && (
        <div className="library-tools">
          <input
            aria-label="Filter charts by name or modifier"
            placeholder="Filter by name or mod…"
            value={query}
            onChange={(event) => {
              setEditing(null)
              setPage(0)
              setQuery(event.target.value)
            }}
          />
          <select
            aria-label="Sort charts"
            value={sort}
            onChange={(event) => {
              setEditing(null)
              setPage(0)
              setSort(event.target.value as LibrarySortMode)
            }}
          >
            <option value="value">Best value</option>
            <option value="level">Highest level</option>
            <option value="name">Name</option>
          </select>
          <button
            type="button"
            aria-label={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            title={view === 'grid' ? 'List view (edit charts)' : 'Grid view'}
            onClick={() => setViewPersist(view === 'grid' ? 'list' : 'grid')}
          >
            {view === 'grid' ? '☰' : '⊞'}
          </button>
        </div>
      )}
      {props.pool.length > 0 && props.onOpenSaveWizard && (
        <div className="savefor-bar">
          <button
            onClick={props.onOpenSaveWizard}
            title="Choose how many of each strategy piece the solver should keep in reserve"
          >
            🔖 Save charts for strategies…
          </button>
        </div>
      )}
      {props.pool.length === 0 && (
        <div className="muted pad">No charts yet. Add manually or paste from the game below.</div>
      )}
      {props.pool.length > 0 && (
        <nav className="library-pagination" aria-label="Chart library pages">
          <p
            id={pageStatusId}
            className="library-page-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {pageStatus}
          </p>
          {paged.pageCount > 1 && (
            <div className="library-page-controls">
              <button
                type="button"
                aria-label="Previous chart page"
                disabled={paged.page === 0}
                onClick={() => changePage(paged.page - 1)}
              >
                ← Previous
              </button>
              <label>
                Page{' '}
                <select
                  aria-label="Chart library page"
                  value={paged.page + 1}
                  onChange={(event) => changePage(Number(event.target.value) - 1)}
                >
                  {Array.from({ length: paged.pageCount }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>{' '}
                of {paged.pageCount}
              </label>
              <button
                type="button"
                aria-label="Next chart page"
                disabled={paged.page === paged.pageCount - 1}
                onClick={() => changePage(paged.page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </nav>
      )}
      {view === 'grid' && (
        <ChartGrid
          charts={paged.items}
          pageStartIndex={paged.startIndex}
          totalCount={paged.totalCount}
          pageStatusId={pageStatusId}
          onBoard={onBoard}
          weights={props.weights}
          disabledMods={props.disabledMods}
          bank={bank}
          selected={props.selected}
          onSelect={props.onSelect}
          onConfirmShape={(uid) => {
            pendingFocus.current = { uid, target: 'shape' }
            setViewPersist('list')
            setEditing(uid)
          }}
          onRemove={removeChart}
        />
      )}
      {view === 'list' && (
        <ChartList
          charts={paged.items}
          pageStartIndex={paged.startIndex}
          totalCount={paged.totalCount}
          pageStatusId={pageStatusId}
          onBoard={onBoard}
          selected={props.selected}
          editing={editing}
          bank={bank}
          onSelect={props.onSelect}
          onEdit={setEditing}
          onRemove={removeChart}
          onUpdate={updateChart}
        />
      )}
    </section>
  )
}
