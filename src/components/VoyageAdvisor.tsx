import { formatNumber, t, ui } from '../i18n/locale'
import type { VoyageDecision } from '../logic/voyageDecision'

interface Props {
  decision: VoyageDecision
  loading?: boolean
  error?: string | null
  onChangeRerolls: (value: number) => void
  onSelectStrategy: (id: string) => void
}

const sulphur = (value: number | null) => (value === null ? '—' : formatNumber(value))

const toneFor = (decision: VoyageDecision) => {
  if (decision.kind === 'play' || decision.kind === 'switch') return 'keep'
  if (decision.kind === 'reroll') return 'reroll'
  if (decision.kind === 'stop') return 'stop'
  return 'needs-data'
}

const contextLabelFor = (decision: VoyageDecision) => {
  if (decision.kind === 'stop' || decision.kind === 'reroll') {
    return 'Best ready charts + border strategy'
  }
  if (decision.kind === 'play' || decision.kind === 'switch') {
    if (decision.recommendationTier === 'fallback') {
      return 'Recommended fallback for charts + border roll'
    }
    return 'Best strategy for charts + border roll'
  }
  if (decision.kind === 'wait') {
    return decision.preserveRoll ? 'Strategy worth preserving' : 'Closest incomplete strategy'
  }
  return 'Best strategy for charts + border roll'
}

