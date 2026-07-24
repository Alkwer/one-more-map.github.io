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
  highlightUid: string | null
  /** only flag connector mismatches as errors under the strict rule */
  strictMode: boolean
  placingChart: ChartData | null
  onCellClick: (i: number) => void
  onRemove: (i: number) => void
  onRotate: (i: number) => void
  onBorderChange: (segment: number, id: string | null) => void
}

function BorderSelect({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
  vertical?: boolean
}) {
  const mod = value ? borderModById.get(value) : null
  const eff = mod?.effects[0]
  return (
    <span className={`bslot ${mod ? 'filled' : ''}`} title={mod?.text ?? 'Border segment — click to set'}>
      {eff ? (
        <>
          <StatIcon stat={eff.stat} size={14} />
          <span>+{eff.percent}%</span>
        </>
      ) : (
        <span className="bslot-empty">—</span>
      )}
      <select
        className="bslot-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Border modifier"
      >
        <option value="">— none —</option>
        {BORDER_MODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.text}
          </option>
        ))}
      </select>
    </span>
  )
}

type EdgeStatus = 'none' | 'connected' | 'open' | 'mismatch'

function Tile({
  placement,
  chart,
  score,
  selected,
  highlighted,
  placing,
  edgeStatus,
  onClick,
  onRemove,
  onRotate,
}: {
  placement: Placement | null
  chart: ChartData | null
  score: number
  selected: boolean
  highlighted: boolean
  placing: boolean
  edgeStatus: EdgeStatus[]
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
  const primary = mods[0]
  return (
    <div
      className={`tile ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''}`}
      onClick={onClick}
      {...tt}
    >
      {(['n', 'e', 's', 'w'] as const).map((d, i) =>
        edges[i] ? <span key={d} className={`path-bar ${d} ${edgeStatus[i]}`} /> : null,
      )}
      {primary &&
        (primary.effects[0] ? (
          <div className="tile-duo">
            <StatIcon stat={primary.effects[0].stat} size={32} />
            <span className="tile-duo-col">
              <span className={`tile-duo-pct scope-${primary.scope}`}>
                +{primary.effects[0].percent}%
              </span>
              <span className="tile-duo-label">{STAT_LABELS[primary.effects[0].stat]}</span>
            </span>
          </div>
        ) : (
          <div className={`tile-duo-text scope-${primary.scope}`}>{primary.text}</div>
        ))}
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
      <span className="tile-lvl">lvl {chart.level}</span>
      <div className="tile-score">{score.toFixed(1)}</div>
    </div>
  )
}

const DIRS = [
  { dr: -1, dc: 0, opp: 2 }, // N
  { dr: 0, dc: 1, opp: 3 }, // E
  { dr: 1, dc: 0, opp: 0 }, // S
  { dr: 0, dc: -1, opp: 1 }, // W
]

export function BoardView(props: Props) {
  const { board, borders, charts } = props

  const edgesAt = (i: number) => {
    const p = board[i]
    if (!p) return null
    const c = charts.get(p.chartUid)
    return c ? rotateEdges(c.edges, p.rotation) : null
  }

  const edgeStatusFor = (i: number): EdgeStatus[] => {
    const e = edgesAt(i)
    if (!e) return ['none', 'none', 'none', 'none']
    const r = Math.floor(i / 3)
    const c = i % 3
    return DIRS.map((d, k) => {
      if (!e[k]) return 'none' as EdgeStatus
      const nr = r + d.dr
      const nc = c + d.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return 'open' as EdgeStatus
      const ne = edgesAt(nr * 3 + nc)
      if (!ne) return 'open' as EdgeStatus
      if (ne[d.opp]) return 'connected' as EdgeStatus
      return (props.strictMode ? 'mismatch' : 'open') as EdgeStatus
    })
  }

  const tile = (i: number) => {
    const p = board[i]
    return (
      <Tile
        key={i}
        placement={p}
        chart={p ? charts.get(p.chartUid) ?? null : null}
        score={props.perTile[i]}
        selected={props.selectedCell === i}
        highlighted={!!p && p.chartUid === props.highlightUid}
        placing={!!props.placingChart && !p}
        edgeStatus={edgeStatusFor(i)}
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
