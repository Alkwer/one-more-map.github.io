import type { SolverResult } from '../../logic/solver'
import type { Board } from '../../types'

interface Props {
  results: SolverResult[]
  onApply: (board: Board) => void
}

export function SolverResults({ results, onApply }: Props) {
  if (results.length === 0) return null
  const search = results[0]
  const methodLabel = search.searchMethod === 'exhaustive' ? 'Exhaustive' : 'Heuristic'
  const guaranteeLabel = search.searchComplete
    ? '#1 is optimal within the supported search space.'
    : 'Best found; global optimum not proven.'

  return (
    <>
      <h4 id="solver-results-title" className="panel-title small">
        Results
      </h4>
      <div className="muted small-note">
        Search method: <strong>{methodLabel}</strong> · Guarantee: {guaranteeLabel}
      </div>
      <div className="results" aria-labelledby="solver-results-title">
        {results.map((result, index) => (
          <button
            key={index}
            className={`result ${result.valid ? '' : 'invalid'}`}
            onClick={() => onApply(result.board)}
          >
            <span>#{index + 1}</span>
            <span>{result.reward.toFixed(1)} pts</span>
            {!result.valid && <span className="badge bad">not fully reachable</span>}
          </button>
        ))}
      </div>
      <div className="muted small-note">
        Ranked by your weights and estimated mod values. Click a result to load it.
      </div>
    </>
  )
}
