import { useCallback, useEffect, useState } from 'react'
import { generateDemoCharts } from '../logic/demo'
import { parseBorderOcrPayload } from '../logic/borderOcr'
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

  const doParse = useCallback((raw?: string) => {
    const source = raw ?? text
    const borderOcr = parseBorderOcrPayload(source)
    const { charts, rejected } = parseChartText(borderOcr.chartText)
    const notCharted = rejected.filter((r) => r.reason.startsWith('not charted'))
    if (charts.length === 0 && rejected.length === 0 && borderOcr.blockCount === 0) {
      setMsg('No items recognised. Is this Ctrl+C item text?')
      return
    }

    if (borderOcr.matches.length > 0) {
      const borders = [...state.borders]
      for (const match of borderOcr.matches) borders[match.index] = match.id
      onLoadState({
        ...state,
        pool: charts.length > 0 ? [...state.pool, ...charts] : state.pool,
        borders,
      })
    } else if (charts.length > 0) {
      onImport(charts)
    }
    if (charts.length > 0 || borderOcr.blockCount > 0) {
      setText('')
    }

    const parts: string[] = []
    if (charts.length) parts.push(`Imported ${charts.length} chart${charts.length === 1 ? '' : 's'}`)
    if (borderOcr.blockCount > 0) {
      parts.push(
        `matched ${borderOcr.matches.length}/${borderOcr.blockCount} border modifier${
          borderOcr.blockCount === 1 ? '' : 's'
        }`,
      )
    }
    if (notCharted.length)
      parts.push(
        `skipped ${notCharted.length} uncharted (run them first to reveal their modifier)`,
      )
    const otherRejects = rejected.length - notCharted.length
    if (otherRejects > 0) parts.push(`skipped ${otherRejects} unrecognised`)
    if (borderOcr.misses.length > 0) {
      parts.push(`OCR unmatched at border${borderOcr.misses.length === 1 ? '' : 's'} ${borderOcr.misses
        .map((miss) => miss.index + 1)
        .join(', ')}`)
    }
    setMsg(parts.join('; ') || 'Nothing imported')
  }, [onImport, onLoadState, state, text])

  // Ctrl+V anywhere on the page: if the clipboard holds chart item text, import
  // it straight away (no need to focus the box). Normal pastes into fields are
  // untouched because only chart-shaped text is intercepted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const clip = e.clipboardData?.getData('text') ?? ''
      if (!/Item Class:\s*Chart|===\s*VOYAGE BORDER/i.test(clip)) return
      e.preventDefault()
      doParse(clip)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [doParse])

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
        placeholder={
          'Copy a chart in game (Ctrl+C), then press Ctrl+V anywhere on this page to import it. The Windows bulk importer also fills all 12 border modifiers with local OCR.'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="import-actions">
        <button onClick={() => doParse()} disabled={!text.trim()}>
          Parse & Add
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
        <button onClick={exportJson} title="Save your charts to a JSON file">
          Export
        </button>
        <label className="file-btn" title="Load charts from a JSON file">
          Load
          <input
            type="file"
            accept=".json"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
        </label>
        <button onClick={clearAll} title="Clear all charts, board and borders">
          Reset
        </button>
      </div>
      {msg && <div className="muted pad">{msg}</div>}

      <details className="ahk-help">
        <summary>🖱️ Bulk-import charts + board borders from PoE (Windows OCR)</summary>
        <p className="muted">
          A self-contained AutoHotkey script copies every chart, reads all 12 board-border
          tooltips with Windows OCR, and pastes everything here in one go. OCR stays on your PC;
          no screenshots are uploaded.
        </p>
        <a className="ahk-dl" href={`${import.meta.env.BASE_URL}voyage-import.ahk`} download>
          ⬇ Download voyage-import.ahk
        </a>
        <ol className="ahk-steps">
          <li>
            Install{' '}
            <a href="https://www.autohotkey.com/" target="_blank" rel="noopener noreferrer">
              AutoHotkey v2
            </a>{' '}
            (Windows only).
          </li>
          <li>
            In PoE (Windowed or Windowed Fullscreen), open the Voyage board so your chart panel is
            fully visible and not scrolled.
          </li>
          <li>
            Keep this tab open - the script finds it by its title, <em>Allflame Voyage Solver</em>.
            Click once on this page first so it has focus.
          </li>
          <li>
            Double-click the script. For board OCR, hover the <strong>top border modifier above the
            top-left board square</strong> and press <kbd>F5</kbd>; then hover the{' '}
            <strong>bottom border modifier below the bottom-right square</strong> and press{' '}
            <kbd>F6</kbd>.
          </li>
          <li>
            For chart import, hover the <strong>top-left</strong> chart and press <kbd>F7</kbd>;
            hover the <strong>bottom-right</strong> cell of the chart grid and press{' '}
            <kbd>F8</kbd>. (Edit GridCols/GridRows if your panel isn't 6×10.)
          </li>
          <li>
            <kbd>F9</kbd> copies the charts, scans the 12 borders, and imports both ·{' '}
            <kbd>F10</kbd> aborts. Border OCR can take around 15–30 seconds on a 4K screen.
          </li>
        </ol>
        <p className="muted small">
          If PoE runs as administrator, run the script as administrator too, or its keypresses
          won't reach the game. Don't touch the mouse or keyboard while it's running.
        </p>
      </details>
    </div>
  )
}
