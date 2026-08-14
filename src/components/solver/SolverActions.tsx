interface Props {
  busy: boolean
  resultCount: number
  solveNote: string
  eligibleChartCount: number
  unresolvedShapeCount: number
  allowRotation: boolean
  onSolve: () => void
  onFiller: () => void
  onOpenPlanner?: () => void
}

export function SolverActions(props: Props) {
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {props.busy
          ? 'Solver is running'
          : props.resultCount > 0
            ? `Solver finished with ${props.resultCount} result${props.resultCount === 1 ? '' : 's'}`
            : props.solveNote}
      </div>

      <div className="solver-actions solve-row">
        <button
          className="primary"
          onClick={props.onSolve}
          disabled={props.busy || props.eligibleChartCount === 0}
        >
          {props.busy ? 'Solving…' : `Solve (${props.eligibleChartCount} charts)`}
        </button>
        {props.onOpenPlanner && (
          <button
            className="solve-settings-btn"
            onClick={props.onOpenPlanner}
            title="Sequence your whole library into a session of voyages"
          >
            📋<span className="solve-settings-label">Plan</span>
          </button>
        )}
      </div>
      <button
        className="filler-btn"
        onClick={props.onFiller}
        disabled={props.busy || props.eligibleChartCount < 10}
        title="Build a throwaway voyage from your lowest-value spare charts, keeping your best, strategy-protected and locked charts for a real run"
      >
        🗑 Filler voyage (spare charts)
      </button>
      {props.unresolvedShapeCount > 0 && (
        <div className="shape-warning small-note">
          {props.unresolvedShapeCount} chart{props.unresolvedShapeCount === 1 ? '' : 's'} excluded
          until its shape is confirmed in the library.
        </div>
      )}
      {props.solveNote && <div className="muted small-note">{props.solveNote}</div>}
      {props.eligibleChartCount > 9 || props.allowRotation ? (
        <div className="muted small-note">
          Large pool / rotation → bounded heuristic search (results are best found; no global
          optimality guarantee)
        </div>
      ) : (
        <div className="muted small-note">
          Pool ≤ 9 charts, rotation off → exhaustive search (#1 is optimal within the supported
          search space)
        </div>
      )}
    </>
  )
}