export function VoyageAdvisor({
  decision,
  loading = false,
  error = null,
  onChangeRerolls,
  onSelectStrategy,
}: Props) {
  if (loading || error) {
    return (
      <section
        className="voyage-advisor needs-data"
        aria-labelledby="voyage-advisor-title"
        aria-live="polite"
      >
        <div className="voyage-advisor-grid">
          <div className="voyage-decision">
            <h2 id="voyage-advisor-title" className="panel-title">
              {t('Voyage Recommendation')}
            </h2>
            <div className="voyage-decision-label">
              {loading ? t('Analyzing strategies…') : t('Analysis unavailable')}
            </div>
            <div className="voyage-decision-reason">
              {loading
                ? t('Comparing your chart library with the current border roll in the background.')
                : t('Strategy analysis failed: {error}', { error })}
            </div>
          </div>
        </div>
      </section>
    )
  }

  const fitPercent = decision.fit === null ? null : Math.round(decision.fit * 100)
  const action = decision.action
  const forecast = decision.rollForecast
  const rollPercentile = forecast ? Math.round(forecast.currentPercentile * 100) : null
  const modelKeepLinePercent =
    forecast && decision.keepModelPercentileLine !== null
      ? Math.round(decision.keepModelPercentileLine * 100)
      : null
  const improveChance = forecast ? Math.round(forecast.chanceNextRollBeatsCurrent * 100) : null
  const percentileRange = forecast
    ? forecast.currentPercentileRange.map((value) => Math.round(value * 100))
    : null
  const improveRange = forecast
    ? forecast.chanceNextRollBeatsCurrentRange.map((value) => Math.round(value * 100))
    : null

  return (
    <section
      className={`voyage-advisor ${toneFor(decision)}`}
      aria-labelledby="voyage-advisor-title"
    >
      <div className="voyage-advisor-grid">
        <div className="voyage-decision">
          <h2 id="voyage-advisor-title" className="panel-title">
            {t('Voyage Recommendation')}
          </h2>
          <div className="voyage-decision-label">{ui(decision.label)}</div>
          <div className="voyage-decision-reason">{ui(decision.reason)}</div>
          <small>
            {t('Decision basis: ')}
            {ui(decision.decisionBasis)}
          </small>
          {action && (
            <button
              className="voyage-primary-action"
              onClick={() => onSelectStrategy(action.strategyId)}
            >
              {ui(action.label)}
            </button>
          )}
        </div>

        <div className="voyage-context">
          <span>{ui(contextLabelFor(decision))}</span>
          <strong>{decision.strategyName ?? t('Import charts to compare')}</strong>
          {forecast && (
            <div className="voyage-model" data-testid="experimental-roll-model">
              <div className="voyage-model-head">
                <span>
                  {t('Paid-reroll slot model v')}
                  {formatNumber(forecast.modelVersion)}
                </span>
                <strong className={forecast.modelConfidence}>
                  {ui(forecast.modelConfidence)}
                  {t(' confidence')}
                </strong>
              </div>
              <div className="voyage-fit-summary voyage-model-summary">
                <div>
                  <span>{t('Achievable-roll percentile (prior range)')}</span>
                  <strong>
                    {ui(rollPercentile)}%
                    {percentileRange
                      ? t(' ({v0}–{v1}%)', { v0: percentileRange[0], v1: percentileRange[1] })
                      : ''}
                  </strong>
                </div>
                <div>
                  <span>{t('Keep percentile')}</span>
                  <strong>
                    {modelKeepLinePercent === null ? '—' : t('{v0}%', { v0: modelKeepLinePercent })}
                  </strong>
                </div>
              </div>
              <div className="voyage-fit-track voyage-percentile-track" aria-hidden="true">
                <span style={{ width: `${rollPercentile}%` }} />
                {modelKeepLinePercent !== null && (
                  <i style={{ left: `${modelKeepLinePercent}%` }} />
                )}
              </div>
              <p className="voyage-model-insight">
                <strong>{ui(improveChance)}%</strong>
                {t(' of modeled paid rerolls score higher than this roll')}
                {improveRange
                  ? t(' ({v0}–{v1}% prior range)', { v0: improveRange[0], v1: improveRange[1] })
                  : ''}
                .
              </p>
              <small>
                {formatNumber(forecast.sampleCount)}
                {t(' paid-reroll boards · ')}
                {formatNumber(forecast.sequenceCount)}
                {t(' paid Voyage sequences · ')}
                {formatNumber(forecast.borrowedNaturalBoardCount)}
                {t(' natural boards borrowed at half weight')}
              </small>
            </div>
          )}
          {!forecast &&
            (fitPercent === null ? (
              <small>{t('Enter the border roll to measure contextual border fit.')}</small>
            ) : (
              <>
                <div className="voyage-fit-summary">
                  <div>
                    <span>{t('Theoretical ceiling ratio')}</span>
                    <strong>{formatNumber(fitPercent)}%</strong>
                  </div>
                </div>
                <div className="voyage-fit-track" aria-hidden="true">
                  <span style={{ width: `${fitPercent}%` }} />
                </div>
                <small>
                  {t(
                    'Diagnostic only: contribution versus a best-known modifier in every relevant slot. No keep/reroll threshold is applied to this scale.',
                  )}
                </small>
              </>
            ))}
          {forecast && fitPercent !== null && (
            <div className="voyage-fit-diagnostic">
              <div className="voyage-fit-diagnostic-head">{t('Secondary ceiling diagnostic')}</div>
              <div className="voyage-fit-summary">
                <div>
                  <span>{t('Theoretical ceiling ratio')}</span>
                  <strong>{formatNumber(fitPercent)}%</strong>
                </div>
              </div>
              <small>
                {t(
                  'Contribution versus a best-known modifier in every relevant slot. This is not a percentile, has no decision line, and cannot trigger KEEP or REROLL.',
                )}
              </small>
            </div>
          )}
        </div>

        <div className="voyage-costs">
          <div className="voyage-cost-heading">{t('Reroll cost')}</div>
          <div className="voyage-reroll-used">
            <span>{t('Used')}</span>
            <div className="reroll-stepper">
              <button
                aria-label={t('Decrease rerolls used')}
                disabled={decision.rerollsUsed === 0}
                onClick={() => onChangeRerolls(decision.rerollsUsed - 1)}
              >
                −
              </button>
              <strong>{formatNumber(decision.rerollsUsed)}/5</strong>
              <button
                aria-label={t('Increase rerolls used')}
                disabled={decision.rerollsUsed === 5}
                onClick={() => onChangeRerolls(decision.rerollsUsed + 1)}
              >
                +
              </button>
            </div>
          </div>
          <div className="voyage-cost-values">
            <div>
              <span>{t('Spent')}</span>
              <strong>{ui(sulphur(decision.spent))}</strong>
              <small>{t('Sulphur')}</small>
            </div>
            <div className="next">
              <span>{t('Next')}</span>
              <strong>{ui(sulphur(decision.nextCost))}</strong>
              <small>{decision.nextCost === null ? t('cap reached') : t('Sulphur')}</small>
            </div>
          </div>
        </div>
      </div>

      <div className="voyage-disclaimer">
        <span>{forecast ? t('Experimental probability model') : t('Heuristic guidance')}</span>
        {forecast
          ? t(
              'Slot-aware frequencies update with the canonical dataset. Confidence counts only paid Voyage sequences; natural boards stabilize weights without raising it. A recommendation requires the full prior-sensitivity range to stay on one side of the keep line; an overlapping range preserves the board instead of recommending spend. Slots are still modeled independently, and prior-only estimates are not observed drops. This is not Sulphur expected value.',
            )
          : t(
              'A modeled comparison is unavailable, so the app preserves the board instead of using the theoretical ceiling ratio as a spending signal.',
            )}
      </div>
    </section>
  )
}
