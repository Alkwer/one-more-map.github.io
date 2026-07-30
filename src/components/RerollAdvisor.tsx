import type { RerollAdvice } from '../logic/rerollAdvice'

interface Props {
  advice: RerollAdvice
  onChangeRerolls: (value: number) => void
}

const sulphur = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('en-US')

export function RerollAdvisor({ advice, onChangeRerolls }: Props) {
  const fitPercent = advice.fit === null ? null : Math.round(advice.fit * 100)
  const linePercent =
    advice.keepFitLine === null ? null : Math.round(advice.keepFitLine * 100)

  return (
    <section
      className={`reroll-advisor ${advice.recommendation}`}
      aria-labelledby="reroll-advisor-title"
    >
      <div className="reroll-advisor-head">
        <div>
          <div id="reroll-advisor-title" className="panel-title">
            Keep / Reroll Advisor
          </div>
          <div className="muted reroll-advisor-subtitle">
            Experimental cost-aware heuristic
          </div>
        </div>
        <span className="reroll-advisor-badge">{advice.label}</span>
      </div>

      <div className="reroll-decision">
        <div className="reroll-decision-label">{advice.label}</div>
        <div className="reroll-decision-reason">{advice.reason}</div>
      </div>

      <div className="reroll-cost-grid">
        <div className="reroll-cost-card">
          <span>Rerolls used</span>
          <div className="reroll-stepper">
            <button
              aria-label="Decrease rerolls used"
              disabled={advice.rerollsUsed === 0}
              onClick={() => onChangeRerolls(advice.rerollsUsed - 1)}
            >
              −
            </button>
            <strong>{advice.rerollsUsed}/5</strong>
            <button
              aria-label="Increase rerolls used"
              disabled={advice.rerollsUsed === 5}
              onClick={() => onChangeRerolls(advice.rerollsUsed + 1)}
            >
              +
            </button>
          </div>
        </div>
        <div className="reroll-cost-card">
          <span>Spent this board</span>
          <strong>{sulphur(advice.spent)}</strong>
          <small>Sulphur</small>
        </div>
        <div className="reroll-cost-card next">
          <span>Next reroll</span>
          <strong>{sulphur(advice.nextCost)}</strong>
          <small>{advice.nextCost === null ? 'cap reached' : 'Sulphur'}</small>
        </div>
      </div>

      {fitPercent !== null && linePercent !== null && (
        <div className="reroll-threshold">
          <div className="reroll-threshold-labels">
            <span>
              Current fit <strong>{fitPercent}%</strong>
            </span>
            <span>
              Keep line <strong>{linePercent}%</strong>
            </span>
          </div>
          <div className="reroll-threshold-track" aria-hidden="true">
            <span className="reroll-threshold-fill" style={{ width: `${fitPercent}%` }} />
            <span className="reroll-threshold-line" style={{ left: `${linePercent}%` }} />
          </div>
        </div>
      )}

      <div className="muted small-note reroll-disclaimer">
        Not expected value: roll probabilities are unknown. Costs are confirmed; the five-reroll
        cap and reset on a new Voyage still need a live UI check.
      </div>
    </section>
  )
}
