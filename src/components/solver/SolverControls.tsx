import type { StrategyDef } from '../../data/strategies'
import type { AdjacencyMode } from '../../logic/scoring'
import type { AppState } from '../../logic/storage'
import type { ConnectivityMode } from '../../types'
import { RewardWeights } from './RewardWeights'

interface Props {
  state: AppState
  activeStrategy: StrategyDef | null
  onPatch: (patch: Partial<AppState>) => void
}

export function SolverControls({ state, activeStrategy, onPatch }: Props) {
  return (
    <>
      <div className="field">
        <label htmlFor="connector-rule">Connector rule</label>
        <select
          id="connector-rule"
          value={state.mode}
          onChange={(event) => onPatch({ mode: event.target.value as ConnectivityMode })}
        >
          <option value="strict">Connectors must line up (real rule)</option>
          <option value="any">Ignore connectors (experiment)</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.allowRotation}
          onChange={(event) => onPatch({ allowRotation: event.target.checked })}
        />
        Charts can be rotated
      </label>

      <div className="field">
        <label htmlFor="adjacency-mode">Adjacent modifiers reach</label>
        <select
          id="adjacency-mode"
          value={state.adjacencyMode}
          onChange={(event) => onPatch({ adjacencyMode: event.target.value as AdjacencyMode })}
        >
          <option value="physical">Any neighbouring area</option>
          <option value="connected">Only connected neighbours</option>
        </select>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={state.adjacentAffectsSelf}
          onChange={(event) => onPatch({ adjacentAffectsSelf: event.target.checked })}
        />
        Adjacent modifiers also affect their own area
      </label>

      {activeStrategy && (
        <div className="strat-override-note">
          ⚑ <strong>{activeStrategy.name}</strong> is steering the solver - your manual weights
          below are ignored while it's active.
        </div>
      )}

      <RewardWeights
        weights={state.weights}
        overridden={!!activeStrategy}
        onChange={(key, value) => onPatch({ weights: { ...state.weights, [key]: value } })}
      />
    </>
  )
}
