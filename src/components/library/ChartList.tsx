import { voyageModById } from '../../data/mods'
import { isChartShapeResolved } from '../../logic/chartShapes'
import type { ChartData } from '../../types'
import { EdgeGlyph } from '../icons'
import { tooltipProps } from '../Tooltip'
import { ChartEditor } from './ChartEditor'

interface Props {
  charts: ChartData[]
  onBoard: ReadonlySet<string>
  selected: string | null
  editing: string | null
  onSelect: (uid: string) => void
  onEdit: (uid: string | null) => void
  onRemove: (uid: string) => void
  onUpdate: (chart: ChartData) => void
}

export function ChartList(props: Props) {
  return (
    <div className="chart-list" role="group" aria-label="Charts">
      {props.charts.map((chart) => {
        const unresolvedShape = !isChartShapeResolved(chart)
        const modifiers = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
        const modifier =
          modifiers.find((candidate) => candidate!.scope !== 'self') ?? modifiers[0] ?? null
        const activate = () => {
          if (unresolvedShape) {
            props.onEdit(chart.uid)
            return
          }
          props.onSelect(chart.uid)
        }

        return (
          <div
            key={chart.uid}
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
            >
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
                {props.onBoard.has(chart.uid) && <span className="badge">on board</span>}
              </span>
              {modifier && (
                <span
                  className={`chart-mod scope-${modifier.scope}`}
                  {...tooltipProps({
                    title: chart.name,
                    lines: [
                      { text: `Area Level: ${chart.level}`, cls: 'muted' },
                      ...modifiers.map((candidate) => ({
                        text: candidate!.text,
                        cls: `scope-${candidate!.scope}`,
                      })),
                    ],
                  })}
                >
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
