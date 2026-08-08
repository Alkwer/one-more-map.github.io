import { voyageModById } from '../../data/mods'
import {
  currentCopyEntry,
  type CopySequenceState,
  type CopySequenceWriteResult,
} from '../../state/copySequence'
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
  failure: Extract<CopySequenceWriteResult, { ok: false }> | null
  pending: boolean
  onAdvance: () => void | Promise<void>
  onManualAdvance: () => void
  onCancel: () => void
}

export function CopySequencePrompt(props: CopySequenceProps) {
  const entry = currentCopyEntry(props.sequence)
  const chart = props.chartMap.get(entry.chartUid)
  const stillPlaced = props.board.some((placement) => placement?.chartUid === entry.chartUid)

  return (
    <div className="preserve-confirm copyseq">
      <div className="pc-head">
        Place into game in the original bottom-left-first order. Copy pastes an in-game search
        string; Ctrl+Left-click the chart it finds. Step {props.sequence.step + 1} of{' '}
        {props.sequence.order.length}.
      </div>
      {!stillPlaced && chart && (
        <div className="pc-sub" role="status">
          The board changed. Continuing the original chart sequence; its square is no longer
          highlighted.
        </div>
      )}
      {chart && (
        <>
          <div className="pc-name">{chart.name}</div>
          <div className="pc-sub">
            {chartImplicit(chart)}
            {chart.shape ? ` · Shape: ${chart.shape}` : ''}
          </div>
        </>
      )}
      {!chart && (
        <div className="pc-sub" role="alert">
          This chart is no longer in the library. The sequence will stop so you can review the board
          and start again.
        </div>
      )}
      {props.failure && (
        <div className="copyseq-manual" role="alert">
          <strong>Nothing was copied, so this chart has not advanced.</strong>
          <div className="pc-sub">{props.failure.detail}</div>
          {props.failure.manualText && (
            <>
              <label>
                Manual copy search
                <input
                  readOnly
                  value={props.failure.manualText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button onClick={props.onManualAdvance}>I copied it manually — next</button>
            </>
          )}
        </div>
      )}
      <div className="copyseq-actions">
        <button
          className="copyseq-go"
          disabled={props.pending || props.failure?.reason === 'invalid'}
          onClick={props.onAdvance}
        >
          {props.pending
            ? 'Copying…'
            : props.failure?.reason === 'invalid'
              ? 'Search exceeds in-game limit'
              : props.failure
                ? '📋 Retry clipboard copy'
                : props.sequence.step + 1 >= props.sequence.order.length
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
