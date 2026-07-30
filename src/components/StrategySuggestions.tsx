import type { StrategySuggestionResult } from '../logic/strategySuggestions'

interface Props {
  result: StrategySuggestionResult
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

export function StrategySuggestions({ result, activeId, onSelect }: Props) {
  return (
    <section className="strategy-suggestions" aria-labelledby="strategy-suggestions-title">
      <div className="suggestion-heading">
        <div>
          <div className="panel-title" id="strategy-suggestions-title">
            Strategy compatibility
          </div>
          <div className="muted small-note suggestion-intro">
            Ranks the best layout each strategy can build from all imported
            charts together with the current border roll. Runnable strategies
            rank ahead of incomplete ones; the manual board is only a
            diagnostic.
          </div>
        </div>
        {result.enteredBorders > 0 && (
          <span className="suggestion-roll-count">
            {result.enteredBorders}/12 borders
          </span>
        )}
      </div>

      {!result.hasEvidence ? (
        <div className="suggestion-empty">
          Import charts or enter border modifiers to get a strategy
          recommendation.
        </div>
      ) : (
        <div className="suggestion-list">
          {result.suggestions.map((suggestion, index) => {
            const isActive = activeId === suggestion.strategy.id
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
                        ? 'Best charts + border strategy'
                        : `#${index + 1} combined match`}
                  </div>
                  <span className={`suggestion-confidence ${suggestion.confidence}`}>
                    {fitLabel[suggestion.status]}
                  </span>
                </div>
                <div className="suggestion-name">{suggestion.strategy.name}</div>
                <div className="suggestion-tagline">{suggestion.strategy.tagline}</div>
                <div className="suggestion-metrics">
                  <span>
                    Charts{' '}
                    <strong>{Math.round(suggestion.libraryFit * 100)}%</strong>
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
                    Combined{' '}
                    <strong>
                      {Math.round(suggestion.combinedFit * 100)}%
                    </strong>
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
                    Library{' '}
                    <strong>
                      {suggestion.eligibleCharts} eligible
                    </strong>
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
        Diagnostic only — the recommendation above is the single play/reroll
        decision.
      </div>
    </section>
  )
}
