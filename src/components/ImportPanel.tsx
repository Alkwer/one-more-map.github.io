import { useCallback, useEffect, useState } from 'react'
import { ALL_GOOD_MODS_REGEX, RARE_IMPLICITS } from '../data/strategies'
import { BorderRollResearch, type ProtectedBorderRoll } from './BorderRollResearch'
import { generateDemoCharts } from '../logic/demo'
import { applyBorderOcrSnapshot, parseBorderOcrPayload } from '../logic/borderOcr'
import { isChartClipboardText, parseChartText } from '../logic/parser'
import { chartAdditionResult, type ChartAdditionResult } from '../logic/chartCapacity'
import {
  assertImportWithinBudget,
  importSizeLimitMessage,
  isImportBudgetError,
  MAX_IMPORT_REJECTIONS,
  MAX_IMPORT_SIGNATURE_PREFIX_LENGTH,
  MAX_IMPORT_TEXT_LENGTH,
} from '../logic/importBudget'
import type { AppState } from '../logic/storage'
import {
  decodeStateFile,
  defaultState,
  MAX_POOL_CHARTS,
  serializeState,
  validateStateForPersistence,
} from '../logic/storage'
import type { BorderRollResearchController } from '../hooks/useBorderRollResearch'
import type { ChartData } from '../types'

interface Props {
  onImport: (charts: ChartData[]) => ChartAdditionResult
  state: AppState
  borderResearch: BorderRollResearchController
  protectedRoll: ProtectedBorderRoll | null
  onLoadState: (state: AppState) => void
}

function parseImportSource(source: string, maxCharts: number) {
  assertImportWithinBudget(source)
  const borderOcr = parseBorderOcrPayload(source)
  return {
    borderOcr,
    ...parseChartText(borderOcr.chartText, {
      maxCharts,
      maxRejections: MAX_IMPORT_REJECTIONS,
    }),
  }
}

