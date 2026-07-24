import { BORDER_MODS, borderModById, voyageModById } from '../data/mods'
import { rotateEdges } from '../logic/connectivity'
import type { Board, Borders, ChartData, Placement } from '../types'
import { ALL_STATS, STAT_LABELS } from '../types'
import { StatIcon } from './icons'
import { tooltipProps } from './Tooltip'

interface Props {
  board: Board
  borders: Borders
  charts: Map<string, ChartData>
  perTile: number[]
  selectedCell: number | null
  placingChart: ChartData | null
  onCellClick: (i: number) => void
  onRemove: (i: number) => void
  onRotate: (i: number) => void
  onBorderChange: (segment: number, id: string | null) => void
}

function BorderSelect({
  value,
  onChange,
  vertical,
}: {
  value: string | null
  onChange: (id: string | null) => void
  vertical?: boolean
}) {
  const mod = value ? borderModById.get(value) : null
  return (
    <select
      className={`border-slot ${vertical ? 'vertical' : ''} ${mod ? 'filled' : ''}`}
      value={value ?? ''}
      title={mod?.text ?? 'Empty border segment'}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">— border —</option>
      {BORDER_MODS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.text}
        </option>
      ))}
    </select>
  )
}

function Tile({
  placement,
  chart,
  score,
  selected,
  placing,
  onClick,
  onRemove,
  onRotate,
}: {
  placement: Placement | null
  chart: ChartData | null
  score: number
  selected: boolean
  placing: boolean
  onClick: () => void
  onRemove: () => void
  onRotate: () => void
}) {
  if (!placement || !chart) {
    return (
      <div className={`tile empty ${placing ? 'placing' : ''}`} onClick={onClick}>
        {placing ? 'place here' : ''}
      </div>
    )
  }
  const edges = rotateEdges(chart.edges, placement.rotation)
  const mods = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
  const scopeLabel = { self: 'this Area', adjacent: 'adjacent Areas', global: 'the whole Voyage' }
  const tt = tooltipProps({
    title: chart.name,
    lines: [
      { text: `Area Level: ${chart.level}`, cls: 'muted' },
      ...mods.map((m) => ({ text: m!.text, cls: `scope-${m!.scope}` })),
      ...mods.map((m) => ({ text: `(affects ${scopeLabel[m!.scope]})`, cls: 'muted' })),
    ],
  })
  return (
    <div className={`tile ${selected ? 'selected' : ''}`} onClick={onClick} {...tt}>
      {(['n', 'e', 's', 'w'] as const).map((d, i) =>
        edges[i] ? <span key={d} className={`conn conn-${d}`} /> : null,
      )}
      <div className="tile-actions">
        <button
          title="Rotate"
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
        >
          ⟳
        </button>
        <button
          title="Remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ✕
        </button>
      </div>
      <div className="tile-name">{chart.name}</div>
      <div className="tile-level">lvl {chart.level}</div>
      <div className="tile-mods">
        {mods.map((m) => (
          <span key={m!.id} className={`mod-chip scope-${m!.scope}`}>
            {m!.effects[0] && <StatIcon stat={m!.effects[0].stat} size={20} />}
            <span>+{m!.effects[0]?.percent ?? '?'}%</span>
          </span>
        ))}
      </div>
      <div className="tile-score">{score.toFixed(1)}</div>
    </div>
  )
}

export function BoardView(props: Props) {
  const { board, borders, charts } = props

  const tile = (i: number) => {
    const p = board[i]
    return (
      <Tile
        key={i}
        placement={p}
        chart={p ? charts.get(p.chartUid) ?? null : null}
        score={props.perTile[i]}
        selected={props.selectedCell === i}
        placing={!!props.placingChart && !p}
        onClick={() => props.onCellClick(i)}
        onRemove={() => props.onRemove(i)}
        onRotate={() => props.onRotate(i)}
      />
    )
  }
  const border = (seg: number, vertical?: boolean) => (
    <BorderSelect
      key={`b${seg}`}
      value={borders[seg]}
      vertical={vertical}
      onChange={(id) => props.onBorderChange(seg, id)}
    />
  )

  const randomize = () => {
    for (let seg = 0; seg < 12; seg++) {
      const m = BORDER_MODS[Math.floor(Math.random() * BORDER_MODS.length)]
      props.onBorderChange(seg, m.id)
    }
  }
  const clearBorders = () => {
    for (let seg = 0; seg < 12; seg++) props.onBorderChange(seg, null)
  }

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <span className="board-title">Voyage Board</span>
        <span className="spacer" />
        <button onClick={randomize} title="Simulate a border reroll">
          🎲 Random borders
        </button>
        <button onClick={clearBorders}>Clear borders</button>
      </div>
      <div className="board-grid">
        <div className="corner" />
        {border(0)}
        {border(1)}
        {border(2)}
        <div className="corner" />

        {border(9, true)}
        {tile(0)}
        {tile(1)}
        {tile(2)}
        {border(3, true)}

        {border(10, true)}
        {tile(3)}
        {tile(4)}
        {tile(5)}
        {border(4, true)}

        {border(11, true)}
        {tile(6)}
        {tile(7)}
        {tile(8)}
        {border(5, true)}

        <div className="corner" />
        {border(6)}
        {border(7)}
        {border(8)}
        <div className="corner" />
      </div>
      <div className="board-hint">
        Corners get 2 border mods, edges 1, center 0. Click a library chart then a cell to
        place; click two placed cells to swap.
      </div>
      <div className="legend">
        {ALL_STATS.map((s) => (
          <span key={s} className="legend-item" title={STAT_LABELS[s]}>
            <StatIcon stat={s} />
            <span>{STAT_LABELS[s]}</span>
          </span>
        ))}
        <span className="legend-sep" />
        <span className="legend-item scope-self">■ this area</span>
        <span className="legend-item scope-adjacent">■ adjacent</span>
        <span className="legend-item scope-global">■ whole voyage</span>
      </div>
    </div>
  )
}
