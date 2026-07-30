import type { StrategySuggestionResult } from '../logic/strategySuggestions'

interface Props {
  result: StrategySuggestionResult
  activeId: string | null
  onSelect: (id: string) => void
}

const fitLabel = {
  empty: 'NO ROLL DATA',
  incomplete: 'PARTIAL EVIDENCE',
  unscored: 'NO WEIGHTED SIGNAL',
  weak: 'WEAK ABSOLUTE FIT',
  mixed: 'MIXED ABSOLUTE FIT',
  strong: 'STRONG ABSOLUTE FIT',
  excellent: 'EXCELLENT ABSOLUTE FIT',
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
            Diagnostic ranking against each strategy&apos;s own weights. Absolute
            fit and readiness are shown separately.
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
          Enter border modifiers or place charts to get a strategy recommendation.
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
                        ? 'Best relative compatibility'
                        : `#${index + 1} relative`}
                  </div>
                  <span className={`suggestion-confidence ${suggestion.confidence}`}>
                    {fitLabel[suggestion.status]}
                  </span>
                </div>
                <div className="suggestion-name">{suggestion.strategy.name}</div>
                <div className="suggestion-tagline">{suggestion.strategy.tagline}</div>
                <div className="suggestion-metrics">
                  <span>
                    Borders <strong>{suggestion.matchingBorders}/{suggestion.enteredBorders}</strong>
                  </span>
                  <span>
                    Ready{' '}
                    <strong>
                      {suggestion.readiness.need === 0
                        ? 'n/a'
                        : `${suggestion.readiness.have}/${suggestion.readiness.need}`}
                    </strong>
                  </span>
                  <span>
                    Absolute fit{' '}
                    <strong>
                      {suggestion.fit === null
                        ? '—'
                        : `${Math.round(suggestion.fit * 100)}%`}
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
