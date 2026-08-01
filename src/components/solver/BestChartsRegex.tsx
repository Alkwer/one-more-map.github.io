interface Props {
  regex: string
  includedCount: number
  regexCap: number
  copied: boolean
  onCopy: () => void
  onRegexCapChange: (cap: number) => void
}

export function BestChartsRegex(props: Props) {
  return (
    <>
      <h4 className="panel-title small">Best-Charts Regex</h4>
      <div className="muted small-note" style={{ marginTop: 0 }}>
        Paste into the in-game chart search to highlight charts worth taking, based on your weights
        above. No import needed. Experimental: the in-game search may or may not support this
        syntax, we'll see once live.
      </div>
      <div className="regex-row">
        <input
          aria-label="Best charts regex"
          readOnly
          value={props.regex}
          onFocus={(event) => event.target.select()}
        />
        <button onClick={props.onCopy}>{props.copied ? '✓' : 'Copy'}</button>
      </div>
      <div className="regex-meta">
        <span className="muted">
          {props.includedCount} mods · {props.regex.length} chars
        </span>
        <span className="spacer" />
        <label className="muted">
          max{' '}
          <select
            value={props.regexCap}
            onChange={(event) => props.onRegexCapChange(parseInt(event.target.value, 10))}
          >
            <option value={50}>50</option>
            <option value={250}>250</option>
          </select>
        </label>
      </div>
    </>
  )
}
