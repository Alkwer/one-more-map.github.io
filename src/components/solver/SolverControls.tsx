import { t, ui } from '../../i18n/locale'
import {
  DIVINE_RARE_RESERVATIONS,
  MANUAL_STRATEGY_RESERVATIONS,
  STRATEGY_RESERVATION_OPTIONS,
  type StrategyDef,
} from '../../data/strategies'
import type { AdjacencyMode } from '../../logic/scoring'
import type { AppState } from '../../state/appState'
import type { ConnectivityMode } from '../../types'
import { RewardWeights } from './RewardWeights'

interface Props {
  state: AppState
  activeStrategy: StrategyDef | null
  onPatch: (patch: Partial<AppState>) => void
}

export function SolverControls({ state, activeStrategy, onPatch }: Props) {
  const reservationGroups = activeStrategy
    ? (activeStrategy.reservationGroups ?? [])
    : MANUAL_STRATEGY_RESERVATIONS
  const fallbackReservations = activeStrategy?.allowRareImplicits
    ? []
    : DIVINE_RARE_RESERVATIONS.filter(
        (fallback) => !reservationGroups.some((reservation) => reservation.id === fallback.id),
      )
  const effectiveReservations = [...reservationGroups, ...fallbackReservations]
  const availableReservations = STRATEGY_RESERVATION_OPTIONS.filter((option) =>
    effectiveReservations.some((reservation) => reservation.id === option.id),
  )

  return (
    <>
      <div className="field">
        <label htmlFor="connector-rule">{t('Connector rule')}</label>
        <select
          id="connector-rule"
          value={state.mode}
          onChange={(event) => onPatch({ mode: event.target.value as ConnectivityMode })}
        >
          <option value="strict">{t('Connectors must line up (real rule)')}</option>
          <option value="any">{t('Ignore connectors (experiment)')}</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.allowRotation}
          onChange={(event) => onPatch({ allowRotation: event.target.checked })}
        />
        {t('Charts can be rotated')}
      </label>

      <div className="field">
        <label htmlFor="adjacency-mode">{t('Adjacent modifiers reach')}</label>
        <select
          id="adjacency-mode"
          value={state.adjacencyMode}
          onChange={(event) => onPatch({ adjacencyMode: event.target.value as AdjacencyMode })}
        >
          <option value="physical">{t('Any neighbouring area')}</option>
          <option value="connected">{t('Only connected neighbours')}</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.adjacentAffectsSelf}
          onChange={(event) => onPatch({ adjacentAffectsSelf: event.target.checked })}
        />
        {t('Adjacent modifiers also affect their own area')}
      </label>

      {activeStrategy && (
        <div className="strat-override-note">
          ⚑ <strong>{activeStrategy.name}</strong>
          {t(" is steering the solver - your manual weights below are ignored while it's active.")}
        </div>
      )}

      {availableReservations.length > 0 && (
        <fieldset className="strategy-reservations">
          <legend>{t('Protect chart types')}</legend>
          {availableReservations.map((option) => (
            <label className="check" key={option.id}>
              <input
                type="checkbox"
                name="strategy-reservation"
                value={option.id}
                checked={state.strategyReservations[option.id]}
                onChange={(event) =>
                  onPatch({
                    strategyReservations: {
                      ...state.strategyReservations,
                      [option.id]: event.target.checked,
                    },
                  })
                }
              />
              {ui(option.label)}
            </label>
          ))}
          <div className="muted small-note">
            {t(
              'Enabled chart types stay out of this solve pool. These choices persist when you switch strategies.',
            )}
          </div>
        </fieldset>
      )}

      <RewardWeights
        weights={state.weights}
        overridden={!!activeStrategy}
        onChange={(key, value) => onPatch({ weights: { ...state.weights, [key]: value } })}
      />
    </>
  )
}
