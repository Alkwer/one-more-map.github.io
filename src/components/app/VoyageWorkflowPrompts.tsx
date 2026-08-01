import { voyageModById } from '../../data/mods'
import { currentCopyCell, type CopySequenceState } from '../../state/copySequence'
import type { Board, ChartData } from '../../types'
import type { PreserveConfirmation } from '../../hooks/useVoyageWorkflows'

const chartImplicit = (chart: ChartData): string =>
  chart.implicitText ??
  chart.modIds.map((id) => voyageModById.get(id)).find((modifier) => modifier?.scope !== 'self')
    ?.text ??
  ''

interface CopySequenceProps {
  sequence: CopySequenceState
  board: Board
  chartMap: Map<string, ChartData>
  onAdvance: () => void
  onCancel: () => void
}

export function CopySequencePrompt(props: CopySequenceProps) {
  const chart = props.chartMap.get(props.board[currentCopyCell(props.sequence)]!.chartUid)

  return (
    <div className="preserve-confirm copyseq">
      <div className="pc-head">
        Place into game in this order (its square is glowing). Copy pastes an in-game search string;
        Ctrl+Left-click the chart it finds. They fill bottom-left first. Step{' '}
        {props.sequence.step + 1} of {props.sequence.order.length}.
      </div>
      {chart && (
        <>
          <div className="pc-name">{chart.name}</div>
          <div className="pc-sub">
            {chartImplicit(chart)}
            {chart.shape ? ` · Shape: ${chart.shape}` : ''}
          </div>
        </>
      )}
      <div className="copyseq-actions">
        <button className="copyseq-go" onClick={props.onAdvance}>
          {props.sequence.step + 1 >= props.sequence.order.length
            ? '📋 Copy last & finish'
            : '📋 Copy & next'}
          <span className="copyseq-hint">or press Ctrl+C</span>
        </button>
        <button className="pc-lost" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

interface PreserveConfirmationProps {
  confirmation: PreserveConfirmation
  onDecide: (survived: boolean) => void
}

export function PreserveConfirmationPrompt({ confirmation, onDecide }: PreserveConfirmationProps) {
  return (
    <div className="preserve-confirm">
      <div className="pc-head">
        Preserved chart {confirmation.index + 1} of {confirmation.charts.length} (its square is
        glowing). Did it actually survive the Voyage?
      </div>
      <div className="pc-name">{confirmation.charts[confirmation.index].name}</div>
      <div className="pc-actions">
        <button className="pc-kept" onClick={() => onDecide(true)}>
          ✓ Kept it
        </button>
        <button className="pc-lost" onClick={() => onDecide(false)}>
          ✕ Was consumed
        </button>
      </div>
    </div>
  )
}
