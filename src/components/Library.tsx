import { useMemo, useState } from 'react'
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

  return (
    <section className="library" aria-labelledby="chart-library-title">
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
            onClick={props.onClearCharts}
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
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Sort charts"
            value={sort}
            onChange={(event) => setSort(event.target.value as LibrarySortMode)}
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
      {view === 'grid' && (
        <ChartGrid
          charts={visible}
          onBoard={onBoard}
          weights={props.weights}
          disabledMods={props.disabledMods}
          bank={bank}
          selected={props.selected}
          onSelect={props.onSelect}
          onConfirmShape={(uid) => {
            setViewPersist('list')
            setEditing(uid)
          }}
          onRemove={props.onRemove}
        />
      )}
      {view === 'list' && (
        <ChartList
          charts={visible}
          onBoard={onBoard}
          selected={props.selected}
          editing={editing}
          bank={bank}
          onSelect={props.onSelect}
          onEdit={setEditing}
          onRemove={props.onRemove}
          onUpdate={props.onUpdate}
        />
      )}
    </section>
  )
}