export function ImportPanel({
  onImport,
  state,
  borderResearch,
  protectedRoll,
  onLoadState,
}: Props) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [rareAlert, setRareAlert] = useState('')

  const doParse = useCallback(
    (raw?: string) => {
      const source = raw ?? text
      let parsed: ReturnType<typeof parseImportSource>
      try {
        parsed = parseImportSource(source, MAX_POOL_CHARTS - state.pool.length)
      } catch (error) {
        if (!isImportBudgetError(error)) throw error
        setText('')
        setMsg(error.message)
        return
      }
      const { borderOcr, charts, rejected, unresolved, stoppedEarly } = parsed
      const borderApplication = applyBorderOcrSnapshot(state.borders, borderOcr)
      const notCharted = rejected.filter((r) => r.reason.startsWith('not charted'))
      const hasOcrPayload =
        borderOcr.blockCount > 0 ||
        borderOcr.rerollCostBlockCount > 0 ||
        borderOcr.scanMeta !== null
      const parts: string[] = []
      if (
        charts.length === 0 &&
        rejected.length === 0 &&
        !hasOcrPayload &&
        stoppedEarly?.reason === 'chart-capacity'
      ) {
        setMsg(`Nothing imported because the ${MAX_POOL_CHARTS}-chart library limit was reached.`)
        return
      }
      if (charts.length === 0 && rejected.length === 0 && !hasOcrPayload) {
        setMsg('No items recognised. Is this Ctrl+C item text?')
        return
      }
      let addition = chartAdditionResult(state.pool.length, charts.length)
      let acceptedCharts = charts.slice(0, addition.added)

      const nextState: AppState = {
        ...state,
        pool: acceptedCharts.length > 0 ? [...state.pool, ...acceptedCharts] : state.pool,
        borders: hasOcrPayload ? borderApplication.borders : state.borders,
        borderRerollsUsed:
          hasOcrPayload && borderOcr.rerollCost
            ? borderOcr.rerollCost.rerollsUsed
            : state.borderRerollsUsed,
      }
      const persistence = validateStateForPersistence(nextState)
      if (!persistence.ok) {
        setMsg(`Import was not applied because it could not be saved: ${persistence.message}`)
        return
      }

      if (hasOcrPayload) {
        const borders = borderApplication.borders
        onLoadState(nextState)
        if (borderApplication.status === 'complete') {
          const captureMessage = borderResearch.captureImportedRoll(borders, borderOcr.rerollCost)
          if (captureMessage) parts.push(captureMessage)
        }
      } else if (charts.length > 0) {
        addition = onImport(charts)
        acceptedCharts = charts.slice(0, addition.added)
      }
      if (addition.added > 0 || hasOcrPayload) {
        setText('')
      }

      const rareCount = acceptedCharts.filter((chart) =>
        chart.modIds.some((id) => (RARE_IMPLICITS as readonly string[]).includes(id)),
      ).length
      setRareAlert(
        rareCount > 0
          ? `${rareCount} Rare Monsters chart${rareCount === 1 ? '' : 's'} imported - Divine-strategy fuel! Locked 🔒 in the library until you run a Divine border board.`
          : '',
      )

      if (addition.added > 0)
        parts.push(`Imported ${addition.added} chart${addition.added === 1 ? '' : 's'}`)
      if (addition.skipped > 0) {
        parts.push(
          `skipped ${addition.skipped} because the ${MAX_POOL_CHARTS}-chart library limit was reached`,
        )
      }
      if (stoppedEarly?.reason === 'chart-capacity') {
        parts.push(
          `stopped before ${stoppedEarly.unprocessedItems} additional item${
            stoppedEarly.unprocessedItems === 1 ? '' : 's'
          } because the ${MAX_POOL_CHARTS}-chart library limit was reached`,
        )
      } else if (stoppedEarly?.reason === 'rejection-budget') {
        parts.push(
          `stopped after ${MAX_IMPORT_REJECTIONS} rejected items; ${stoppedEarly.unprocessedItems} additional item${
            stoppedEarly.unprocessedItems === 1 ? '' : 's'
          } were not parsed`,
        )
      }
      // Distinct physical charts have different rolls. A large byte-identical
      // batch usually means the bulk importer's saved grid calibration is off.
      if (acceptedCharts.length >= 5) {
        const key = (chart: ChartData) =>
          JSON.stringify([
            chart.name,
            chart.level,
            chart.modIds,
            chart.implicitText,
            chart.rewards,
            chart.shape,
            chart.rawText,
          ])
        const first = key(acceptedCharts[0])
        if (acceptedCharts.every((chart) => key(chart) === first)) {
          parts.push(
            `⚠ all ${acceptedCharts.length} are identical - if this came from the bulk importer, recalibrate its grid with F7/F8, then reset and re-import`,
          )
        }
      }
      const acceptedUids = new Set(acceptedCharts.map(({ uid }) => uid))
      const acceptedUnresolved = unresolved.filter(({ uid }) => acceptedUids.has(uid))
      if (acceptedUnresolved.length) {
        parts.push(
          `needs shape confirmation: ${acceptedUnresolved
            .map(({ name, reason }) => `"${name}" (${reason})`)
            .join(', ')}`,
        )
      }
      if (borderOcr.blockCount > 0) {
        const expectedBorderCount = borderOcr.scanMeta?.expectedBlockCount ?? borderOcr.blockCount
        parts.push(
          `matched ${borderOcr.matches.length}/${expectedBorderCount} border modifier${
            expectedBorderCount === 1 ? '' : 's'
          }`,
        )
      }
      if (borderApplication.status === 'incomplete') {
        parts.push(
          `border scan incomplete (${borderOcr.uniqueBlockCount}/12 positions); kept existing borders`,
        )
      } else if (borderApplication.status === 'failed') {
        parts.push('no border tooltips recognised; kept existing borders')
      } else if (borderApplication.status === 'partial') {
        parts.push('cleared unmatched border positions from the complete scan')
      }
      if (borderOcr.ocrLanguages.length > 0) {
        parts.push(`OCR language ${borderOcr.ocrLanguages.join(', ')}`)
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
      if (borderOcr.misses.length > 0 && borderApplication.status !== 'failed') {
        parts.push(
          `OCR unmatched at border${borderOcr.misses.length === 1 ? '' : 's'} ${borderOcr.misses
            .map((miss) => miss.index + 1)
            .join(', ')}`,
        )
      }
      setMsg(parts.join('; ') || 'Nothing imported')
    },
    [borderResearch, onImport, onLoadState, state, text],
  )

  // Ctrl+V anywhere on the page: if the clipboard holds chart or border text, import
  // it straight away (no need to focus the box). Normal pastes into fields are
  // untouched because only supported import text is intercepted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const clip = e.clipboardData?.getData('text') ?? ''
      const signaturePrefix = clip.slice(0, MAX_IMPORT_SIGNATURE_PREFIX_LENGTH)
      if (
        !isChartClipboardText(signaturePrefix) &&
        !/===\s*VOYAGE (?:BORDER|REROLL COST)/i.test(signaturePrefix)
      )
        return
      e.preventDefault()
      doParse(clip)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [doParse])

  const exportJson = () => {
    try {
      const blob = new Blob([serializeState(state, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'voyage-solver-state.json'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (error) {
      setMsg(
        `State could not be exported: ${error instanceof Error ? error.message : 'serialization failed'}`,
      )
    }
  }

  const importJson = async (file: File) => {
    try {
      const decoded = await decodeStateFile(file)
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
        onChange={(e) => {
          const nextText = e.target.value
          if (nextText.length > MAX_IMPORT_TEXT_LENGTH) {
            setText('')
            setMsg(importSizeLimitMessage())
            return
          }
          setText(nextText)
        }}
      />
      <div className="import-actions">
        <button onClick={() => doParse()} disabled={!text.trim()}>
          Parse & Add
        </button>
        <button
          title="Generate random charts to try out the tool"
          onClick={() => {
            const result = onImport(generateDemoCharts(25))
            const parts = [
              `Added ${result.added} random demo chart${result.added === 1 ? '' : 's'}`,
            ]
            if (result.skipped > 0) {
              parts.push(
                `skipped ${result.skipped} because the ${MAX_POOL_CHARTS}-chart library limit was reached`,
              )
            }
            setMsg(parts.join('; '))
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
      {rareAlert && (
        <div className="import-rare-alert">
          <span>🎰 {rareAlert}</span>
          <button className="announce-close" title="Dismiss" onClick={() => setRareAlert('')}>
            ✕
          </button>
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
          A self-contained AutoHotkey script copies every chart from both chart-stash tabs, reads
          all 12 board-border tooltips with Windows OCR, opens this trusted solver page, and pastes
          one combined payload automatically. If the browser cannot be opened and focused, the
          payload stays on your clipboard for a manual Ctrl+V. OCR stays on your PC and no
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
            Double-click the script. There is no browser or game binding: the helper opens this
            solver URL through your default browser and authenticates the foreground PoE window
            whenever a calibration or scan hotkey is pressed. No setup shortcut is required.
          </li>
          <li>
            Keep the real Path of Exile window focused while calibrating. Positions are saved
            relative to its client area, so moving the game between monitors no longer moves clicks
            back to the old screen. Existing screen-based calibration is cleared once; recalibrate
            the points below after updating the script.
          </li>
          <li>
            For quick board calibration, point at the{' '}
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
            For chart import, calibrate the shared grid: hover the <strong>top-left</strong> chart
            slot and press <kbd>F7</kbd>, then hover the <strong>bottom-right</strong> slot and
            press <kbd>F8</kbd>. Next, hover chart-stash tab <strong>1</strong> and press{' '}
            <kbd>Shift+F7</kbd>, then hover tab <strong>2</strong> and press <kbd>Shift+F8</kbd>.
            (Edit GridCols/GridRows if your panel isn't 6×10.)
          </li>
          <li>
            <kbd>F9</kbd> switches through both chart-stash tabs, copies their charts, and scans the
            12 borders · <kbd>Ctrl+F9</kbd> refreshes only the 12 borders after a reroll, without
            rescanning charts, and also reads the calibrated reroll-cost tooltip. Both commands open
            the solver in the default browser, activate its window without a saved mouse click, and
            paste automatically. If opening or activation fails, the payload stays on the clipboard
            for a manual <kbd>Ctrl+V</kbd>. <kbd>F10</kbd> aborts. Border OCR can take around 15–30
            seconds on a 4K screen.
          </li>
        </ol>
        <p className="muted small">
          If PoE runs as administrator, run the script as administrator too, or its keypresses won't
          reach the game. Don't touch the mouse or keyboard while it's running.
        </p>
      </details>

      <BorderRollResearch
        borders={state.borders}
        controller={borderResearch}
        protectedRoll={protectedRoll}
      />
    </section>
  )
}
