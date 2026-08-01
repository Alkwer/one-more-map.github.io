import { GROUP_LABEL, GROUP_ORDER, REWARD_TYPES } from '../../logic/rewards'
import type { Weights } from '../../types'

interface Props {
  weights: Weights
  overridden: boolean
  onChange: (key: string, value: number) => void
}

export function RewardWeights({ weights, overridden, onChange }: Props) {
  return (
    <details className="weights-panel">
      <summary className="panel-title small weights-summary">
        Reward weights{overridden ? ' (overridden)' : ''}
      </summary>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        Your personal priorities - slide up what you value. Each reward is weighted on its own.
      </div>
      <div className={`weights ${overridden ? 'weights-overridden' : ''}`}>
        {GROUP_ORDER.map((group) => {
          const rows = REWARD_TYPES.filter((reward) => reward.group === group)
          if (rows.length === 0) return null
          return (
            <div key={group} className="weight-group">
              <div className="weight-group-title">{GROUP_LABEL[group]}</div>
              {rows.map((reward) => (
                <div key={reward.key} className="weight-row">
                  <span className="weight-label">{reward.label}</span>
                  <input
                    type="range"
                    aria-label={`${reward.label} reward weight`}
                    min={0}
                    max={10}
                    step={1}
                    disabled={overridden}
                    value={weights[reward.key] ?? reward.default}
                    onChange={(event) => onChange(reward.key, parseInt(event.target.value, 10))}
                  />
                  <span className="weight-val">{weights[reward.key] ?? reward.default}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </details>
  )
}
