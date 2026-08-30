import { formatNumber, t, ui } from '../../i18n/locale'
import { GROUP_LABEL, GROUP_ORDER, REWARD_TYPES } from '../../logic/rewards'
import type { Weights } from '../../types'

interface Props {
  weights: Weights
  overridden: boolean
  onChange: (key: string, value: number) => void
}

export function RewardWeights({ weights, overridden, onChange }: Props) {
  return (
    <details
      key={overridden ? 'overridden' : 'manual'}
      className="weights-panel"
      open={!overridden}
    >
      <summary className="panel-title small weights-summary">
        {t('Reward weights')}
        {overridden ? t(' (overridden)') : ''}
      </summary>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        {t(
          'Your personal priorities - slide up what you value. Each reward is weighted on its own.',
        )}
      </div>
      <div className={`weights ${overridden ? 'weights-overridden' : ''}`}>
        {GROUP_ORDER.map((group) => {
          const rows = REWARD_TYPES.filter((reward) => reward.group === group)
          if (rows.length === 0) return null
          const scopeLabel = GROUP_LABEL[group]
          return (
            <fieldset key={group} className="weight-group">
              <legend className="weight-group-title">{ui(scopeLabel)}</legend>
              {rows.map((reward) => (
                <div key={reward.key} className="weight-row">
                  <span className="weight-label">{ui(reward.label)}</span>
                  <input
                    type="range"
                    aria-label={t('{v0} — {v1} reward weight', {
                      v0: scopeLabel,
                      v1: reward.label,
                    })}
                    min={0}
                    max={10}
                    step={1}
                    disabled={overridden}
                    value={weights[reward.key] ?? reward.default}
                    onChange={(event) => onChange(reward.key, parseInt(event.target.value, 10))}
                  />
                  <span className="weight-val">
                    {formatNumber(weights[reward.key] ?? reward.default)}
                  </span>
                </div>
              ))}
            </fieldset>
          )
        })}
      </div>
    </details>
  )
}
