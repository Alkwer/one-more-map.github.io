import { useMemo, useState } from 'react'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import {
  CHART_SHAPES,
  chartShapeForEdges,
  edgesForChartShape,
  isChartShapeResolved,
} from '../logic/chartShapes'
import { chartValue, displayChartValue } from '../logic/chartRanking'
import { newUid } from '../logic/parser'
import type { Board, ChartData, Edges, Weights } from '../types'
import { STAT_LABELS, STAT_SHORT } from '../types'
import { EdgeGlyph } from './icons'
import { tooltipProps } from './Tooltip'

interface Props {
  pool: ChartData[]
  board: Board
  weights: Weights
  disabledMods: Set<string>
  selected: string | null
  onSelect: (uid: string) => void
  onAdd: (charts: ChartData[]) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
  onClearCharts: () => void
}

type SortMode = 'value' | 'level' | 'name'
type ViewMode = 'grid' | 'list'

const EDGE_LABELS = ['N', 'E', 'S', 'W'] as const

function ChartEditor({ chart, onUpdate }: { chart: ChartData; onUpdate: (c: ChartData) => void }) {
  const toggleEdge = (i: number) => {
    const edges = [...chart.edges] as Edges
    edges[i] = !edges[i]
    const shape = chartShapeForEdges(edges)
    onUpdate({
      ...chart,
      edges,
      shape,
      shapeResolved: !!shape,
      shapeInput: shape ? undefined : chart.shapeInput,
    })
  }
  const shapeResolved = isChartShapeResolved(chart)
  const selectedShape = shapeResolved ? (chartShapeForEdges(chart.edges) ?? chart.shape ?? '') : ''
  return (
    <div className="chart-editor" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <input
          aria-label="Chart name"
          value={chart.name}
          onChange={(e) => onUpdate({ ...chart, name: e.target.value })}
          placeholder="Chart name"
        />
        <input
          type="number"
          className="lvl"
          aria-label="Chart area level"
          value={chart.level}
          min={1}
          max={100}
          onChange={(e) => onUpdate({ ...chart, level: parseInt(e.target.value || '1', 10) })}
        />
      </div>
      {(() => {
        const isSelf = (id: string) => voyageModById.get(id)?.scope === 'self'
        const selfIds = chart.modIds.filter(isSelf)
        const implicitId = chart.modIds.find((id) => !isSelf(id)) ?? ''
        const commit = (s0: string, s1: string, imp: string) =>
          onUpdate({ ...chart, modIds: [s0, s1, imp].filter(Boolean) })
        const selfPool = VOYAGE_MODS.filter((m) => m.scope === 'self')
        return (
          <>
            {[0, 1].map((slot) => (
              <select
                key={slot}
                aria-label={`Area modifier ${slot + 1}`}
                value={selfIds[slot] ?? ''}
                onChange={(e) => {
                  const next = [selfIds[0] ?? '', selfIds[1] ?? '']
                  next[slot] = e.target.value
                  commit(next[0], next[1], implicitId)
                }}
              >
                <option value="">area mod {slot + 1}: none</option>
                {selfPool.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.text}
                  </option>
                ))}
              </select>
            ))}
            <select
              aria-label="Implicit modifier"
              value={implicitId}
              onChange={(e) => commit(selfIds[0] ?? '', selfIds[1] ?? '', e.target.value)}
            >
              <option value="">implicit: none</option>
              <optgroup label="Adjacent">
                {VOYAGE_MODS.filter((m) => m.scope === 'adjacent').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.text}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Voyage-wide">
                {VOYAGE_MODS.filter((m) => m.scope === 'global').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.text}
                  </option>
                ))}
              </optgroup>
            </select>
          </>
        )
      })()}
      <div className={`shape-confirmation ${shapeResolved ? '' : 'unresolved'}`}>
        {!shapeResolved && (
          <div className="shape-warning">
            Shape confirmation required
            {chart.shapeInput ? ` · imported as "${chart.shapeInput}"` : ' · shape was missing'}
          </div>
        )}
        <label>
          Chart shape
          <select
            value={selectedShape}
            onChange={(e) => {
              const shape = e.target.value as ChartData['shape']
              if (!shape) return
              onUpdate({
                ...chart,
                shape,
                edges: edgesForChartShape(shape),
                shapeResolved: true,
                shapeInput: undefined,
              })
            }}
          >
            <option value="" disabled>
              Choose shape…
            </option>
            {CHART_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row edges-row">
        <span className="muted">Connectors:</span>
        {EDGE_LABELS.map((l, i) => (
          <button
            type="button"
            key={l}
            className={`edge-btn ${chart.edges[i] ? 'on' : ''}`}
            aria-label={`${l} connector`}
            aria-pressed={chart.edges[i]}
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
      shape: 'Crossing',
      shapeResolved: true,
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
      return (
        chartValue(b, props.weights, props.disabledMods) -
        chartValue(a, props.weights, props.disabledMods)
      )
    })
  }, [props.pool, props.weights, props.disabledMods, query, sort])

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
        <button type="button" onClick={addBlank}>
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
      {props.pool.length > 0 && (
        <div className="library-tools">
          <input
            aria-label="Filter charts by name or modifier"
            placeholder="Filter by name or mod…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Sort charts"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
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
      {props.pool.length === 0 && (
        <div className="muted pad">No charts yet. Add manually or paste from the game below.</div>
      )}
      {view === 'grid' && (
        <div className="chart-grid" role="group" aria-label="Charts">
          {visible.map((c) => {
            const unresolvedShape = !isChartShapeResolved(c)
            const mods = c.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
            // lead with the implicit (adjacent/voyage) - it's the strategic mod
            const mod = mods.find((m) => m!.scope !== 'self') ?? mods[0] ?? null
            const val = displayChartValue(c, props.weights, props.disabledMods)
            const lines = [
              ...(unresolvedShape
                ? [
                    {
                      text: `Shape confirmation required${c.shapeInput ? `: ${c.shapeInput}` : ''}`,
                      cls: 'bad',
                    },
                  ]
                : []),
              { text: `Area Level: ${c.level}${c.shape ? ` · ${c.shape}` : ''}`, cls: 'muted' },
              ...(c.rewards ?? []).map((e) => ({
                text: `+${e.percent}% ${STAT_LABELS[e.stat]}`,
                cls: 'scope-self',
              })),
              ...mods.map((m) => ({ text: m!.text, cls: `scope-${m!.scope}` })),
              { text: `Weighted value: ${val}`, cls: 'val' },
              ...(onBoard.has(c.uid) ? [{ text: 'Currently on the board', cls: 'muted' }] : []),
            ]
            const activate = () => {
              if (unresolvedShape) {
                setViewPersist('list')
                setEditing(c.uid)
                return
              }
              props.onSelect(c.uid)
            }
            return (
              <div
                key={c.uid}
                className={`chart-sq ${unresolvedShape ? 'unresolved-shape' : ''} ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''} ${mod ? `sscope-${mod.scope}` : ''}`}
              >
                <button
                  type="button"
                  className="chart-sq-main"
                  aria-label={
                    unresolvedShape
                      ? `Confirm shape for ${c.name}`
                      : `Select ${c.name} for placement`
                  }
                  aria-pressed={!unresolvedShape && props.selected === c.uid}
                  onClick={activate}
                  {...tooltipProps({ title: c.name, lines })}
                >
                  {unresolvedShape ? (
                    <span className="sq-shape-warning">Confirm shape</span>
                  ) : mod?.short ? (
                    <span className={`sq-reward-text scope-${mod.scope}`}>
                      <span className="sq-shortname">{mod.short}</span>
                    </span>
                  ) : mod?.effects[0] ? (
                    <span className={`sq-reward-text scope-${mod.scope}`}>
                      <span className="sq-pct">+{mod.effects[0].percent}%</span>
                      <span className="sq-statname">{STAT_SHORT[mod.effects[0].stat]}</span>
                    </span>
                  ) : c.implicitText ? (
                    <span className="sq-reward-text scope-global">
                      <span className="sq-shortname sq-rawimplicit">{c.implicitText}</span>
                    </span>
                  ) : (
                    <EdgeGlyph edges={c.edges} size={26} />
                  )}
                  {mod && !unresolvedShape && (
                    <span className="sq-shape">
                      <EdgeGlyph edges={c.edges} size={15} />
                    </span>
                  )}
                  <span className="sq-val">{val}</span>
                  <span className="sq-lvl">L:{c.level}</span>
                </button>
                <button
                  type="button"
                  className="sq-del"
                  aria-label={`Delete ${c.name}`}
                  title="Delete"
                  onClick={() => props.onRemove(c.uid)}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
      {view === 'list' && (
        <div className="chart-list" role="group" aria-label="Charts">
          {visible.map((c) => {
            const unresolvedShape = !isChartShapeResolved(c)
            const allMods = c.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
            const mod = allMods.find((m) => m!.scope !== 'self') ?? allMods[0] ?? null
            const activate = () => {
              if (unresolvedShape) {
                setEditing(c.uid)
                return
              }
              props.onSelect(c.uid)
            }
            return (
              <div
                key={c.uid}
                className={`chart-card ${unresolvedShape ? 'unresolved-shape' : ''} ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''}`}
              >
                <button
                  type="button"
                  className="chart-card-main"
                  aria-label={
                    unresolvedShape
                      ? `Confirm shape for ${c.name}`
                      : `Select ${c.name} for placement`
                  }
                  aria-pressed={!unresolvedShape && props.selected === c.uid}
                  onClick={activate}
                >
                  <span className="chart-card-head">
                    {unresolvedShape ? (
                      <span className="shape-alert" aria-label="Shape confirmation required">
                        !
                      </span>
                    ) : (
                      <EdgeGlyph edges={c.edges} />
                    )}
                    <span className="chart-name">{c.name}</span>
                    <span className="chart-level">lvl {c.level}</span>
                    {unresolvedShape && <span className="badge bad">needs shape</span>}
                    {onBoard.has(c.uid) && <span className="badge">on board</span>}
                  </span>
                  {mod && (
                    <span
                      className={`chart-mod scope-${mod.scope}`}
                      {...tooltipProps({
                        title: c.name,
                        lines: [
                          { text: `Area Level: ${c.level}`, cls: 'muted' },
                          ...allMods.map((m) => ({ text: m!.text, cls: `scope-${m!.scope}` })),
                        ],
                      })}
                    >
                      {allMods.map((m) => (
                        <span key={m!.id} className={`chart-mod-line scope-${m!.scope}`}>
                          {m!.text}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                <div
                  className="chart-card-actions"
                  role="group"
                  aria-label={`Actions for ${c.name}`}
                >
                  <button
                    type="button"
                    aria-label={`${editing === c.uid ? 'Close editor for' : 'Edit'} ${c.name}`}
                    title="Edit"
                    aria-expanded={editing === c.uid}
                    onClick={() => setEditing(editing === c.uid ? null : c.uid)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${c.name}`}
                    title="Delete"
                    onClick={() => props.onRemove(c.uid)}
                  >
                    ✕
                  </button>
                </div>
                {editing === c.uid && <ChartEditor chart={c} onUpdate={props.onUpdate} />}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
