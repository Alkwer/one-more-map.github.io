import { voyageModById } from '../../data/mods'
import { isChartShapeResolved } from '../../logic/chartShapes'
import type { PieceType } from '../../logic/pieceKeeps'
import type { ChartData } from '../../types'
import { EdgeGlyph } from '../icons'
import { TooltipDescription, tooltipProps } from '../Tooltip'
import { ChartEditor } from './ChartEditor'

interface Props {
  charts: ChartData[]
  pageStartIndex: number
  totalCount: number
  pageStatusId: string
  onBoard: ReadonlySet<string>
  selected: string | null
  editing: string | null
  bank: ReadonlyMap<string, PieceType>
  onSelect: (uid: string) => void
  onEdit: (uid: string | null) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
}

export function ChartList(props: Props) {
  return (
    <div
      className="chart-list"
      role="list"
      aria-label="Charts"
      aria-describedby={props.pageStatusId}
    >
      {props.charts.map((chart, index) => {
        const unresolvedShape = !isChartShapeResolved(chart)
        const modifiers = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
        const modifier =
          modifiers.find((candidate) => candidate!.scope !== 'self') ?? modifiers[0] ?? null
        const bankedPiece = props.bank.get(chart.uid)
        const lock = bankedPiece
          ? `Saved for ${bankedPiece.strategyName} - ${bankedPiece.label}`
          : null
        const activate = () => {
          if (unresolvedShape) {
            props.onEdit(chart.uid)
            return
          }
          props.onSelect(chart.uid)
        }
        const tooltip = {
          title: chart.name,
          lines: [
            {
              text: `Area Level: ${chart.level}${chart.shape ? ` · ${chart.shape}` : ''}`,
              cls: 'muted',
            },
            ...(chart.rewards ?? []).map((effect) => ({
              text: `+${effect.percent}% ${effect.stat}`,
              cls: 'scope-self',
            })),
            ...modifiers.map((candidate) => ({
              text: candidate!.text,
              cls: `scope-${candidate!.scope}`,
            })),
            ...(lock ? [{ text: `🔒 ${lock} - other solves won't spend it`, cls: 'muted' }] : []),
          ],
        }
        const descriptionId = `chart-list-details-${chart.uid}`

        return (
          <div
            key={chart.uid}
            role="listitem"
            aria-posinset={props.pageStartIndex + index + 1}
            aria-setsize={props.totalCount}
            data-library-chart-uid={chart.uid}
            className={`chart-card ${unresolvedShape ? 'unresolved-shape' : ''} ${props.selected === chart.uid ? 'selected' : ''} ${props.onBoard.has(chart.uid) ? 'on-board' : ''}`}
          >
            <button
              type="button"
              className="chart-card-main"
              aria-label={
                unresolvedShape
                  ? `Confirm shape for ${chart.name}`
                  : `Select ${chart.name} for placement`
              }
              aria-pressed={!unresolvedShape && props.selected === chart.uid}
              onClick={activate}
              {...tooltipProps(tooltip, descriptionId)}
            >
              <TooltipDescription id={descriptionId} data={tooltip} />
              <span className="chart-card-head">
                {unresolvedShape ? (
                  <span className="shape-alert" aria-label="Shape confirmation required">
                    !
                  </span>
                ) : (
                  <EdgeGlyph edges={chart.edges} />
                )}
                <span className="chart-name">{chart.name}</span>
                <span className="chart-level">lvl {chart.level}</span>
                {unresolvedShape && <span className="badge bad">needs shape</span>}
                {lock && (
                  <span className="badge lock" title={`${lock} - other solves won't spend it`}>
                    🔒
                  </span>
                )}
                {props.onBoard.has(chart.uid) && <span className="badge">on board</span>}
              </span>
              {modifier && (
                <span className={`chart-mod scope-${modifier.scope}`}>
                  {modifiers.map((candidate) => (
                    <span
                      key={candidate!.id}
                      className={`chart-mod-line scope-${candidate!.scope}`}
                    >
                      {candidate!.text}
                    </span>
                  ))}
                </span>
              )}
            </button>
            <div
              className="chart-card-actions"
              role="group"
              aria-label={`Actions for ${chart.name}`}
            >
              <button
                type="button"
                aria-label={`${props.editing === chart.uid ? 'Close editor for' : 'Edit'} ${chart.name}`}
                title="Edit"
                aria-expanded={props.editing === chart.uid}
                onClick={() => props.onEdit(props.editing === chart.uid ? null : chart.uid)}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label={`Delete ${chart.name}`}
                title="Delete"
                onClick={() => props.onRemove(chart.uid)}
              >
                ✕
              </button>
            </div>
            {props.editing === chart.uid && <ChartEditor chart={chart} onUpdate={props.onUpdate} />}
          </div>
        )
      })}
    </div>
  )
}
