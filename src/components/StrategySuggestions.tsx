import type { StrategySuggestionResult } from '../logic/strategySuggestions'

interface Props {
  result: StrategySuggestionResult
  activeId: string | null
  onSelect: (id: string) => void
}

const confidenceLabel = {
  low: 'LOW SIGNAL',
  medium: 'GOOD MATCH',
  high: 'HIGH CONFIDENCE',
} as const

export function StrategySuggestions({ result, activeId, onSelect }: Props) {
  return (
    <section className="strategy-suggestions" aria-labelledby="strategy-suggestions-title">
      <div className="suggestion-heading">
        <div>
          <div className="panel-title" id="strategy-suggestions-title">
            Suggested for this roll
          </div>
          <div className="muted small-note suggestion-intro">
            Ranked from current borders, placed charts and pieces in your library.
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
                    {suggestion.jackpot ? '🎰 JACKPOT' : index === 0 ? '#1 BEST MATCH' : `#${index + 1}`}
                  </div>
                  <span className={`suggestion-confidence ${suggestion.confidence}`}>
                    {confidenceLabel[suggestion.confidence]}
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
                  {isActive ? '✓ Strategy active' : 'Use this strategy'}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <div className="suggestion-disclaimer">
        Compatibility only — keep/reroll EV needs real roll probabilities.
      </div>
    </section>
  )
}
