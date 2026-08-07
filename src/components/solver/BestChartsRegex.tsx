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
      <h4 className="panel-title small">Best-Charts Regex</h4>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        {props.supported
          ? 'Paste into the in-game chart search to highlight charts worth taking, based on your weights above. English client only; verify the highlighted Charts before acting.'
          : props.unsupportedMessage}
      </div>
      <div className="regex-row">
        <input
          aria-label="Best charts regex"
          readOnly
          value={props.regex}
          onFocus={(event) => event.target.select()}
        />
        <button onClick={props.onCopy} disabled={!props.supported || !props.regex}>
          {props.copied ? '✓' : 'Copy'}
        </button>
      </div>
      <div className="regex-meta">
        <span className="muted">
          {props.supported
            ? `${props.includedCount} mods · ${props.regex.length} chars`
            : 'Unavailable for this client language'}
        </span>
        <span className="spacer" />
        <label className="muted">
          client{' '}
          <select
            aria-label="Search client language"
            value={props.language}
            onChange={(event) => props.onLanguageChange(event.target.value as SearchClientLanguage)}
          >
            <option value="en">English</option>
            <option value="ko">Korean (unavailable)</option>
          </select>
        </label>
        <label className="muted">
          max{' '}
          <select
            value={props.regexCap}
            disabled={!props.supported}
            onChange={(event) => props.onRegexCapChange(parseInt(event.target.value, 10))}
          >
            <option value={250}>250</option>
            <option value={50}>50 (conservative)</option>
          </select>
        </label>
      </div>
    </>
  )
}
