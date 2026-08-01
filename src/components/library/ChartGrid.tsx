import { voyageModById } from '../../data/mods'
import { isChartShapeResolved } from '../../logic/chartShapes'
import { displayChartValue } from '../../logic/chartRanking'
import type { ChartData, Weights } from '../../types'
import { STAT_LABELS, STAT_SHORT } from '../../types'
import { EdgeGlyph } from '../icons'
import { tooltipProps } from '../Tooltip'

interface Props {
  charts: ChartData[]
  onBoard: ReadonlySet<string>
  weights: Weights
  disabledMods: ReadonlySet<string>
  selected: string | null
  onSelect: (uid: string) => void
  onConfirmShape: (uid: string) => void
  onRemove: (uid: string) => void
}

export function ChartGrid(props: Props) {
  return (
    <div className="chart-grid" role="group" aria-label="Charts">
      {props.charts.map((chart) => {
        const unresolvedShape = !isChartShapeResolved(chart)
        const modifiers = chart.modIds.map((id) => voyageModById.get(id)).filter(Boolean)
        // Lead with the implicit (adjacent/voyage) because it is the strategic modifier.
        const modifier =
          modifiers.find((candidate) => candidate!.scope !== 'self') ?? modifiers[0] ?? null
        const value = displayChartValue(chart, props.weights, props.disabledMods)
        const lines = [
          ...(unresolvedShape
            ? [
                {
                  text: `Shape confirmation required${chart.shapeInput ? `: ${chart.shapeInput}` : ''}`,
                  cls: 'bad',
                },
              ]
            : []),
          {
            text: `Area Level: ${chart.level}${chart.shape ? ` · ${chart.shape}` : ''}`,
            cls: 'muted',
          },
          ...(chart.rewards ?? []).map((effect) => ({
            text: `+${effect.percent}% ${STAT_LABELS[effect.stat]}`,
            cls: 'scope-self',
          })),
          ...modifiers.map((candidate) => ({
            text: candidate!.text,
            cls: `scope-${candidate!.scope}`,
          })),
          { text: `Weighted value: ${value}`, cls: 'val' },
          ...(props.onBoard.has(chart.uid)
            ? [{ text: 'Currently on the board', cls: 'muted' }]
            : []),
        ]
        const activate = () => {
          if (unresolvedShape) {
            props.onConfirmShape(chart.uid)
            return
          }
          props.onSelect(chart.uid)
        }

        return (
          <div
            key={chart.uid}
            className={`chart-sq ${unresolvedShape ? 'unresolved-shape' : ''} ${props.selected === chart.uid ? 'selected' : ''} ${props.onBoard.has(chart.uid) ? 'on-board' : ''} ${modifier ? `sscope-${modifier.scope}` : ''}`}
          >
            <button
              type="button"
              className="chart-sq-main"
              aria-label={
                unresolvedShape
                  ? `Confirm shape for ${chart.name}`
                  : `Select ${chart.name} for placement`
              }
              aria-pressed={!unresolvedShape && props.selected === chart.uid}
              onClick={activate}
              {...tooltipProps({ title: chart.name, lines })}
            >
              {unresolvedShape ? (
                <span className="sq-shape-warning">Confirm shape</span>
              ) : modifier?.short ? (
                <span className={`sq-reward-text scope-${modifier.scope}`}>
                  <span className="sq-shortname">{modifier.short}</span>
                </span>
              ) : modifier?.effects[0] ? (
                <span className={`sq-reward-text scope-${modifier.scope}`}>
                  <span className="sq-pct">+{modifier.effects[0].percent}%</span>
                  <span className="sq-statname">{STAT_SHORT[modifier.effects[0].stat]}</span>
                </span>
              ) : chart.implicitText ? (
                <span className="sq-reward-text scope-global">
                  <span className="sq-shortname sq-rawimplicit">{chart.implicitText}</span>
                </span>
              ) : (
                <EdgeGlyph edges={chart.edges} size={26} />
              )}
              {modifier && !unresolvedShape && (
                <span className="sq-shape">
                  <EdgeGlyph edges={chart.edges} size={15} />
                </span>
              )}
              <span className="sq-val">{value}</span>
              <span className="sq-lvl">L:{chart.level}</span>
            </button>
            <button
              type="button"
              className="sq-del"
              aria-label={`Delete ${chart.name}`}
              title="Delete"
              onClick={() => props.onRemove(chart.uid)}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
