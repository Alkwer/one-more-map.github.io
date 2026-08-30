import { formatNumber, t, ui } from '../../i18n/locale'
import { voyageModById } from '../../data/mods'
import {
  currentCopyEntry,
  type CopySequenceState,
  type CopySequenceWriteResult,
} from '../../state/copySequence'
import type { Board, ChartData } from '../../types'
import type { PreserveConfirmation } from '../../hooks/useVoyageWorkflows'
import type { FinishVoyageConfirmation } from '../../hooks/useVoyageWorkflows'

const boardCellLabel = (cell: number): string =>
  `row ${Math.floor(cell / 3) + 1}, column ${(cell % 3) + 1}`

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
        {t(
          'Place into game in the original bottom-left-first order. Copy pastes an in-game search string; Ctrl+Left-click the chart it finds. Step ',
        )}
        {formatNumber(props.sequence.step + 1)}
        {t(' of')} {formatNumber(props.sequence.order.length)}.
      </div>
      {!stillPlaced && chart && (
        <div className="pc-sub" role="status">
          {t(
            'The board changed. Continuing the original chart sequence; its square is no longer highlighted.',
          )}
        </div>
      )}
      {chart && (
        <>
          <div className="pc-name">{chart.name}</div>
          <div className="pc-sub">
            {ui(chartImplicit(chart))}
            {chart.shape ? t(' · Shape: {v0}', { v0: chart.shape }) : ''}
          </div>
        </>
      )}
      {!chart && (
        <div className="pc-sub" role="alert">
          {t(
            'This chart is no longer in the library. The sequence will stop so you can review the board and start again.',
          )}
        </div>
      )}
      {props.failure && (
        <div className="copyseq-manual" role="alert">
          <strong>{t('Nothing was copied, so this chart has not advanced.')}</strong>
          <div className="pc-sub">{ui(props.failure.detail)}</div>
          {props.failure.manualText && (
            <>
              <label>
                {t('Manual copy search')}
                <input
                  readOnly
                  value={props.failure.manualText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button onClick={props.onManualAdvance}>{t('I copied it manually — next')}</button>
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
            ? t('Copying…')
            : props.failure?.reason === 'invalid'
              ? t('Search exceeds in-game limit')
              : props.failure
                ? t('📋 Retry clipboard copy')
                : props.sequence.step + 1 >= props.sequence.order.length
                  ? t('📋 Copy last & finish')
                  : t('📋 Copy & next')}
          <span className="copyseq-hint">{t('or press Ctrl+C')}</span>
        </button>
        <button className="pc-lost" onClick={props.onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  )
}

interface FinishVoyageConfirmationProps {
  confirmation: FinishVoyageConfirmation
  onConfirm: () => void
  onCancel: () => void
}

export function FinishVoyageConfirmationPrompt({
  confirmation,
  onConfirm,
  onCancel,
}: FinishVoyageConfirmationProps) {
  const chartLabel = `chart${confirmation.consumeCount === 1 ? '' : 's'}`
  return (
    <div className="preserve-confirm">
      <div
        className="pc-head"
        id="finish-voyage-confirmation-title"
        data-dialog-initial-focus
        tabIndex={-1}
      >
        {t('Finish Voyage and consume ')}
        {formatNumber(confirmation.consumeCount)} {ui(chartLabel)}?
      </div>
      <div className="pc-sub">
        {t('This permanently removes the ')}
        {ui(chartLabel)}
        {t(' currently placed on the board from your saved library.')}
      </div>
      <div className="pc-actions">
        <button className="pc-lost" onClick={onConfirm}>
          {t('Finish and consume ')}
          {formatNumber(confirmation.consumeCount)}
        </button>
        <button className="pc-kept" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  )
}

interface ChartDeletionConfirmationPromptProps {
  chartName: string
  boardCells: number[]
  onConfirm: () => void
  onCancel: () => void
}

export function ChartDeletionConfirmationPrompt({
  chartName,
  boardCells,
  onConfirm,
  onCancel,
}: ChartDeletionConfirmationPromptProps) {
  const placementNotice =
    boardCells.length === 0
      ? 'It is not currently placed on the board.'
      : boardCells.length === 1
        ? `It is currently placed at ${boardCellLabel(boardCells[0])}; that board cell will also be cleared.`
        : `It is currently placed at ${boardCells.map(boardCellLabel).join(', ')}; those board cells will also be cleared.`

  return (
    <div className="preserve-confirm">
      <div className="pc-head" id="chart-deletion-confirmation-title">
        {t('Delete ')}
        {chartName}?
      </div>
      <div className="pc-sub">
        {t('This permanently removes the chart from your saved library. ')}
        {ui(placementNotice)}
      </div>
      <div className="pc-actions">
        <button className="pc-kept" data-dialog-initial-focus onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button className="pc-lost" onClick={onConfirm}>
          {t('Delete chart')}
        </button>
      </div>
    </div>
  )
}

interface PreserveConfirmationProps {
  confirmation: PreserveConfirmation
  onDecide: (survived: boolean) => void
  onCancel: () => void
}

export function PreserveConfirmationPrompt({
  confirmation,
  onDecide,
  onCancel,
}: PreserveConfirmationProps) {
  return (
    <div className="preserve-confirm">
      <div
        className="pc-head"
        id="preserve-confirmation-title"
        data-dialog-initial-focus
        tabIndex={-1}
      >
        {t('Preserved chart ')}
        {formatNumber(confirmation.index + 1)}
        {t(' of ')}
        {formatNumber(confirmation.charts.length)}
        {t(' (its square is glowing). Did it actually survive the Voyage?')}
      </div>
      <div className="pc-name">{confirmation.charts[confirmation.index].name}</div>
      <div className="pc-actions">
        <button className="pc-kept" onClick={() => onDecide(true)}>
          {t('✓ Kept it')}
        </button>
        <button className="pc-lost" onClick={() => onDecide(false)}>
          {t('✕ Was consumed')}
        </button>
        <button className="pc-lost" onClick={onCancel}>
          {t('Cancel Finish')}
        </button>
      </div>
    </div>
  )
}
