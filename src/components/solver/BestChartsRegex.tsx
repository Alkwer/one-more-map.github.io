import { t, ui } from '../../i18n/locale'
import type { SearchClientLanguage } from '../../logic/regex'

interface Props {
  regex: string
  includedCount: number
  regexCap: number
  language: SearchClientLanguage
  supported: boolean
  unsupportedMessage: string
  copied: boolean
  onCopy: () => void
  onRegexCapChange: (cap: number) => void
  onLanguageChange: (language: SearchClientLanguage) => void
}

export function BestChartsRegex(props: Props) {
  return (
    <>
      <h4 className="panel-title small">{t('Best-Charts Regex')}</h4>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        {props.supported
          ? t(
              'Paste into the in-game chart search to highlight charts worth taking, based on your weights above. English client only; verify the highlighted Charts before acting.',
            )
          : ui(props.unsupportedMessage)}
      </div>
      <div className="regex-row">
        <input
          aria-label={t('Best charts regex')}
          readOnly
          value={props.regex}
          onFocus={(event) => event.target.select()}
        />
        <button onClick={props.onCopy} disabled={!props.supported || !props.regex}>
          {props.copied ? '✓' : t('Copy')}
        </button>
      </div>
      <div className="regex-meta">
        <span className="muted">
          {props.supported
            ? t('{v0} mods · {v1} chars', { v0: props.includedCount, v1: props.regex.length })
            : t('Unavailable for this client language')}
        </span>
        <span className="spacer" />
        <label className="muted">
          {t('client')}{' '}
          <select
            aria-label={t('Search client language')}
            value={props.language}
            onChange={(event) => props.onLanguageChange(event.target.value as SearchClientLanguage)}
          >
            <option value="en">{t('English')}</option>
            <option value="ko">{t('Korean (unavailable)')}</option>
          </select>
        </label>
        <label className="muted">
          {t('max')}{' '}
          <select
            value={props.regexCap}
            disabled={!props.supported}
            onChange={(event) => props.onRegexCapChange(parseInt(event.target.value, 10))}
          >
            <option value={250}>250</option>
            <option value={50}>{t('50 (conservative)')}</option>
          </select>
        </label>
      </div>
    </>
  )
}
