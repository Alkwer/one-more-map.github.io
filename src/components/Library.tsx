import { useMemo, useState } from 'react'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import { newUid } from '../logic/parser'
import type { Board, ChartData, Edges, Weights } from '../types'
import { EdgeGlyph, StatIcon } from './icons'
import { tooltipProps } from './Tooltip'

interface Props {
  pool: ChartData[]
  board: Board
  weights: Weights
  selected: string | null
  onSelect: (uid: string) => void
  onAdd: (charts: ChartData[]) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
}

const SCOPE_REACH = { self: 1, adjacent: 3, global: 9 } as const

/** heuristic worth of a chart under the current weights, for sorting */
function chartValue(chart: ChartData, weights: Weights): number {
  let v = 0
  for (const id of chart.modIds) {
    const mod = voyageModById.get(id)
    if (!mod) continue
    for (const e of mod.effects) v += (weights[e.stat] ?? 0) * e.percent * SCOPE_REACH[mod.scope]
  }
  return v
}

type SortMode = 'value' | 'level' | 'name'
type ViewMode = 'grid' | 'list'

/** compact display value: weighted worth scaled to a friendly 0–99ish number */
export function displayValue(chart: ChartData, weights: Weights): number {
  return Math.round(chartValue(chart, weights) / 100)
}

const EDGE_LABELS = ['N', 'E', 'S', 'W'] as const

function ChartEditor({ chart, onUpdate }: { chart: ChartData; onUpdate: (c: ChartData) => void }) {
  const toggleEdge = (i: number) => {
    const edges = [...chart.edges] as Edges
    edges[i] = !edges[i]
    onUpdate({ ...chart, edges })
  }
  return (
    <div className="chart-editor" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <input
          value={chart.name}
          onChange={(e) => onUpdate({ ...chart, name: e.target.value })}
          placeholder="Chart name"
        />
        <input
          type="number"
          className="lvl"
          value={chart.level}
          min={1}
          max={100}
          onChange={(e) => onUpdate({ ...chart, level: parseInt(e.target.value || '1', 10) })}
        />
      </div>
      <select
        value={chart.modIds[0] ?? ''}
        onChange={(e) => onUpdate({ ...chart, modIds: e.target.value ? [e.target.value] : [] })}
      >
        <option value="">— voyage modifier —</option>
        {VOYAGE_MODS.map((m) => (
          <option key={m.id} value={m.id}>
            [{m.scope}] {m.text}
          </option>
        ))}
      </select>
      <div className="row edges-row">
        <span className="muted">Connectors:</span>
        {EDGE_LABELS.map((l, i) => (
          <button
            key={l}
            className={`edge-btn ${chart.edges[i] ? 'on' : ''}`}
            onClick={() => toggleEdge(i)}
          >
            {l}
          </button>
        ))}
      </div>
      {chart.rawText && (
        <div className="raw-text" title="Unrecognised mod lines kept from import">
          {chart.rawText}
        </div>
      )}
    </div>
  )
}

export function Library(props: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('value')
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('library-view') as ViewMode) || 'grid',
  )
  const setViewPersist = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem('library-view', v)
    } catch {
      /* ignore */
    }
  }
  const onBoard = new Set(props.board.filter(Boolean).map((p) => p!.chartUid))

  const addBlank = () => {
    const chart: ChartData = {
      uid: newUid(),
      name: `Chart ${props.pool.length + 1}`,
      level: 80,
      edges: [true, true, true, true],
      modIds: [],
    }
    props.onAdd([chart])
    setEditing(chart.uid)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = props.pool
    if (q) {
      list = list.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true
        return c.modIds.some((id) => voyageModById.get(id)?.text.toLowerCase().includes(q))
      })
    }
    return [...list].sort((a, b) => {
      if (sort === 'level') return b.level - a.level
      if (sort === 'name') return a.name.localeCompare(b.name)
      return chartValue(b, props.weights) - chartValue(a, props.weights)
    })
  }, [props.pool, props.weights, query, sort])

  return (
    <div className="library">
      <div className="panel-title">
        Chart Library{' '}
        <span className="muted">
          ({query ? `${visible.length}/` : ''}
          {props.pool.length})
        </span>
        <span className="spacer" />
        <button onClick={addBlank}>+ Add chart</button>
      </div>
      {props.pool.length > 0 && (
        <div className="library-tools">
          <input
            placeholder="Filter by name or mod…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="value">Best value</option>
            <option value="level">Highest level</option>
            <option value="name">Name</option>
          </select>
          <button
            title={view === 'grid' ? 'List view (edit charts)' : 'Grid view'}
            onClick={() => setViewPersist(view === 'grid' ? 'list' : 'grid')}
          >
            {view === 'grid' ? '☰' : '⊞'}
          </button>
        </div>
      )}
      {props.pool.length === 0 && (
        <div className="muted pad">
          No charts yet — add manually or paste from the game below.
        </div>
      )}
      {view === 'grid' && (
        <div className="chart-grid">
          {visible.map((c) => {
            const mod = c.modIds[0] ? voyageModById.get(c.modIds[0]) : null
            const val = displayValue(c, props.weights)
            const lines = [
              { text: `Area Level: ${c.level}`, cls: 'muted' },
              ...(mod ? [{ text: mod.text, cls: `scope-${mod.scope}` }] : []),
              { text: `Weighted value: ${val}`, cls: 'val' },
              ...(onBoard.has(c.uid) ? [{ text: 'Currently on the board', cls: 'muted' }] : []),
            ]
            return (
              <div
                key={c.uid}
                className={`chart-sq ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''}`}
                onClick={() => props.onSelect(c.uid)}
                {...tooltipProps({ title: c.name, lines })}
              >
                <EdgeGlyph edges={c.edges} size={26} />
                <span className="sq-val">{val}</span>
                <span className="sq-lvl">L:{c.level}</span>
                <button
                  className="sq-del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRemove(c.uid)
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
      {view === 'list' && (
      <div className="chart-list">
        {visible.map((c) => {
          const mod = c.modIds[0] ? voyageModById.get(c.modIds[0]) : null
          return (
            <div
              key={c.uid}
              className={`chart-card ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''}`}
              onClick={() => props.onSelect(c.uid)}
            >
              <div className="chart-card-head">
                <EdgeGlyph edges={c.edges} />
                <span className="chart-name">{c.name}</span>
                <span className="chart-level">lvl {c.level}</span>
                {onBoard.has(c.uid) && <span className="badge">on board</span>}
                <span className="spacer" />
                <button
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(editing === c.uid ? null : c.uid)
                  }}
                >
                  ✎
                </button>
                <button
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRemove(c.uid)
                  }}
                >
                  ✕
                </button>
              </div>
              {mod && (
                <div
                  className={`chart-mod scope-${mod.scope}`}
                  {...tooltipProps({
                    title: c.name,
                    lines: [
                      { text: `Area Level: ${c.level}`, cls: 'muted' },
                      { text: mod.text, cls: `scope-${mod.scope}` },
                    ],
                  })}
                >
                  {mod.effects[0] && <StatIcon stat={mod.effects[0].stat} />} {mod.text}
                </div>
              )}
              {editing === c.uid && <ChartEditor chart={c} onUpdate={props.onUpdate} />}
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
