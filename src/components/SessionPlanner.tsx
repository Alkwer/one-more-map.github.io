import { useId, useMemo } from 'react'
import { planSession } from '../logic/sessionPlan'
import type { StrategyReservationPreferences } from '../data/strategies'
import type { Borders, ChartData } from '../types'
import { useModalDialog } from './ModalDialog'

interface Props {
  pool: ChartData[]
  borders: Borders
  reservations: StrategyReservationPreferences
  pieceKeeps: Record<string, number>
  onUseStrategy: (id: string) => void
  onClose: () => void
}

/** Overlay that sequences the whole library into a session of voyages. */
export function SessionPlanner({
  pool,
  borders,
  reservations,
  pieceKeeps,
  onUseStrategy,
  onClose,
}: Props) {
  const titleId = useId()
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })
  const plan = useMemo(
    () => planSession(pool, borders, reservations, pieceKeeps),
    [pool, borders, reservations, pieceKeeps],
  )
  const ready = plan.entries.filter((e) => e.status === 'ready')
  const waiting = plan.entries.filter((e) => e.status === 'waiting')
  let step = 0

  return (
    <div className="onboard-backdrop" data-modal-root onClick={onClose}>
      <div
        {...dialogProps}
        className="onboard session-plan"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-title">
          <h2 id={titleId} className="panel-title-heading" data-dialog-initial-focus tabIndex={-1}>
            Session Plan
          </h2>
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </div>
        <p className="onboard-intro" style={{ marginBottom: 10 }}>
          Your whole library, sequenced: run these top to bottom, pressing Finish Voyage between
          runs. Each entry only uses charts the ones above it left behind.
        </p>
        {pool.length < 9 && (
          <div className="muted pad">Fewer than 9 charts - import some first.</div>
        )}
        <div className="plan-list">
          {ready.map((e) => {
            step += e.runs
            return (
              <div key={e.strategyId} className="plan-row ready">
                <span className="plan-step">
                  {e.runs > 1 ? `${step - e.runs + 1}-${step}` : step}
                </span>
                <span className="plan-name">
                  {e.name}
                  {e.runs > 1 && <span className="plan-runs"> ×{e.runs}</span>}
                </span>
                <span className="plan-note muted">{e.note}</span>
                <span className="spacer" />
                <button
                  aria-label={`Use ${e.name} strategy`}
                  onClick={() => {
                    onUseStrategy(e.strategyId)
                    onClose()
                  }}
                  title="Activate this strategy and close the plan"
                >
                  Use
                </button>
              </div>
            )
          })}
          {ready.length === 0 && pool.length >= 9 && (
            <div className="muted pad">
              Nothing is ready to run - see what each strategy is waiting on below.
            </div>
          )}
        </div>
        {waiting.length > 0 && (
          <>
            <div className="panel-title small">Waiting on pieces</div>
            <div className="plan-list">
              {waiting.map((e) => (
                <div key={e.strategyId} className="plan-row waiting">
                  <span className="plan-step">⏳</span>
                  <span className="plan-name">{e.name}</span>
                  <span className="plan-note muted">{e.note}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="muted small-note">
          {plan.allocated} chart{plan.allocated === 1 ? '' : 's'} allocated · {plan.leftover} left
          over (held-back fuel and oddments). Protections in Solver Settings shape what each
          strategy may spend.
        </div>
      </div>
    </div>
  )
}
