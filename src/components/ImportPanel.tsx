import { useState } from 'react'
import { generateDemoCharts } from '../logic/demo'
import { parseChartText } from '../logic/parser'
import type { AppState } from '../logic/storage'
import { defaultState } from '../logic/storage'
import type { ChartData } from '../types'

interface Props {
  onImport: (charts: ChartData[]) => void
  state: AppState
  onLoadState: (s: AppState) => void
}

export function ImportPanel({ onImport, state, onLoadState }: Props) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  const doParse = () => {
    const { charts, unmatched } = parseChartText(text)
    if (charts.length === 0) {
      setMsg('No items recognised — is this Ctrl+C item text?')
      return
    }
    onImport(charts)
    setText('')
    setMsg(
      `Imported ${charts.length} chart${charts.length === 1 ? '' : 's'}` +
        (unmatched.length ? ` (${unmatched.length} unrecognised mod line${unmatched.length === 1 ? '' : 's'} kept as raw text)` : ''),
    )
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'voyage-solver-state.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = (file: File) => {
    file.text().then((t) => {
      try {
        onLoadState({ ...defaultState(), ...JSON.parse(t) })
        setMsg('State loaded from JSON')
      } catch {
        setMsg('Invalid JSON file')
      }
    })
  }

  const clearAll = () => {
    if (window.confirm('Clear all charts, board and borders?')) onLoadState(defaultState())
  }

  return (
    <div className="import-panel">
      <div className="panel-title">Import</div>
      <textarea
        rows={5}
        placeholder={'Paste chart item text from the game (Ctrl+C on a chart).\nFormat is a launch-day guess — see RESEARCH.md.'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button onClick={doParse} disabled={!text.trim()}>
          Parse & add
        </button>
        <button
          title="Generate random charts to try out the tool"
          onClick={() => {
            onImport(generateDemoCharts(25))
            setMsg('Added 25 random demo charts')
          }}
        >
          🎲 Demo ×25
        </button>
        <span className="spacer" />
        <button onClick={exportJson}>Export JSON</button>
        <label className="file-btn">
          Load JSON
          <input
            type="file"
            accept=".json"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
        </label>
        <button onClick={clearAll}>Reset</button>
      </div>
      {msg && <div className="muted pad">{msg}</div>}
    </div>
  )
}
