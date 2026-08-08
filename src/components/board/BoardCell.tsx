import { useState } from 'react'
import { voyageModById } from '../../data/mods'
import { rotateEdges } from '../../logic/connectivity'
import { buildSingleChartSearch } from '../../logic/regex'
import { writeClipboardText } from '../../logic/clipboard'
import type { ChartData, Placement } from '../../types'
import { STAT_LABELS, STAT_SHORT } from '../../types'
import { tooltipProps } from '../Tooltip'
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
    <span className="tile-start" title="The Voyage begins here">
      ⚓ Start
    </span>
  ) : null
  if (!placement || !chart) {
    return (
      <div className={`tile empty ${placing ? 'placing' : ''}`}>
        <button
          type="button"
          className="tile-select"
          aria-label={`${position}: empty`}
          aria-pressed={selected}
          onClick={onClick}
        >
          {startBadge}
          {placing && <span className="tile-empty-label">place here</span>}
        </button>
      </div>
    )
  }
  const edges = rotateEdges(chart.edges, placement.rotation)
  const mods = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
  const scopeLabel = { self: 'this Area', adjacent: 'adjacent Areas', global: 'the whole Voyage' }
  const tooltip = tooltipProps({
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
    ],
  })
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
        aria-label={tileLabel}
        aria-pressed={selected}
        data-chart-name={chart.name}
        onClick={onClick}
        {...tooltip}
      >
        {(['n', 'e', 's', 'w'] as const).map((direction, edge) =>
          edges[edge] ? (
            <span key={direction} className={`path-bar ${direction} ${edgeStatus[edge]}`} />
          ) : null,
        )}
        {primary &&
          (primary.short ? (
            <div className="tile-duo">
              <span className="tile-duo-col">
                <span className={`tile-duo-pct scope-${primary.scope}`}>{primary.short}</span>
                <span className="tile-duo-label">
                  {primary.scope === 'self'
                    ? 'this area'
                    : primary.scope === 'adjacent'
                      ? 'adjacent areas'
                      : 'whole voyage'}
                </span>
              </span>
            </div>
          ) : primary.effects[0] ? (
            <div className="tile-duo">
              <span className="tile-duo-col">
                <span className={`tile-duo-pct scope-${primary.scope}`}>
                  +{primary.effects[0].percent}% {STAT_SHORT[primary.effects[0].stat]}
                </span>
                <span className="tile-duo-label">
                  {primary.scope === 'self'
                    ? 'this area'
                    : primary.scope === 'adjacent'
                      ? 'adjacent areas'
                      : 'whole voyage'}
                </span>
              </span>
            </div>
          ) : (
            <div className={`tile-duo-text scope-${primary.scope}`}>{primary.text}</div>
          ))}
        {!primary && chart.implicitText && (
          <div className="tile-duo-text scope-global">{chart.implicitText}</div>
        )}
        {chart.preserved && (
          <span className="tile-preserved-badge" title="Preserved: kept when you Finish Voyage">
            🔒 Kept
          </span>
        )}
        {startBadge}
        <span className="tile-lvl">lvl {chart.level}</span>
        <span className="tile-score">{score.toFixed(1)}</span>
      </button>
      <div className="tile-actions" role="group" aria-label={`Actions for ${chart.name}`}>
        <button
          type="button"
          className={chart.preserved ? 'active' : ''}
          aria-label={
            chart.preserved
              ? `Stop preserving ${chart.name} in row ${row}, column ${column}`
              : `Preserve ${chart.name} in row ${row}, column ${column}`
          }
          aria-pressed={!!chart.preserved}
          title={
            chart.preserved
              ? 'Preserved: unmark to allow consuming'
              : 'Preserve: keep this chart when you Finish Voyage'
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
            copied ? `Search copied for ${chart.name}` : `Copy in-game search for ${chart.name}`
          }
          title="Copy an in-game search string (name + modifier) to find this exact chart"
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
          aria-label={`Rotate ${chart.name} in row ${row}, column ${column}; current rotation ${rotationDegrees} degrees`}
          title="Rotate"
          onClick={(event) => {
            event.stopPropagation()
            onRotate()
          }}
        >
          ⟳
        </button>
        <button
          type="button"
          aria-label={`Remove ${chart.name} from row ${row}, column ${column}`}
          title="Remove"
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
            {copyFailure.detail}
            {copyFailure.manualText && ' Select the search text and copy it manually.'}
          </span>
          {copyFailure.manualText && (
            <input
              aria-label={`Manual in-game search for ${chart.name}`}
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
