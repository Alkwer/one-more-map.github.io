import { ALL_GOOD_MODS_REGEX } from '../data/strategies'
import { t } from '../i18n/locale'

export function RollingChartHelp() {
  return (
    <>
      <p className="muted">
        {t(
          "Charts can't be rolled after running, so roll first (quantity scales strongboxes). Paste these into the in-game chart search - from Milky's sheet.",
        )}
      </p>
      <div className="roll-regex-row">
        <span className="roll-regex-label">{t('All good mods (keepers)')}</span>
        <input
          aria-label={t('All good modifiers keeper regex')}
          readOnly
          value={ALL_GOOD_MODS_REGEX}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <div className="roll-regex-row">
        <span className="roll-regex-label">{t('120%+ quantity roll')}</span>
        <input
          aria-label={t('120 percent or greater quantity regex')}
          readOnly
          value={'"m q.*(1[2-9].|[2-9]..)%"'}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <div className="roll-regex-row">
        <span className="roll-regex-label">{t('75%+ sulphur (save for Filthscrabble)')}</span>
        <input
          aria-label={t('75 percent or greater sulphur regex')}
          readOnly
          value={'"sul.*(7[5-9]|[89].|\\d..)%"'}
          onFocus={(e) => e.target.select()}
        />
      </div>
    </>
  )
}
