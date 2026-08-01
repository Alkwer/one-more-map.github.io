import { useCallback, useEffect, useState } from 'react'
import { ALL_GOOD_MODS_REGEX } from '../data/strategies'
import { BorderRollResearch } from './BorderRollResearch'
import { generateDemoCharts } from '../logic/demo'
import { parseBorderOcrPayload } from '../logic/borderOcr'
import { isChartClipboardText, parseChartText } from '../logic/parser'
import type { AppState } from '../logic/storage'
import { decodeStateJson, defaultState, serializeState } from '../logic/storage'
import type { ChartData } from '../types'

interface Props {
  onImport: (charts: ChartData[]) => void
  state: AppState
  onLoadState: (state: AppState) => void
}

export function ImportPanel({ onImport, state, onLoadState }: Props) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  const doParse = useCallback(
    (raw?: string) => {
      const source = raw ?? text
      const borderOcr = parseBorderOcrPayload(source)
      const { charts, rejected, unresolved } = parseChartText(borderOcr.chartText)
      const notCharted = rejected.filter((r) => r.reason.startsWith('not charted'))
      const hasOcrPayload = borderOcr.blockCount > 0 || borderOcr.rerollCostBlockCount > 0
      if (charts.length === 0 && rejected.length === 0 && !hasOcrPayload) {
        setMsg('No items recognised. Is this Ctrl+C item text?')
        return
      }

      if (hasOcrPayload) {
        // A complete importer sweep is a snapshot of all 12 current rolls.
        // Start clean so an OCR miss cannot leave a stale modifier from an
        // earlier run and masquerade as a wrongly recognized border.
        const borders = borderOcr.blockCount >= 12 ? [...borderOcr.borders] : [...state.borders]
        for (const match of borderOcr.matches) borders[match.index] = match.id
        onLoadState({
          ...state,
          pool: charts.length > 0 ? [...state.pool, ...charts] : state.pool,
          borders,
          borderRerollsUsed: borderOcr.rerollCost?.rerollsUsed ?? state.borderRerollsUsed,
        })
      } else if (charts.length > 0) {
        onImport(charts)
      }
      if (charts.length > 0 || hasOcrPayload) {
        setText('')
      }

      const parts: string[] = []
      if (charts.length)
        parts.push(`Imported ${charts.length} chart${charts.length === 1 ? '' : 's'}`)
      if (unresolved.length) {
        parts.push(
          `needs shape confirmation: ${unresolved
            .map(({ name, reason }) => `"${name}" (${reason})`)
            .join(', ')}`,
        )
      }
      if (borderOcr.blockCount > 0) {
        parts.push(
          `matched ${borderOcr.matches.length}/${borderOcr.blockCount} border modifier${
            borderOcr.blockCount === 1 ? '' : 's'
          }`,
        )
      }
      if (borderOcr.rerollCost) {
        parts.push(
          `reroll cost ${borderOcr.rerollCost.cost.toLocaleString('en-US')} (${borderOcr.rerollCost.rerollsUsed}/5 used)`,
        )
      } else if (borderOcr.rerollCostBlockCount > 0) {
        parts.push('OCR could not match the border reroll cost')
      }
      if (notCharted.length)
        parts.push(
          `skipped ${notCharted.length} uncharted (run them first to reveal their modifier)`,
        )
      const otherRejects = rejected.filter((r) => !r.reason.startsWith('not charted'))
      if (otherRejects.length) {
        parts.push(
          `skipped: ${otherRejects.map(({ name, reason }) => `"${name}" (${reason})`).join(', ')}`,
        )
      }
      if (borderOcr.misses.length > 0) {
        parts.push(
          `OCR unmatched at border${borderOcr.misses.length === 1 ? '' : 's'} ${borderOcr.misses
            .map((miss) => miss.index + 1)
            .join(', ')}`,
        )
      }
      setMsg(parts.join('; ') || 'Nothing imported')
    },
    [onImport, onLoadState, state, text],
  )

  // Ctrl+V anywhere on the page: if the clipboard holds chart or border text, import
  // it straight away (no need to focus the box). Normal pastes into fields are
  // untouched because only supported import text is intercepted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const clip = e.clipboardData?.getData('text') ?? ''
      if (!isChartClipboardText(clip) && !/===\s*VOYAGE (?:BORDER|REROLL COST)/i.test(clip)) return
      e.preventDefault()
      doParse(clip)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [doParse])

  const exportJson = () => {
    const blob = new Blob([serializeState(state, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'voyage-solver-state.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (file: File) => {
    try {
      const decoded = decodeStateJson(await file.text())
      if (!decoded.ok) {
        setMsg(`Invalid or incompatible state file: ${decoded.message}`)
        return
      }
      onLoadState(decoded.state)
      setMsg(
        decoded.warnings.length > 0
          ? `State loaded from JSON with ${decoded.warnings.length} compatibility adjustment${
              decoded.warnings.length === 1 ? '' : 's'
            }`
          : 'State loaded from JSON',
      )
    } catch {
      setMsg('Invalid or incompatible state file: file could not be read')
    }
  }

  const clearAll = () => {
    if (window.confirm('Clear all charts, board and borders?')) onLoadState(defaultState())
  }

  return (
    <section className="import-panel" aria-labelledby="import-title">
      <h2 id="import-title" className="panel-title">
        Import
      </h2>
      <label className="sr-only" htmlFor="chart-import-text">
        Chart or border import text
      </label>
      <textarea
        id="chart-import-text"
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
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importJson(file)
              e.target.value = ''
            }}
          />
        </label>
        <button onClick={clearAll} title="Clear all charts, board and borders">
          Reset
        </button>
      </div>
      {msg && (
        <div className="muted pad" role="status" aria-live="polite" aria-atomic="true">
          {msg}
        </div>
      )}

      <details className="ahk-help">
        <summary>🎲 Rolling & keeping charts (Milky's regexes)</summary>
        <p className="muted">
          Charts can't be rolled after running, so roll first (quantity scales strongboxes). Paste
          these into the in-game chart search - from Milky's sheet.
        </p>
        <div className="roll-regex-row">
          <span className="roll-regex-label">All good mods (keepers)</span>
          <input
            aria-label="All good modifiers keeper regex"
            readOnly
            value={ALL_GOOD_MODS_REGEX}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="roll-regex-row">
          <span className="roll-regex-label">120%+ quantity roll</span>
          <input
            aria-label="120 percent or greater quantity regex"
            readOnly
            value={'"m q.*(1[2-9].|[2-9]..)%"'}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="roll-regex-row">
          <span className="roll-regex-label">75%+ sulphur (save for Filthscrabble)</span>
          <input
            aria-label="75 percent or greater sulphur regex"
            readOnly
            value={'"sul.*(7[5-9]|[89].|\\d..)%"'}
            onFocus={(e) => e.target.select()}
          />
        </div>
      </details>

      <details className="ahk-help">
        <summary>🖱️ Bulk-import charts + board borders from PoE (Windows OCR)</summary>
        <p className="muted">
          A self-contained AutoHotkey script copies every chart, reads all 12 board-border tooltips
          with Windows OCR, and pastes everything here in one go. OCR stays on your PC; no
          screenshots are uploaded.
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
            Double-click the script. For quick board calibration, point at the{' '}
            <strong>top-left corner of the border-modifier square</strong> and press <kbd>F5</kbd>;
            then point at its <strong>bottom-right corner</strong> and press <kbd>F6</kbd>.
          </li>
          <li>
            If any border is missed, press <kbd>Ctrl+F5</kbd> to start exact calibration. Hover the
            modifier named by the script and press <kbd>Ctrl+F6</kbd> to save it; repeat for all 12.
            Press <kbd>Ctrl+F4</kbd> to preview the saved positions without running OCR.
          </li>
          <li>
            Hover the <strong>compass-shaped border reroll button</strong> so its cost tooltip is
            visible, then press <kbd>Ctrl+F7</kbd>. This lets each scan read the next reroll cost
            and synchronize the solver's reroll counter automatically.
          </li>
          <li>
            For chart import, hover the <strong>top-left</strong> chart and press <kbd>F7</kbd>;
            hover the <strong>bottom-right</strong> cell of the chart grid and press <kbd>F8</kbd>.
            (Edit GridCols/GridRows if your panel isn't 6×10.)
          </li>
          <li>
            <kbd>F9</kbd> copies the charts, scans the 12 borders, and imports both ·{' '}
            <kbd>Ctrl+F9</kbd> refreshes only the 12 borders after a reroll, without rescanning
            charts, and also reads the calibrated reroll-cost tooltip · <kbd>F10</kbd> aborts.
            Border OCR can take around 15–30 seconds on a 4K screen.
          </li>
        </ol>
        <p className="muted small">
          If PoE runs as administrator, run the script as administrator too, or its keypresses won't
          reach the game. Don't touch the mouse or keyboard while it's running.
        </p>
      </details>

      <BorderRollResearch borders={state.borders} />
    </section>
  )
}
