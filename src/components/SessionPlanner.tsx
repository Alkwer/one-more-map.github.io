import { formatNumber, t, ui } from '../i18n/locale'
import { useId, useMemo } from 'react'
import { planSession } from '../logic/sessionPlan'
import type { StrategyReservationPreferences } from '../data/strategies'
import type { Borders, ChartData, ConnectivityMode } from '../types'
import { useModalDialog } from './ModalDialog'

interface Props {
  pool: ChartData[]
  mode: ConnectivityMode
  borders: Borders
  reservations: StrategyReservationPreferences
  pieceKeeps: Record<string, number>
  onUseStrategy: (id: string) => void
  onClose: () => void
}

/** Overlay that sequences the whole library into a session of voyages. */
export function SessionPlanner({
  pool,
  mode,
  borders,
  reservations,
  pieceKeeps,
  onUseStrategy,
  onClose,
}: Props) {
  const titleId = useId()
  const { dialogProps } = useModalDialog({ labelledBy: titleId, onClose })
  const plan = useMemo(
    () => planSession(pool, borders, reservations, pieceKeeps, mode),
    [pool, borders, reservations, pieceKeeps, mode],
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
            {t('Session Plan')}
          </h2>
          <span className="spacer" />
          <button onClick={onClose}>{t('Done')}</button>
        </div>
        <p className="onboard-intro" style={{ marginBottom: 10 }}>
          {t(
            'Your whole library, sequenced: run these top to bottom, pressing Finish Voyage between runs. Each entry only uses charts the ones above it left behind.',
          )}
        </p>
        {plan.blocked > 0 && (
          <div className="muted pad">
            {formatNumber(plan.blocked)}
            {t(' chart')}
            {plan.blocked === 1 ? t(' needs') : t('s need')}
            {t(' shape confirmation and cannot be planned in strict connector mode.')}
          </div>
        )}
        {plan.eligible < 9 && (
          <div className="muted pad">
            {t('Fewer than 9 runnable charts - import or confirm some first.')}
          </div>
        )}
        <div className="plan-list">
          {ready.map((e) => {
            step += e.runs
            return (
              <div key={e.strategyId} className="plan-row ready">
                <span className="plan-step">
                  {e.runs > 1
                    ? t('{v0}-{v1}', { v0: step - e.runs + 1, v1: step })
                    : formatNumber(step)}
                </span>
                <span className="plan-name">
                  {e.name}
                  {e.runs > 1 && <span className="plan-runs"> ×{formatNumber(e.runs)}</span>}
                </span>
                <span className="plan-note muted">{ui(e.note)}</span>
                <span className="spacer" />
                <button
                  aria-label={t('Use {v0} strategy', { v0: e.name })}
                  onClick={() => {
                    onUseStrategy(e.strategyId)
                    onClose()
                  }}
                  title={t('Activate this strategy and close the plan')}
                >
                  {t('Use')}
                </button>
              </div>
            )
          })}
          {ready.length === 0 && plan.eligible >= 9 && (
            <div className="muted pad">
              {t('Nothing is ready to run - see what each strategy is waiting on below.')}
            </div>
          )}
        </div>
        {waiting.length > 0 && (
          <>
            <div className="panel-title small">{t('Waiting on pieces')}</div>
            <div className="plan-list">
              {waiting.map((e) => (
                <div key={e.strategyId} className="plan-row waiting">
                  <span className="plan-step">⏳</span>
                  <span className="plan-name">{e.name}</span>
                  <span className="plan-note muted">{ui(e.note)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="muted small-note">
          {formatNumber(plan.allocated)}
          {t(' chart')}
          {plan.allocated === 1 ? '' : t('s')}
          {t(' allocated · ')}
          {formatNumber(plan.leftover)}
          {t(
            ' left over (held-back fuel and oddments). Protections in Solver Settings shape what each strategy may spend.',
          )}
        </div>
      </div>
    </div>
  )
}
