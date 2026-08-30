import { formatNumber, joinMessages, message, t, type UiMessage, ui } from '../i18n/locale'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ALL_GOOD_MODS_REGEX, RARE_IMPLICITS } from '../data/strategies'
import type { ProtectedBorderRoll } from './BorderRollResearch'
import { DeferredBorderRollResearch } from './DeferredBorderRollResearch'
import { generateDemoCharts } from '../logic/demo'
import {
  ImportWorkerClient,
  ImportWorkerError,
  isImportWorkerRequestCancelled,
} from '../logic/importWorkerClient'
import { dedupeNewCharts } from '../logic/importDedupe'
import { isChartClipboardText } from '../logic/chartClipboard'
import { chartAdditionResult, type ChartAdditionResult } from '../logic/chartCapacity'
import {
  importSizeLimitMessage,
  MAX_IMPORT_REJECTIONS,
  MAX_IMPORT_SIGNATURE_PREFIX_LENGTH,
  MAX_IMPORT_TEXT_LENGTH,
} from '../logic/importLimits'
import type { AppState } from '../state/appState'
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

export function ImportPanel({
  onImport,
  state,
  borderResearch,
  protectedRoll,
  onLoadState,
}: Props) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<UiMessage>('')
  const [rareAlert, setRareAlert] = useState('')
  const [parsing, setParsing] = useState(false)
  const stateRef = useRef(state)
  const importClientRef = useRef<ImportWorkerClient | null>(null)
  const parseSequenceRef = useRef(0)
  stateRef.current = state

  const cancelPendingImport = useCallback(() => {
    parseSequenceRef.current += 1
    importClientRef.current?.cancel()
  }, [])

  useEffect(
    () => () => {
      cancelPendingImport()
    },
    [cancelPendingImport],
  )

  const doParse = useCallback(
    async (raw?: string) => {
      const source = raw ?? text
      const requestSequence = parseSequenceRef.current + 1
      parseSequenceRef.current = requestSequence
      importClientRef.current?.cancel()

      if (source.length > MAX_IMPORT_TEXT_LENGTH) {
        setParsing(false)
        setText('')
        setMsg(importSizeLimitMessage())
        return
      }

      setParsing(true)
      setMsg('Parsing import…')
      setRareAlert('')
      const client = importClientRef.current ?? new ImportWorkerClient()
      importClientRef.current = client

      const importRequest = Promise.all([
        // Parse the complete bounded inventory before deduplication. Limiting
        // this to remaining capacity could stop on re-scans before reaching a
        // genuinely new chart later in the same sweep.
        client.parse(source, MAX_POOL_CHARTS),
        import('../logic/borderOcr'),
      ] as const)
      let parsedWithHelpers: Awaited<typeof importRequest>
      try {
        parsedWithHelpers = await importRequest
      } catch (error) {
        if (requestSequence !== parseSequenceRef.current) return
        setParsing(false)
        if (isImportWorkerRequestCancelled(error)) return
        if (error instanceof ImportWorkerError && error.code === 'budget') {
          setText('')
          setMsg(error.message)
          return
        }
        setMsg(
          message('Import could not be parsed: {v0}', {
            v0: error instanceof Error ? error.message : 'worker failed',
          }),
        )
        return
      }

      if (requestSequence !== parseSequenceRef.current) return
      setParsing(false)
      const [parsed, { applyBorderOcrStateSnapshot }] = parsedWithHelpers
      const currentState = stateRef.current
      const { borderOcr, charts, rejected, unresolved, stoppedEarly } = parsed
      const { fresh, skipped: rescanned } = dedupeNewCharts(currentState.pool, charts)
      const borderApplication = applyBorderOcrStateSnapshot(
        currentState.borders,
        currentState.borderRerollsUsed,
        borderOcr,
      )
      const notCharted = rejected.filter((r) => r.reason.startsWith('not charted'))
      const hasOcrPayload =
        borderOcr.blockCount > 0 ||
        borderOcr.rerollCostBlockCount > 0 ||
        borderOcr.scanMeta !== null
      const parts: UiMessage[] = []
      if (
        charts.length === 0 &&
        rejected.length === 0 &&
        !hasOcrPayload &&
        stoppedEarly?.reason === 'chart-capacity'
      ) {
        setMsg(
          message('Nothing imported because the {v0}-chart library limit was reached.', {
            v0: MAX_POOL_CHARTS,
          }),
        )
        return
      }
      if (charts.length === 0 && rejected.length === 0 && !hasOcrPayload) {
        setMsg('No items recognised. Is this Ctrl+C item text?')
        return
      }
      let addition = chartAdditionResult(currentState.pool.length, fresh.length)
      let acceptedCharts = fresh.slice(0, addition.added)

      const nextState: AppState = {
        ...currentState,
        pool:
          acceptedCharts.length > 0 ? [...currentState.pool, ...acceptedCharts] : currentState.pool,
        borders: hasOcrPayload ? borderApplication.borders : currentState.borders,
        borderRerollsUsed: hasOcrPayload
          ? borderApplication.borderRerollsUsed
          : currentState.borderRerollsUsed,
      }
      const persistence = validateStateForPersistence(nextState)
      if (!persistence.ok) {
        setMsg(
          message('Import was not applied because it could not be saved: {v0}', {
            v0: persistence.message,
          }),
        )
        return
      }

      if (hasOcrPayload) {
        const borders = borderApplication.borders
        stateRef.current = nextState
        onLoadState(nextState)
        if (borderApplication.status === 'complete' && !borderApplication.invalidated) {
          const captureMessage = borderResearch.captureImportedRoll(borders, borderOcr.rerollCost)
          if (captureMessage) parts.push(captureMessage)
        }
      } else if (fresh.length > 0) {
        addition = onImport(fresh)
        acceptedCharts = fresh.slice(0, addition.added)
        if (acceptedCharts.length > 0) {
          stateRef.current = {
            ...currentState,
            pool: [...currentState.pool, ...acceptedCharts],
          }
        }
      }
      if (charts.length > 0 || hasOcrPayload) {
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
        parts.push(
          message(addition.added === 1 ? 'Imported {count} chart' : 'Imported {count} charts', {
            count: addition.added,
          }),
        )
      if (rescanned > 0) {
        parts.push(
          message(
            'skipped {v0} re-scanned chart{v1} already in your library (use "Clear all charts" first for a fresh import)',
            { v0: rescanned, v1: rescanned === 1 ? '' : 's' },
          ),
        )
      }
      if (addition.skipped > 0) {
        parts.push(
          message('skipped {v0} because the {v1}-chart library limit was reached', {
            v0: addition.skipped,
            v1: MAX_POOL_CHARTS,
          }),
        )
      }
      if (stoppedEarly?.reason === 'chart-capacity') {
        parts.push(
          message(
            'stopped before {v0} additional item{v1} because the {v2}-chart library limit was reached',
            {
              v0: stoppedEarly.unprocessedItems,
              v1: stoppedEarly.unprocessedItems === 1 ? '' : 's',
              v2: MAX_POOL_CHARTS,
            },
          ),
        )
      } else if (stoppedEarly?.reason === 'rejection-budget') {
        parts.push(
          message('stopped after {v0} rejected items; {v1} additional item{v2} were not parsed', {
            v0: MAX_IMPORT_REJECTIONS,
            v1: stoppedEarly.unprocessedItems,
            v2: stoppedEarly.unprocessedItems === 1 ? '' : 's',
          }),
        )
      }
      // Distinct physical charts have different rolls. A large byte-identical
      // batch usually means the bulk importer's saved grid calibration is off.
      if (charts.length >= 5) {
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
        const first = key(charts[0])
        if (charts.every((chart) => key(chart) === first)) {
          parts.push(
            message(
              '⚠ all {v0} are identical - if this came from the bulk importer, recalibrate its grid with F7/F8, then reset and re-import',
              { v0: charts.length },
            ),
          )
        }
      }
      const acceptedUids = new Set(acceptedCharts.map(({ uid }) => uid))
      const acceptedUnresolved = unresolved.filter(({ uid }) => acceptedUids.has(uid))
      if (acceptedUnresolved.length) {
        parts.push(
          message('needs shape confirmation: {v0}', {
            v0: acceptedUnresolved.map(({ name, reason }) => `"${name}" (${reason})`).join(', '),
          }),
        )
      }
      if (borderOcr.blockCount > 0) {
        const expectedBorderCount = borderOcr.scanMeta?.expectedBlockCount ?? borderOcr.blockCount
        parts.push(
          message('matched {v0}/{v1} border modifier{v2}', {
            v0: borderOcr.matches.length,
            v1: expectedBorderCount,
            v2: expectedBorderCount === 1 ? '' : 's',
          }),
        )
      }
      if (borderApplication.invalidated) {
        parts.push(
          'cleared the stale border snapshot and reroll count; recommendations are paused until a complete scan',
        )
      } else if (borderApplication.status === 'incomplete') {
        parts.push(
          message('border scan incomplete ({v0}/12 positions); kept existing borders', {
            v0: borderOcr.uniqueBlockCount,
          }),
        )
      } else if (borderApplication.status === 'failed') {
        parts.push('no border tooltips recognised; kept existing borders')
      } else if (borderApplication.status === 'partial') {
        parts.push('cleared unmatched border positions from the complete scan')
      }
      if (borderOcr.ocrLanguages.length > 0) {
        parts.push(message('OCR language {v0}', { v0: borderOcr.ocrLanguages.join(', ') }))
      }
      if (borderOcr.rerollCost) {
        parts.push(
          message('reroll cost {v0} ({v1}/5 used)', {
            v0: formatNumber(borderOcr.rerollCost.cost),
            v1: borderOcr.rerollCost.rerollsUsed,
          }),
        )
      } else if (borderOcr.rerollCostBlockCount > 0) {
        parts.push('OCR could not match the border reroll cost')
      }
      if (notCharted.length)
        parts.push(
          message('skipped {v0} uncharted (run them first to reveal their modifier)', {
            v0: notCharted.length,
          }),
        )
      const otherRejects = rejected.filter((r) => !r.reason.startsWith('not charted'))
      if (otherRejects.length) {
        parts.push(
          message('skipped: {v0}', {
            v0: otherRejects.map(({ name, reason }) => `"${name}" (${reason})`).join(', '),
          }),
        )
      }
      if (borderOcr.misses.length > 0 && borderApplication.status !== 'failed') {
        parts.push(
          message('OCR unmatched at border{v0} {v1}', {
            v0: borderOcr.misses.length === 1 ? '' : 's',
            v1: borderOcr.misses.map((miss) => miss.index + 1).join(', '),
          }),
        )
      }
      setMsg(parts.length ? joinMessages(parts) : 'Nothing imported')
    },
    [borderResearch, onImport, onLoadState, text],
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
      void doParse(clip)
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
        message('State could not be exported: {v0}', {
          v0: error instanceof Error ? error.message : 'serialization failed',
        }),
      )
    }
  }

  const importJson = async (file: File) => {
    cancelPendingImport()
    setParsing(false)
    try {
      const decoded = await decodeStateFile(file)
      if (!decoded.ok) {
        setMsg(message('Invalid or incompatible state file: {v0}', { v0: decoded.message }))
        return
      }
      onLoadState(decoded.state)
      setMsg(
        decoded.warnings.length > 0
          ? message('State loaded from JSON with {v0} compatibility adjustment{v1}', {
              v0: decoded.warnings.length,
              v1: decoded.warnings.length === 1 ? '' : 's',
            })
          : 'State loaded from JSON',
      )
    } catch {
      setMsg('Invalid or incompatible state file: file could not be read')
    }
  }

  const clearAll = () => {
    if (window.confirm(t('Clear all charts, board and borders?'))) {
      cancelPendingImport()
      setParsing(false)
      onLoadState(defaultState())
    }
  }

  return (
    <section className="import-panel" aria-labelledby="import-title">
      <h2 id="import-title" className="panel-title">
        {t('Import')}
      </h2>
      <label className="sr-only" htmlFor="chart-import-text">
        {t('Chart or border import text')}
      </label>
      <textarea
        id="chart-import-text"
        rows={5}
        placeholder={t(
          'Copy a chart in game (Ctrl+C), then press Ctrl+V anywhere on this page to import it. The Windows bulk importer also fills all 12 border modifiers with local OCR.',
        )}
        value={text}
        onChange={(e) => {
          cancelPendingImport()
          setParsing(false)
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
        <button onClick={() => void doParse()} disabled={!text.trim()}>
          {parsing ? t('Parsing…') : t('Parse & Add')}
        </button>
        <button
          title={t('Generate random charts to try out the tool')}
          onClick={() => {
            cancelPendingImport()
            setParsing(false)
            const result = onImport(generateDemoCharts(25))
            const parts: UiMessage[] = [
              `Added ${result.added} random demo chart${result.added === 1 ? '' : 's'}`,
            ]
            if (result.skipped > 0) {
              parts.push(
                message('skipped {v0} because the {v1}-chart library limit was reached', {
                  v0: result.skipped,
                  v1: MAX_POOL_CHARTS,
                }),
              )
            }
            setMsg(joinMessages(parts))
          }}
        >
          {t('🎲 Demo ×25')}
        </button>
        <button onClick={exportJson} title={t('Save your charts to a JSON file')}>
          {t('Export')}
        </button>
        <label className="file-btn" title={t('Load charts from a JSON file')}>
          {t('Load')}
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
        <button onClick={clearAll} title={t('Clear all charts, board and borders')}>
          {t('Reset')}
        </button>
      </div>
      {msg && (
        <div
          className="muted pad"
          role="status"
          aria-label="Import result"
          aria-live="polite"
          aria-atomic="true"
        >
          {ui(msg)}
        </div>
      )}
      <div className={rareAlert ? 'import-rare-alert' : undefined}>
        <span>
          {rareAlert && <span aria-hidden="true">🎰 </span>}
          <span
            role="status"
            aria-label="Rare-chart import alert"
            aria-live="polite"
            aria-atomic="true"
          >
            {ui(rareAlert)}
          </span>
        </span>
        {rareAlert && (
          <button
            className="announce-close"
            aria-label="Dismiss rare-chart import alert"
            onClick={() => setRareAlert('')}
          >
            ✕
          </button>
        )}
      </div>

      <details className="ahk-help">
        <summary>{t("🎲 Rolling & keeping charts (Milky's regexes)")}</summary>
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
      </details>

      <details className="ahk-help">
        <summary>{t('🖱️ Bulk-import charts + board borders from PoE (Windows OCR)')}</summary>
        <p className="muted">
          {t(
            'A self-contained AutoHotkey script copies up to 120 charts from both chart-stash tabs, reads all 12 board-border tooltips with Windows OCR, opens this trusted solver page, and pastes one combined payload automatically. If the browser cannot be opened and focused, the payload stays on your clipboard for a manual Ctrl+V. OCR stays on your PC and no screenshots are uploaded.',
          )}
        </p>
        <a className="ahk-dl" href={`${import.meta.env.BASE_URL}voyage-import.ahk`} download>
          {t('⬇ Download voyage-import.ahk')}
        </a>
        <details className="ahk-faq">
          <summary>{t("Is this allowed under GGG's third-party policy?")}</summary>
          <p className="muted small">
            {t(
              "Our read: yes. GGG's macro rules govern inputs that affect the game, and the importer's sweep is read-only - mouse hovers and Ctrl+C copies (the same primitive Awakened PoE Trade sends on every price-check), plus holding Alt to reveal tooltips for the screenshot. Nothing is moved, used, created or decided in-game; your character and stash are identical before and after a run. The only real UI interaction is flipping the chart panel's page tab, which the script flips back when done. Invocation is always your own keypress - nothing ever triggers from timers or screen-watching.",
            )}
          </p>
          <p className="muted small">
            {t(
              "That said, this is our interpretation, not a GGG ruling. If GGG ever indicates otherwise, the tool will change immediately. And if you'd rather not use the importer at all, everything works by hand - the solver itself is just a webpage you paste item text into; it never touches the game.",
            )}
          </p>
        </details>
        <ol className="ahk-steps">
          <li>
            {t('Install')}{' '}
            <a href="https://www.autohotkey.com/" target="_blank" rel="noopener noreferrer">
              {t('AutoHotkey v2')}
            </a>{' '}
            {t('(Windows only).')}
          </li>
          <li>
            {t(
              'In PoE (Windowed or Windowed Fullscreen), open the Voyage board so your chart panel is fully visible and not scrolled.',
            )}
          </li>
          <li>
            {t(
              'Double-click the script. There is no browser or game binding: the helper opens this solver URL through your default browser and authenticates the foreground PoE window whenever a calibration or scan hotkey is pressed. No setup shortcut is required.',
            )}
          </li>
          <li>
            {t(
              'Keep the real Path of Exile window focused while calibrating. Positions are saved relative to its client area, so moving the game between monitors no longer moves clicks back to the old screen. Existing screen-based calibration is cleared once; recalibrate the points below after updating the script.',
            )}
          </li>
          <li>
            {t('For quick board calibration, point at the')}{' '}
            <strong>{t('top-left corner of the border-modifier square')}</strong>
            {t(' and press ')}
            <kbd>{t('F5')}</kbd>
            {t('; then point at its ')}
            <strong>{t('bottom-right corner')}</strong>
            {t(' and press ')}
            <kbd>{t('F6')}</kbd>.
          </li>
          <li>
            {t('If any border is missed, press ')}
            <kbd>{t('Ctrl+F5')}</kbd>
            {t(' to start exact calibration. Hover the modifier named by the script and press ')}
            <kbd>{t('Ctrl+F6')}</kbd>
            {t(' to save it; repeat for all 12. Press ')}
            <kbd>{t('Ctrl+F4')}</kbd>
            {t(' to preview the saved positions without running OCR.')}
          </li>
          <li>
            {t('Hover the ')}
            <strong>{t('compass-shaped border reroll button')}</strong>
            {t(' so its cost tooltip is visible, then press ')}
            <kbd>{t('Ctrl+F7')}</kbd>
            {t(
              ". This lets each scan read the next reroll cost and synchronize the solver's reroll counter automatically.",
            )}
          </li>
          <li>
            {t('For chart import, calibrate the shared grid: hover the ')}
            <strong>{t('top-left')}</strong>
            {t(' chart slot and press ')}
            <kbd>{t('F7')}</kbd>
            {t(', then hover the ')}
            <strong>{t('bottom-right')}</strong>
            {t(' slot and press ')}
            <kbd>{t('F8')}</kbd>
            {t('. Next, hover chart-stash tab ')}
            <strong>1</strong>
            {t(' and press')} <kbd>{t('Shift+F7')}</kbd>
            {t(', then hover tab ')}
            <strong>2</strong>
            {t(' and press ')}
            <kbd>{t('Shift+F8')}</kbd>
            {t(". (Edit GridCols/GridRows if your panel isn't 6×10.)")}
          </li>
          <li>
            <kbd>{t('F9')}</kbd>
            {t(
              ' switches through both chart-stash tabs, copies their charts, and scans the 12 borders · ',
            )}
            <kbd>{t('Ctrl+F9')}</kbd>
            {t(
              ' refreshes only the 12 borders after a reroll, without rescanning charts, and also reads the calibrated reroll-cost tooltip. Both commands open the solver in the default browser, activate its window without a saved mouse click, and paste automatically. If opening or activation fails, the payload stays on the clipboard for a manual ',
            )}
            <kbd>{t('Ctrl+V')}</kbd>. <kbd>{t('F10')}</kbd>
            {t(
              " aborts. Border OCR can take around 15–30 seconds on a 4K screen. The script's tray menu lets you configure how many fully empty chart rows end a tab sweep; use 0 if you keep Charts below large gaps.",
            )}
          </li>
        </ol>
        <p className="muted small">
          {t(
            "If PoE runs as administrator, run the script as administrator too, or its keypresses won't reach the game. Don't touch the mouse or keyboard while it's running.",
          )}
        </p>
        <p className="muted small">
          {t('Problems or ideas?')}{' '}
          <a
            href="https://github.com/Alkwer/one-more-map.github.io/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Open a GitHub issue')}
          </a>{' '}
          {t('— actively monitored, and pull requests are welcome.')}
        </p>
      </details>

      <DeferredBorderRollResearch
        borders={state.borders}
        controller={borderResearch}
        protectedRoll={protectedRoll}
      />
    </section>
  )
}
