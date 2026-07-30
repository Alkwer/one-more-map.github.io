interface Props {
  onClose: () => void
  onDemo: () => void
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
    body: 'Solve finds the highest-value arrangement that keeps all nine charts reachable from the bottom-left ⚓ start. Click a result to load it, tweak by hand if you like, then Copy in-game search to highlight exactly those charts in your stash.',
  },
]

export function Onboarding({ onClose, onDemo }: Props) {
  return (
    <div className="onboard-backdrop" onClick={onClose}>
      <div className="onboard" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Plan your Voyage</div>
        <p className="onboard-intro">
          Build the most valuable 3×3 Voyage from your charted Charts, solved automatically
          around connector shapes, adjacency, and border rolls.
        </p>
        {STEPS.map((s) => (
          <div key={s.title} className="onboard-step">
            <div className="onboard-step-title">{s.title}</div>
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
            onClick={() => {
              onDemo()
              onClose()
            }}
          >
            Try it with 25 demo charts
          </button>
          <button onClick={onClose}>Start planning</button>
        </div>
      </div>
    </div>
  )
}
