import { formatNumber, t, ui } from '../../i18n/locale'
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
          ? t('Connector rules ignored')
          : connectivity.fullyReachable
            ? t('✓ All 9 charts reachable from the ⚓ start')
            : connectivity.launchable
              ? t('⚠ Voyage can start, but {v0} chart{v1} unreachable from the ⚓ start', {
                  v0: connectivity.unreachable,
                  v1: connectivity.unreachable === 1 ? ' is' : 's are',
                })
              : ui(
                  [
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
                    .join(' · '),
                )}
      </div>

      {modCount.total > 0 && (
        <div className="modcount">
          <span className="modcount-title">{t('Voyage Mod Count')}</span>
          <span className="modcount-item scope-self">
            {t('This area ')}
            {formatNumber(modCount.self)}
          </span>
          <span className="modcount-item scope-adjacent">
            {t('Adjacent ')}
            {formatNumber(modCount.adjacent)}
          </span>
          <span className="modcount-item scope-global">
            {t('Whole voyage ')}
            {formatNumber(modCount.global)}
          </span>
          <span className="modcount-item modcount-conn">
            🔗 {formatNumber(connectivity.connections)}
            {t(' connections')}
          </span>
        </div>
      )}
    </>
  )
}
