import { VOYAGE_MODS, voyageModById } from '../../data/mods'
import {
  CHART_SHAPES,
  chartShapeForEdges,
  edgesForChartShape,
  isChartShapeResolved,
} from '../../logic/chartShapes'
import { MAX_CHART_NAME_LENGTH } from '../../logic/storage'
import type { ChartData, Edges } from '../../types'
import { STAT_LABELS } from '../../types'
import { updateImportedReward } from './chartEditorRewards'

interface Props {
  chart: ChartData
  onUpdate: (chart: ChartData) => void
}

const EDGE_LABELS = ['N', 'E', 'S', 'W'] as const

export function ChartEditor({ chart, onUpdate }: Props) {
  const toggleEdge = (index: number) => {
    const edges = [...chart.edges] as Edges
    edges[index] = !edges[index]
    const shape = chartShapeForEdges(edges)
    onUpdate({
      ...chart,
      edges,
      shape,
      shapeResolved: !!shape,
      shapeInput: shape ? undefined : chart.shapeInput,
    })
  }
  const shapeResolved = isChartShapeResolved(chart)
  const selectedShape = shapeResolved ? (chartShapeForEdges(chart.edges) ?? chart.shape ?? '') : ''
  const isSelf = (id: string) => voyageModById.get(id)?.scope === 'self'
  const selfIds = chart.modIds.filter(isSelf)
  const implicitId = chart.modIds.find((id) => !isSelf(id)) ?? ''
  const commitMods = (self0: string, self1: string, implicit: string) =>
    onUpdate({ ...chart, modIds: [self0, self1, implicit].filter(Boolean) })
  const selfPool = VOYAGE_MODS.filter((modifier) => modifier.scope === 'self')

  return (
    <div className="chart-editor" onClick={(event) => event.stopPropagation()}>
      <div className="row">
        <input
          aria-label="Chart name"
          value={chart.name}
          maxLength={MAX_CHART_NAME_LENGTH}
          onChange={(event) => onUpdate({ ...chart, name: event.target.value })}
          placeholder="Chart name"
        />
        <input
          type="number"
          className="lvl"
          aria-label="Chart area level"
          value={chart.level}
          min={1}
          max={100}
          onChange={(event) =>
            onUpdate({ ...chart, level: parseInt(event.target.value || '1', 10) })
          }
        />
      </div>
      {chart.rewards?.length ? (
        <fieldset className="imported-reward-editor">
          <legend>Imported area rewards</legend>
          <p className="muted">
            Header values used directly by ranking and the solver. Editing a value overrides the
            imported amount.
          </p>
          <div className="imported-reward-grid">
            {chart.rewards.map((reward, index) => (
              <label key={`${reward.stat}-${index}`}>
                <span>{STAT_LABELS[reward.stat]}</span>
                <span className="reward-percent-input">
                  <input
                    type="number"
                    aria-label={`Imported ${STAT_LABELS[reward.stat]} reward`}
                    value={reward.percent}
                    onChange={(event) =>
                      onUpdate(
                        updateImportedReward(chart, index, Number(event.target.value || '0')),
                      )
                    }
                  />
                  %
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <fieldset className="manual-mod-editor">
          <legend>Manual area modifiers</legend>
          <p className="muted">Inferred values used when no imported header rewards exist.</p>
          <div className="manual-mod-grid">
            {[0, 1].map((slot) => (
              <select
                key={slot}
                aria-label={`Area modifier ${slot + 1}`}
                value={selfIds[slot] ?? ''}
                onChange={(event) => {
                  const next = [selfIds[0] ?? '', selfIds[1] ?? '']
                  next[slot] = event.target.value
                  commitMods(next[0], next[1], implicitId)
                }}
              >
                <option value="">area mod {slot + 1}: none</option>
                {selfPool.map((modifier) => (
                  <option key={modifier.id} value={modifier.id}>
                    {modifier.text}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </fieldset>
      )}
      <select
        aria-label="Implicit modifier"
        value={implicitId}
        onChange={(event) => commitMods(selfIds[0] ?? '', selfIds[1] ?? '', event.target.value)}
      >
        <option value="">implicit: none</option>
        <optgroup label="Adjacent">
          {VOYAGE_MODS.filter((modifier) => modifier.scope === 'adjacent').map((modifier) => (
            <option key={modifier.id} value={modifier.id}>
              {modifier.text}
            </option>
          ))}
        </optgroup>
        <optgroup label="Voyage-wide">
          {VOYAGE_MODS.filter((modifier) => modifier.scope === 'global').map((modifier) => (
            <option key={modifier.id} value={modifier.id}>
              {modifier.text}
            </option>
          ))}
        </optgroup>
      </select>
      <div className={`shape-confirmation ${shapeResolved ? '' : 'unresolved'}`}>
        {!shapeResolved && (
          <div className="shape-warning">
            Shape confirmation required
            {chart.shapeInput ? ` · imported as "${chart.shapeInput}"` : ' · shape was missing'}
          </div>
        )}
        <label>
          Chart shape
          <select
            value={selectedShape}
            onChange={(event) => {
              const shape = event.target.value as ChartData['shape']
              if (!shape) return
              onUpdate({
                ...chart,
                shape,
                edges: edgesForChartShape(shape),
                shapeResolved: true,
                shapeInput: undefined,
              })
            }}
          >
            <option value="" disabled>
              Choose shape…
            </option>
            {CHART_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row edges-row">
        <span className="muted">Connectors:</span>
        {EDGE_LABELS.map((label, index) => (
          <button
            type="button"
            key={label}
            className={`edge-btn ${chart.edges[index] ? 'on' : ''}`}
            aria-label={`${label} connector`}
            aria-pressed={chart.edges[index]}
            onClick={() => toggleEdge(index)}
          >
            {label}
          </button>
        ))}
      </div>
      {chart.rawText && (
        <div className="raw-text" title="Unrecognised mod lines kept from import">
          {chart.rawText}
        </div>
      )}
    </div>
  )
}
