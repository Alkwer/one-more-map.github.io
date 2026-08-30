import { formatDecimal, formatNumber, t, ui } from '../../i18n/locale'
import { useState } from 'react'
import { voyageModById } from '../../data/mods'
import { rotateEdges } from '../../logic/connectivity'
import { buildSingleChartSearch } from '../../logic/regex'
import { writeClipboardText } from '../../logic/clipboard'
import type { ChartData, Placement } from '../../types'
import { STAT_LABELS, STAT_SHORT } from '../../types'
import { TooltipDescription, tooltipProps } from '../Tooltip'
import type { EdgeStatus } from './boardEdges'

interface BoardCellProps {
  cellIndex: number
  placement: Placement | null
  chart: ChartData | null
  score: number
  selected: boolean
  highlighted: boolean
  placing: boolean
  isStart: boolean
  edgeStatus: EdgeStatus[]
  onClick: () => void
  onRemove: () => void
  onRotate: () => void
  onTogglePreserve: () => void
}

export function BoardCell({
  cellIndex,
  placement,
  chart,
  score,
  selected,
  highlighted,
  placing,
  isStart,
  edgeStatus,
  onClick,
  onRemove,
  onRotate,
  onTogglePreserve,
}: BoardCellProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailure, setCopyFailure] = useState<{
    detail: string
    manualText: string | null
  } | null>(null)
  const row = Math.floor(cellIndex / 3) + 1
  const column = (cellIndex % 3) + 1
  const position = `Board cell ${cellIndex + 1}, row ${row}, column ${column}${isStart ? ', start' : ''}`
  const startBadge = isStart ? (
    <span className="tile-start" title={t('The Voyage begins here')}>
      {t('⚓ Start')}
    </span>
  ) : null
  if (!placement || !chart) {
    return (
      <div className={`tile empty ${placing ? 'placing' : ''}`}>
        <button
          type="button"
          className="tile-select"
          aria-label={t('{v0}: empty', { v0: position })}
          aria-pressed={selected}
          onClick={onClick}
        >
          {startBadge}
          {placing && <span className="tile-empty-label">{t('place here')}</span>}
        </button>
      </div>
    )
  }
  const edges = rotateEdges(chart.edges, placement.rotation)
  const mods = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
  const scopeLabel = { self: 'this Area', adjacent: 'adjacent Areas', global: 'the whole Voyage' }
  const tooltipData = {
    title: chart.name,
    lines: [
      { text: `Area Level: ${chart.level}${chart.shape ? ` · ${chart.shape}` : ''}`, cls: 'muted' },
      ...(chart.rewards ?? []).map((effect) => ({
        text: `+${effect.percent}% ${STAT_LABELS[effect.stat]}`,
        cls: 'scope-self',
      })),
      ...mods.map((mod) => ({
        text: `${mod!.text}  (${scopeLabel[mod!.scope]})`,
        cls: `scope-${mod!.scope}`,
      })),
      { text: `Weighted value: ${formatDecimal(score, 1)}`, cls: 'val' },
      ...(chart.preserved
        ? [{ text: '🔒 Preserved - Finish Voyage will not consume it', cls: 'muted' }]
        : []),
    ],
  }
  const descriptionId = `board-chart-details-${cellIndex}`
  // show the implicit (adjacent/voyage) on the tile - it's the strategic mod
  const primary = mods.find((mod) => mod!.scope !== 'self') ?? mods[0]
  const rotationDegrees = placement.rotation * 90
  const tileLabel = `${position}: ${chart.name}; occupied; rotation ${rotationDegrees} degrees; ${chart.preserved ? 'preserved' : 'not preserved'}`
  return (
    <div
      className={`tile ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''} ${chart.preserved ? 'preserved' : ''} ${primary ? `tscope-${primary.scope}` : ''}`}
    >
      <button
        type="button"
        className="tile-select"
        aria-label={ui(tileLabel)}
        aria-pressed={selected}
        data-chart-name={chart.name}
        onClick={onClick}
        {...tooltipProps(tooltipData, descriptionId)}
      >
        <TooltipDescription id={descriptionId} data={tooltipData} />
        {(['n', 'e', 's', 'w'] as const).map((direction, edge) =>
          edges[edge] ? (
            <span key={direction} className={`path-bar ${direction} ${edgeStatus[edge]}`} />
          ) : null,
        )}
        {primary &&
          (primary.short ? (
            <div className="tile-duo">
              <span className="tile-duo-col">
                <span className={`tile-duo-pct scope-${primary.scope}`}>{ui(primary.short)}</span>
                <span className="tile-duo-label">
                  {primary.scope === 'self'
                    ? t('this area')
                    : primary.scope === 'adjacent'
                      ? t('adjacent areas')
                      : t('whole voyage')}
                </span>
              </span>
            </div>
          ) : primary.effects[0] ? (
            <div className="tile-duo">
              <span className="tile-duo-col">
                <span className={`tile-duo-pct scope-${primary.scope}`}>
                  +{formatNumber(primary.effects[0].percent)}%{' '}
                  {ui(STAT_SHORT[primary.effects[0].stat])}
                </span>
                <span className="tile-duo-label">
                  {primary.scope === 'self'
                    ? t('this area')
                    : primary.scope === 'adjacent'
                      ? t('adjacent areas')
                      : t('whole voyage')}
                </span>
              </span>
            </div>
          ) : (
            <div className={`tile-duo-text scope-${primary.scope}`}>{ui(primary.text)}</div>
          ))}
        {!primary && chart.implicitText && (
          <div className="tile-duo-text scope-global">{chart.implicitText}</div>
        )}
        {chart.preserved && (
          <span
            className="tile-preserved-badge"
            title={t('Preserved: kept when you Finish Voyage')}
          >
            {t('🔒 Kept')}
          </span>
        )}
        {startBadge}
        <span className="tile-lvl">
          {t('lvl ')}
          {formatNumber(chart.level)}
        </span>
        <span className="tile-score">{ui(formatDecimal(score, 1))}</span>
      </button>
      <div
        className="tile-actions"
        role="group"
        aria-label={t('Actions for {v0}', { v0: chart.name })}
      >
        <button
          type="button"
          className="tile-inspect"
          aria-label={t('Inspect details for {v0}', { v0: chart.name })}
          title={t('Inspect chart details')}
          {...tooltipProps(tooltipData, descriptionId, true)}
        >
          ⓘ
        </button>
        <button
          type="button"
          className={chart.preserved ? 'active' : ''}
          aria-label={
            chart.preserved
              ? t('Stop preserving {v0} in row {v1}, column {v2}', {
                  v0: chart.name,
                  v1: row,
                  v2: column,
                })
              : t('Preserve {v0} in row {v1}, column {v2}', { v0: chart.name, v1: row, v2: column })
          }
          aria-pressed={!!chart.preserved}
          title={
            chart.preserved
              ? t('Preserved: unmark to allow consuming')
              : t('Preserve: keep this chart when you Finish Voyage')
          }
          onClick={(event) => {
            event.stopPropagation()
            onTogglePreserve()
          }}
        >
          {chart.preserved ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          aria-label={
            copied
              ? t('Search copied for {v0}', { v0: chart.name })
              : t('Copy in-game search for {v0}', { v0: chart.name })
          }
          title={t('Copy an in-game search string (name + modifier) to find this exact chart')}
          onClick={async (event) => {
            event.stopPropagation()
            const search = buildSingleChartSearch(chart)
            if (!search.ok) {
              setCopied(false)
              setCopyFailure({ detail: search.message, manualText: null })
              return
            }
            const result = await writeClipboardText(search.regex)
            if (!result.ok) {
              setCopied(false)
              setCopyFailure(result)
              return
            }
            setCopyFailure(null)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? '✓' : '⧉'}
        </button>
        <button
          type="button"
          aria-label={t('Rotate {v0} in row {v1}, column {v2}; current rotation {v3} degrees', {
            v0: chart.name,
            v1: row,
            v2: column,
            v3: rotationDegrees,
          })}
          title={t('Rotate')}
          onClick={(event) => {
            event.stopPropagation()
            onRotate()
          }}
        >
          ⟳
        </button>
        <button
          type="button"
          aria-label={t('Remove {v0} from row {v1}, column {v2}', {
            v0: chart.name,
            v1: row,
            v2: column,
          })}
          title={t('Remove')}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          ✕
        </button>
      </div>
      {copyFailure && (
        <div className="tile-copy-fallback">
          <span role="status" aria-live="polite">
            {ui(copyFailure.detail)}
            {copyFailure.manualText && t(' Select the search text and copy it manually.')}
          </span>
          {copyFailure.manualText && (
            <input
              aria-label={t('Manual in-game search for {v0}', { v0: chart.name })}
              readOnly
              value={copyFailure.manualText}
              onFocus={(event) => event.target.select()}
            />
          )}
        </div>
      )}
    </div>
  )
}
