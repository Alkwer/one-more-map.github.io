import { formatDecimal, formatNumber, t, ui } from '../../i18n/locale'
import { hasOptimalityGuarantee, type SolverResult } from '../../logic/solver'
import type { Board } from '../../types'

interface Props {
  results: SolverResult[]
  onApply: (board: Board) => void
}

export function SolverResults({ results, onApply }: Props) {
  if (results.length === 0) return null
  const search = results[0]
  const methodLabel = search.searchMethod === 'exhaustive' ? 'Exhaustive' : 'Heuristic'
  const guaranteeLabel = hasOptimalityGuarantee(search)
    ? '#1 is optimal within the supported search space.'
    : 'Best found; global optimum not proven.'

  return (
    <>
      <h4 id="solver-results-title" className="panel-title small">
        {t('Results')}
      </h4>
      <div className="muted small-note">
        {t('Search method: ')}
        <strong>{ui(methodLabel)}</strong>
        {t(' · Guarantee: ')}
        {ui(guaranteeLabel)}
      </div>
      <div className="results" aria-labelledby="solver-results-title">
        {results.map((result, index) => (
          <button
            key={index}
            className={`result ${result.valid ? '' : 'invalid'}`}
            onClick={() => onApply(result.board)}
          >
            <span>#{formatNumber(index + 1)}</span>
            <span>
              {ui(formatDecimal(result.reward, 1))}
              {t(' pts')}
            </span>
            {!result.valid && <span className="badge bad">{t('not fully reachable')}</span>}
          </button>
        ))}
      </div>
      <div className="muted small-note">
        {t('Ranked by your weights and estimated mod values. Click a result to load it.')}
      </div>
    </>
  )
}
