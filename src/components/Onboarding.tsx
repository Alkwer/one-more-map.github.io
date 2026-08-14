import { useId, useState } from 'react'
import { MAX_POOL_CHARTS } from '../logic/storage'
import { shouldCloseOnboardingAfterDemo, type ChartAdditionResult } from '../logic/chartCapacity'
import { useModalDialog } from './ModalDialog'

interface Props {
  onClose: () => void
  onDemo: () => ChartAdditionResult
  remainingChartCapacity: number
}

const STEPS: { title: string; body: string }[] = [
  {
    title: '1 · Collect Charts',
    body: 'Lost Charts drop from Deepwater encounters while mapping. Run them with Valerie aboard the Sovereign to chart them. This reveals their implicit modifier.',
  },
  {
    title: '2 · Add them here',
    body: 'Ctrl+C a chart in game and paste it into the Import panel, or add charts manually in the library. No charts yet? Hit 🎲 Demo ×25 to explore with a random pool.',
  },
  {
    title: '3 · Set the board',
    body: 'The Voyage is a 3×3 grid starting at the bottom-left ⚓ square. The 12 border segments ("Corruption Currents") buff the squares they touch. Corners get two, the centre none. Enter your current rolls or 🎲 randomise. In game they reroll with Dead Man\'s Sulphur.',
  },
  {
    title: '4 · Weigh your loot',
    body: 'Tell the solver what you value: currency, scarabs, div cards, sulphur… The weights drive everything: chart values in the library, the board score, and the best-charts regex.',
  },
  {
    title: '5 · Solve',
    body: 'Solve ranks high-value arrangements that keep all nine charts reachable from the bottom-left ⚓ start. With up to nine eligible charts and rotation off, exhaustive search proves result #1 optimal within the supported search space. Larger or rotational searches report the best layout found without claiming a global optimum. Click a result to load it, tweak by hand if you like, then Copy in-game search to highlight exactly those charts in your stash.',
  },
]

export function Onboarding({ onClose, onDemo, remainingChartCapacity }: Props) {
  const titleId = useId()
  const [additionMessage, setAdditionMessage] = useState('')
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })
  const libraryFull = remainingChartCapacity <= 0

  const addDemoCharts = () => {
    const result = onDemo()
    if (!shouldCloseOnboardingAfterDemo(result)) {
      setAdditionMessage(
        result.added > 0
          ? `Added ${result.added} demo chart${result.added === 1 ? '' : 's'}; skipped ${result.skipped} because the ${MAX_POOL_CHARTS}-chart library limit was reached.`
          : `No demo charts were added because the library is full (${MAX_POOL_CHARTS}-chart limit).`,
      )
      return
    }
    onClose()
  }

  return (
    <div className="onboard-backdrop" data-modal-root onClick={onClose}>
      <div {...dialogProps} className="onboard" onClick={(event) => event.stopPropagation()}>
        <h2 id={titleId} className="panel-title" data-dialog-initial-focus tabIndex={-1}>
          Plan your Voyage
        </h2>
        <p className="onboard-intro">
          Build a high-value 3×3 Voyage from your charted Charts, solved automatically around
          connector shapes, adjacency, and border rolls.
        </p>
        {STEPS.map((s) => (
          <div key={s.title} className="onboard-step">
            <h3 className="onboard-step-title">{s.title}</h3>
            <div className="onboard-step-body">{s.body}</div>
          </div>
        ))}
        <div className="onboard-scopes">
          Modifier colours:&nbsp;
          <span className="scope-self">■ chart's own area</span>&nbsp;·&nbsp;
          <span className="scope-adjacent">■ adjacent areas</span>&nbsp;·&nbsp;
          <span className="scope-global">■ whole voyage</span>
        </div>
        <div className="onboard-actions">
          <button
            className="primary"
            onClick={addDemoCharts}
            disabled={libraryFull}
            title={libraryFull ? `Library is full (${MAX_POOL_CHARTS}-chart limit)` : undefined}
          >
            Try it with 25 demo charts
          </button>
          <button onClick={onClose}>Start planning</button>
        </div>
        {(libraryFull || additionMessage) && (
          <div className="muted pad" role="status" aria-live="polite">
            {additionMessage ||
              `The library is full (${MAX_POOL_CHARTS}-chart limit). Remove a chart before adding demo charts.`}
          </div>
        )}
      </div>
    </div>
  )
}
