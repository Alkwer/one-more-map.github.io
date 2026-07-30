import type { VoyageDecision } from '../logic/voyageDecision'

interface Props {
  decision: VoyageDecision
  onChangeRerolls: (value: number) => void
  onSelectStrategy: (id: string) => void
}

const sulphur = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('en-US')

const toneFor = (decision: VoyageDecision) => {
  if (decision.kind === 'play' || decision.kind === 'switch') return 'keep'
  if (decision.kind === 'reroll') return 'reroll'
  if (decision.kind === 'stop') return 'stop'
  return 'needs-data'
}

const contextLabelFor = (decision: VoyageDecision) => {
  if (decision.kind === 'stop') return 'Best runnable context'
  if (decision.kind === 'reroll') return 'Best ready context'
  if (decision.kind === 'play' || decision.kind === 'switch') {
    return 'Recommended strategy'
  }
  if (decision.kind === 'wait') return 'Strategy being preserved'
  return 'Evaluated context'
}

export function VoyageAdvisor({
  decision,
  onChangeRerolls,
  onSelectStrategy,
}: Props) {
  const fitPercent =
    decision.fit === null ? null : Math.round(decision.fit * 100)
  const linePercent = Math.round(decision.decisionFitLine * 100)
  const action = decision.action

  return (
    <section
      className={`voyage-advisor ${toneFor(decision)}`}
      aria-labelledby="voyage-advisor-title"
    >
      <div className="voyage-advisor-grid">
        <div className="voyage-decision">
          <div id="voyage-advisor-title" className="panel-title">
            Voyage Recommendation
          </div>
          <div className="voyage-decision-label">{decision.label}</div>
          <div className="voyage-decision-reason">{decision.reason}</div>
          {action && (
            <button
              className="voyage-primary-action"
              onClick={() => onSelectStrategy(action.strategyId)}
            >
              {action.label}
            </button>
          )}
        </div>

        <div className="voyage-context">
          <span>{contextLabelFor(decision)}</span>
          <strong>{decision.strategyName ?? 'No comparable strategy'}</strong>
          {fitPercent === null ? (
            <small>Complete the board to measure absolute fit.</small>
          ) : (
            <div className="voyage-fit-summary">
              <div>
                <span>Absolute fit</span>
                <strong>{fitPercent}%</strong>
              </div>
              <div>
                <span>Decision line</span>
                <strong>{linePercent}%</strong>
              </div>
            </div>
          )}
          {fitPercent !== null && (
            <div className="voyage-fit-track" aria-hidden="true">
              <span style={{ width: `${fitPercent}%` }} />
              <i style={{ left: `${linePercent}%` }} />
            </div>
          )}
        </div>

        <div className="voyage-costs">
          <div className="voyage-cost-heading">Reroll cost</div>
          <div className="voyage-reroll-used">
            <span>Used</span>
            <div className="reroll-stepper">
              <button
                aria-label="Decrease rerolls used"
                disabled={decision.rerollsUsed === 0}
                onClick={() => onChangeRerolls(decision.rerollsUsed - 1)}
              >
                −
              </button>
              <strong>{decision.rerollsUsed}/5</strong>
              <button
                aria-label="Increase rerolls used"
                disabled={decision.rerollsUsed === 5}
                onClick={() => onChangeRerolls(decision.rerollsUsed + 1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="voyage-cost-values">
            <div>
              <span>Spent</span>
              <strong>{sulphur(decision.spent)}</strong>
              <small>Sulphur</small>
            </div>
            <div className="next">
              <span>Next</span>
              <strong>{sulphur(decision.nextCost)}</strong>
              <small>
                {decision.nextCost === null ? 'cap reached' : 'Sulphur'}
              </small>
            </div>
          </div>
        </div>
      </div>

      <div className="voyage-disclaimer">
        <span>Heuristic guidance</span>
        Border-roll probabilities remain unknown; this is not expected value.
      </div>
    </section>
  )
}
