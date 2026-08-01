import type { ConnectivityResult } from '../../logic/connectivity'
import type { ConnectivityMode } from '../../types'

interface ModCount {
  self: number
  adjacent: number
  global: number
  total: number
}

interface Props {
  mode: ConnectivityMode
  connectivity: ConnectivityResult
  modCount: ModCount
}

export function VoyageBoardStatus({ mode, connectivity, modCount }: Props) {
  return (
    <>
      <div
        className={`conn-status ${
          mode === 'any'
            ? ''
            : connectivity.fullyReachable
              ? 'ok'
              : connectivity.launchable
                ? 'warn'
                : 'bad'
        }`}
      >
        {mode === 'any'
          ? 'Connector rules ignored'
          : connectivity.fullyReachable
            ? '✓ All 9 charts reachable from the ⚓ start'
            : connectivity.launchable
              ? `⚠ Voyage can start, but ${connectivity.unreachable} chart${
                  connectivity.unreachable === 1 ? ' is' : 's are'
                } unreachable from the ⚓ start`
              : [
                  connectivity.mismatches > 0
                    ? `✗ ${connectivity.mismatches} connector mismatch${
                        connectivity.mismatches === 1 ? '' : 'es'
                      }`
                    : null,
                  connectivity.unfilled > 0
                    ? `${connectivity.unfilled} empty square${
                        connectivity.unfilled === 1 ? '' : 's'
                      } (all 9 must be filled)`
                    : null,
                  connectivity.unreachable > 0
                    ? `${connectivity.unreachable} chart${
                        connectivity.unreachable === 1 ? '' : 's'
                      } unreachable from the ⚓ start`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
      </div>

      {modCount.total > 0 && (
        <div className="modcount">
          <span className="modcount-title">Voyage Mod Count</span>
          <span className="modcount-item scope-self">This area {modCount.self}</span>
          <span className="modcount-item scope-adjacent">Adjacent {modCount.adjacent}</span>
          <span className="modcount-item scope-global">Whole voyage {modCount.global}</span>
          <span className="modcount-item modcount-conn">
            🔗 {connectivity.connections} connections
          </span>
        </div>
      )}
    </>
  )
}
