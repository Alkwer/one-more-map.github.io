import type { StrategySuggestionResult } from '../logic/strategySuggestions'
import { BORDER_ROLL_MODEL } from '../logic/borderRollModel'

interface Props {
  result: StrategySuggestionResult
  loading?: boolean
  error?: string | null
  activeId: string | null
  onSelect: (id: string) => void
}

const fitLabel = {
  empty: 'NO ROLL DATA',
  incomplete: 'PARTIAL ROLL',
  unscored: 'NO WEIGHTED SIGNAL',
  weak: 'WEAK BORDER FIT',
  mixed: 'MIXED BORDER FIT',
  strong: 'STRONG BORDER FIT',
  excellent: 'EXCELLENT BORDER FIT',
} as const

export function StrategySuggestions({
  result,
  loading = false,
  error = null,
  activeId,
  onSelect,
}: Props) {
  const topIsFallback = result.suggestions[0]?.strategy.recommendationTier === 'fallback'
  const bestReadySpecializedAlternativeId = topIsFallback
    ? (result.evaluations.find(
        (suggestion) =>
          suggestion.strategy.recommendationTier === 'specialized' &&
          suggestion.readiness.ready &&
          suggestion.requiredBorderStatus !== 'missing',
      )?.strategy.id ?? null)
    : null

  return (
    <section className="strategy-suggestions" aria-labelledby="strategy-suggestions-title">
      <div className="suggestion-heading">
        <div>
          <h3 className="panel-title" id="strategy-suggestions-title">
            Strategy compatibility
          </h3>
          <div className="muted small-note suggestion-intro">
            Ranks the best layout each strategy can build from all imported charts together with the
            current border roll. Fallback policy can rank Alc &amp; Go above a runnable
            specialization whose current borders miss the fit line; combined fit is not currency EV.
            The manual board is only a diagnostic.
          </div>
        </div>
        {result.enteredBorders > 0 && (
          <span className="suggestion-roll-count">{result.enteredBorders}/12 borders</span>
        )}
      </div>

      {loading ? (
        <div className="suggestion-empty" aria-live="polite">
          Analyzing the chart library and border roll…
        </div>
      ) : error ? (
        <div className="suggestion-empty" role="alert">
          Strategy analysis failed: {error}
        </div>
      ) : !result.hasEvidence ? (
        <div className="suggestion-empty">
          Import charts or enter border modifiers to get a strategy recommendation.
        </div>
      ) : (
        <div className="suggestion-list">
          {result.suggestions.map((suggestion, index) => {
            const isActive = activeId === suggestion.strategy.id
            const requiresReroll = suggestion.requiredBorderStatus === 'missing'
            const isSpecializedAlternative =
              suggestion.strategy.id === bestReadySpecializedAlternativeId
            return (
              <article
                className={`suggestion-card ${index === 0 ? 'best' : ''} ${
                  suggestion.jackpot ? 'jackpot' : ''
                }`}
                key={suggestion.strategy.id}
              >
                <div className="suggestion-card-head">
                  <div className="suggestion-rank">
                    {suggestion.jackpot
                      ? '🎰 JACKPOT'
                      : index === 0
                        ? topIsFallback
                          ? 'Recommended fallback'
                          : 'Recommended strategy'
                        : isSpecializedAlternative
                          ? 'Best ready specialized alternative'
                          : `#${index + 1} combined fit`}
                  </div>
                  <span
                    className={`suggestion-confidence ${
                      requiresReroll ? 'weak' : suggestion.confidence
                    }`}
                  >
                    {requiresReroll ? 'REQUIRES REROLL' : fitLabel[suggestion.status]}
                  </span>
                </div>
                <div className="suggestion-name">{suggestion.strategy.name}</div>
                <div className="suggestion-tagline">{suggestion.strategy.tagline}</div>
                {isSpecializedAlternative && (
                  <div className="suggestion-alternative-note">
                    Runnable alternative — select it to build this specialized layout.
                  </div>
                )}
                <div className="suggestion-metrics">
                  <span>
                    Charts <strong>{Math.round(suggestion.libraryFit * 100)}%</strong>
                  </span>
                  <span>
                    Borders{' '}
                    <strong>
                      {suggestion.enteredBorders === 0
                        ? '—'
                        : `${Math.round(suggestion.borderFit * 100)}%`}
                    </strong>
                  </span>
                  <span>
                    Expected reroll{' '}
                    <strong>
                      {suggestion.modeledBorderFit === null
                        ? '—'
                        : `${Math.round(suggestion.modeledBorderFit * 100)}%`}
                    </strong>
                  </span>
                  {suggestion.requiredBorderChance !== null && (
                    <span>
                      Required border
                      <strong>
                        {suggestion.requiredBorderEvidence === 'prior-only'
                          ? 'Unknown'
                          : `${Math.round(suggestion.requiredBorderChance * 100)}%`}
                      </strong>
                      {suggestion.requiredBorderEvidence === 'prior-only' && (
                        <em className="suggestion-prior-only">prior-only · 0 observed</em>
                      )}
                    </span>
                  )}
                  <span>
                    Combined fit <strong>{Math.round(suggestion.combinedFit * 100)}%</strong>
                  </span>
                  <span>
                    Current board{' '}
                    <strong>
                      {suggestion.currentFit === null
                        ? '—'
                        : `${Math.round(suggestion.currentFit * 100)}%`}
                    </strong>
                  </span>
                  <span>
                    Requirements{' '}
                    <strong>
                      {suggestion.readiness.need === 0
                        ? 'n/a'
                        : `${suggestion.readiness.have}/${suggestion.readiness.need}`}
                    </strong>
                  </span>
                  <span>
                    Library <strong>{suggestion.eligibleCharts} eligible</strong>
                  </span>
                </div>
                {index === 0 && (
                  <ul className="suggestion-reasons">
                    {suggestion.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <button
                  className={`suggestion-use ${isActive ? 'active' : ''}`}
                  disabled={isActive}
                  onClick={() => onSelect(suggestion.strategy.id)}
                >
                  {isActive ? '✓ Strategy active' : 'Set active strategy'}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <div className="suggestion-disclaimer">
        Diagnostic only — expected-reroll compatibility uses the slot-aware v
        {BORDER_ROLL_MODEL.version} model at {BORDER_ROLL_MODEL.confidence} confidence. Prior-only
        estimates are model assumptions, not observed drops; reroll guidance is not Sulphur expected
        value.
      </div>
    </section>
  )
}
