import { BORDER_MODS } from '../data/mods'
import type { Board, Borders, ChartData } from '../types'
import { START_CELL } from '../types'
import { BoardCell } from './board/BoardCell'
import { BorderPicker } from './board/BorderPicker'
import { edgeStatusForCell } from './board/boardEdges'

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
  onTogglePreserve: (uid: string) => void
  onFinishVoyage: () => void
  onCopySequence: () => void
  voyageMsg: string
  /** a copy/preserve step-through is active - hide the action buttons to avoid confusion */
  sequenceActive?: boolean
}

export function BoardView(props: Props) {
  const { board, borders, charts } = props

  const tile = (cell: number) => {
    const placement = board[cell]
    return (
      <BoardCell
        key={cell}
        cellIndex={cell}
        placement={placement}
        chart={placement ? (charts.get(placement.chartUid) ?? null) : null}
        score={props.perTile[cell]}
        selected={props.selectedCell === cell}
        highlighted={!!placement && placement.chartUid === props.highlightUid}
        placing={!!props.placingChart && !placement}
        isStart={cell === START_CELL}
        edgeStatus={edgeStatusForCell(board, charts, cell, props.strictMode)}
        onClick={() => props.onCellClick(cell)}
        onRemove={() => props.onRemove(cell)}
        onRotate={() => props.onRotate(cell)}
        onTogglePreserve={() => placement && props.onTogglePreserve(placement.chartUid)}
      />
    )
  }
  const border = (segment: number, vertical?: boolean) => (
    <BorderPicker
      key={`b${segment}`}
      value={borders[segment]}
      segment={segment}
      vertical={vertical}
      onChange={(id) => props.onBorderChange(segment, id)}
    />
  )

  const randomize = () => {
    for (let segment = 0; segment < 12; segment++) {
      const mod = BORDER_MODS[Math.floor(Math.random() * BORDER_MODS.length)]
      props.onBorderChange(segment, mod.id)
    }
  }
  const clearBorders = () => {
    for (let segment = 0; segment < 12; segment++) props.onBorderChange(segment, null)
  }

  return (
    <section className="board-wrap" aria-labelledby="voyage-board-title">
      <div className="board-toolbar">
        <h2 id="voyage-board-title" className="board-title">
          Voyage Board
        </h2>
        <span className="spacer" />
        <button onClick={randomize} title="Simulate a border reroll">
          🎲 Random borders
        </button>
        <button onClick={clearBorders}>Clear borders</button>
      </div>
      <div className="board-scroll">
        <div
          className="board-grid"
          role="group"
          aria-label="Three by three Voyage board with twelve border modifier controls"
          aria-describedby="board-instructions"
        >
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
      </div>
      <div id="board-instructions" className="board-hint">
        Corners get 2 border mods, edges 1, center 0. Select a library chart then activate a cell to
        place; activate two placed cells to swap.
      </div>
      <div className="legend">
        <span className="legend-item scope-self">■ this area</span>
        <span className="legend-item scope-adjacent">■ adjacent</span>
        <span className="legend-item scope-global">■ whole voyage</span>
      </div>
      {!props.sequenceActive && (
        <div className="voyage-finish">
          <button
            className="copy-into-game"
            disabled={board.every((placement) => !placement)}
            onClick={props.onCopySequence}
            title="Step through each square in the in-game placement order (bottom-left first), copying its chart so you can Ctrl+Left-click them in the right order."
          >
            📋 Copy into game
          </button>
          <button
            className="finish-voyage"
            disabled={board.every((placement) => !placement)}
            onClick={props.onFinishVoyage}
            title="Consume the charts on the board (they're used up), keeping any you've marked Preserved (🔒). Clears the board for the next voyage."
          >
            🌊 Finish Voyage
          </button>
          {props.voyageMsg && (
            <span className="voyage-msg" role="status" aria-live="polite">
              {props.voyageMsg}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
