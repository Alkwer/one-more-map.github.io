import { formatNumber, t, ui } from '../i18n/locale'
import type { StrategySuggestionResult } from '../logic/strategySuggestions'
import { BORDER_ROLL_MODEL } from '../logic/borderRollModel'
import { hasOptimalityGuarantee } from '../logic/solver'

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
  weak: 'LOW CEILING RATIO',
  mixed: 'MEDIUM CEILING RATIO',
  strong: 'HIGH CEILING RATIO',
  excellent: 'VERY HIGH CEILING RATIO',
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
            {t('Strategy compatibility')}
          </h3>
          <div className="muted small-note suggestion-intro">
            {t(
              'Ranks the best layout found for each strategy by bounded heuristic search across all imported charts together with the current border roll; global optimality is not proven. Fallback policy compares each strategy with achievable modeled rolls on its own percentile scale; combined fit is not currency EV. The manual board is only a diagnostic.',
            )}
          </div>
        </div>
        {result.enteredBorders > 0 && (
          <span className="suggestion-roll-count">
            {formatNumber(result.enteredBorders)}
            {t('/12 borders')}
          </span>
        )}
      </div>

      {loading ? (
        <div className="suggestion-empty" aria-live="polite">
          {t('Analyzing the chart library and border roll…')}
        </div>
      ) : error ? (
        <div className="suggestion-empty" role="alert">
          {t('Strategy analysis failed: ')}
          {ui(error)}
        </div>
      ) : !result.hasEvidence ? (
        <div className="suggestion-empty">
          {t('Import charts or enter border modifiers to get a strategy recommendation.')}
        </div>
      ) : (
        <div className="suggestion-list">
          {result.suggestions.map((suggestion, index) => {
            const isActive = activeId === suggestion.strategy.id
            const requiresReroll = suggestion.requiredBorderStatus === 'missing'
            const isSpecializedAlternative =
              suggestion.strategy.id === bestReadySpecializedAlternativeId
            const optimalityProven =
              suggestion.searchMethod !== null && hasOptimalityGuarantee(suggestion)
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
                      ? t('🎰 JACKPOT')
                      : index === 0
                        ? topIsFallback
                          ? t('Recommended fallback')
                          : t('Recommended strategy')
                        : isSpecializedAlternative
                          ? t('Best ready specialized alternative')
                          : t('#{v0} combined fit', { v0: index + 1 })}
                  </div>
                  <span
                    className={`suggestion-confidence ${
                      requiresReroll ? 'weak' : suggestion.confidence
                    }`}
                  >
                    {requiresReroll ? t('REQUIRES REROLL') : ui(fitLabel[suggestion.status])}
                  </span>
                </div>
                <div className="suggestion-name">{suggestion.strategy.name}</div>
                <div className="suggestion-tagline">{ui(suggestion.strategy.tagline)}</div>
                {isSpecializedAlternative && (
                  <div className="suggestion-alternative-note">
                    {t('Runnable alternative — select it to build this specialized layout.')}
                  </div>
                )}
                <div className="suggestion-metrics">
                  <span>
                    {t('Charts ')}
                    <strong>{formatNumber(Math.round(suggestion.libraryFit * 100))}%</strong>
                  </span>
                  <span>
                    {t('Ceiling ratio')}{' '}
                    <strong>
                      {suggestion.enteredBorders === 0
                        ? '—'
                        : t('{v0}%', { v0: Math.round(suggestion.borderFit * 100) })}
                    </strong>
                  </span>
                  <span>
                    {t('Expected ceiling ratio')}{' '}
                    <strong>
                      {suggestion.modeledBorderFit === null
                        ? '—'
                        : t('{v0}%', { v0: Math.round(suggestion.modeledBorderFit * 100) })}
                    </strong>
                  </span>
                  {suggestion.requiredBorderChance !== null && (
                    <span>
                      {t('Required border')}
                      <strong>
                        {suggestion.requiredBorderEvidence === 'prior-only'
                          ? t('Unknown')
                          : suggestion.requiredBorderEvidence === 'borrowed'
                            ? t('Natural-only')
                            : t('{v0}%', { v0: Math.round(suggestion.requiredBorderChance * 100) })}
                      </strong>
                      {suggestion.requiredBorderEvidence === 'prior-only' && (
                        <em className="suggestion-prior-only">{t('prior-only · 0 observed')}</em>
                      )}
                      {suggestion.requiredBorderEvidence === 'borrowed' && (
                        <em className="suggestion-prior-only">
                          {ui(suggestion.requiredBorderBorrowedObservations)}
                          {t(' natural · 0 paid')}
                        </em>
                      )}
                    </span>
                  )}
                  <span>
                    {t('Combined fit ')}
                    <strong>{formatNumber(Math.round(suggestion.combinedFit * 100))}%</strong>
                  </span>
                  <span>
                    {t('Current board')}{' '}
                    <strong>
                      {suggestion.currentFit === null
                        ? '—'
                        : t('{v0}%', { v0: Math.round(suggestion.currentFit * 100) })}
                    </strong>
                  </span>
                  <span>
                    {t('Requirements')}{' '}
                    <strong>
                      {suggestion.readiness.need === 0
                        ? t('n/a')
                        : t('{v0}/{v1}', {
                            v0: suggestion.readiness.have,
                            v1: suggestion.readiness.need,
                          })}
                    </strong>
                  </span>
                  <span>
                    {t('Library ')}
                    <strong>
                      {formatNumber(suggestion.eligibleCharts)}
                      {t(' eligible')}
                    </strong>
                  </span>
                  <span>
                    {t('Search')}{' '}
                    <strong>
                      {suggestion.searchMethod === null
                        ? t('Not run')
                        : optimalityProven
                          ? t('Exhaustive · optimal proven')
                          : t('Heuristic · best found (no global guarantee)')}
                    </strong>
                  </span>
                </div>
                {index === 0 && (
                  <ul className="suggestion-reasons">
                    {suggestion.reasons.map((reason) => (
                      <li key={reason}>{ui(reason)}</li>
                    ))}
                  </ul>
                )}
                <button
                  className={`suggestion-use ${isActive ? 'active' : ''}`}
                  disabled={isActive}
                  onClick={() => onSelect(suggestion.strategy.id)}
                  aria-label={t(
                    isActive
                      ? 'Strategy active: {name} (recommendation)'
                      : 'Set active strategy: {name} (recommendation)',
                    { name: suggestion.strategy.name },
                  )}
                >
                  {isActive ? t('✓ Strategy active') : t('Set active strategy')}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <div className="suggestion-disclaimer">
        {t('Experimental — achievable-roll comparison uses the slot-aware v')}
        {formatNumber(BORDER_ROLL_MODEL.version)} {t('model at ')}
        {ui(BORDER_ROLL_MODEL.confidence)}
        {t(
          ' confidence. Natural boards stabilize weights without raising paid confidence; borrowed and prior-only estimates are not observed paid drops. A decision must remain on the same side of its percentile line across the tested priors; incomplete rolls never use it. Reroll guidance is not Sulphur expected value.',
        )}
      </div>
    </section>
  )
}
