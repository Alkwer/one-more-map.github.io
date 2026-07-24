import { useState } from 'react'
import { VOYAGE_MODS, voyageModById } from '../data/mods'
import { newUid } from '../logic/parser'
import type { Board, ChartData, Edges } from '../types'

interface Props {
  pool: ChartData[]
  board: Board
  selected: string | null
  onSelect: (uid: string) => void
  onAdd: (charts: ChartData[]) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
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

  return (
    <div className="library">
      <div className="panel-title">
        Chart Library <span className="muted">({props.pool.length})</span>
        <span className="spacer" />
        <button onClick={addBlank}>+ Add chart</button>
      </div>
      {props.pool.length === 0 && (
        <div className="muted pad">
          No charts yet — add manually or paste from the game below.
        </div>
      )}
      <div className="chart-list">
        {props.pool.map((c) => {
          const mod = c.modIds[0] ? voyageModById.get(c.modIds[0]) : null
          return (
            <div
              key={c.uid}
              className={`chart-card ${props.selected === c.uid ? 'selected' : ''} ${onBoard.has(c.uid) ? 'on-board' : ''}`}
              onClick={() => props.onSelect(c.uid)}
            >
              <div className="chart-card-head">
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
              {mod && <div className={`chart-mod scope-${mod.scope}`}>{mod.text}</div>}
              {editing === c.uid && <ChartEditor chart={c} onUpdate={props.onUpdate} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
