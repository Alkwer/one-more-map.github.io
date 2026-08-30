import { FEEDBACK_URL } from '../buildInfo'
import { formatNumber, joinMessages, message, t, type UiMessage, ui } from '../i18n/locale'
import { lazy, useCallback, useEffect, useRef, useState } from 'react'
import { RARE_IMPLICITS } from '../data/strategies'
import { ImportHelpDisclosure } from './ImportHelpDisclosure'
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

const RollingChartHelp = lazy(() =>
  import('./RollingChartHelp').then(({ RollingChartHelp }) => ({ default: RollingChartHelp })),
)
const WindowsImportHelp = lazy(() =>
  import('./WindowsImportHelp').then(({ WindowsImportHelp }) => ({ default: WindowsImportHelp })),
)

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

      <ImportHelpDisclosure title={t("🎲 Rolling & keeping charts (Milky's regexes)")}>
        <RollingChartHelp />
      </ImportHelpDisclosure>

      <ImportHelpDisclosure
        title={t('🖱️ Bulk-import charts + board borders from PoE (Windows OCR)')}
      >
        <WindowsImportHelp feedbackUrl={FEEDBACK_URL} />
      </ImportHelpDisclosure>

      <DeferredBorderRollResearch
        borders={state.borders}
        controller={borderResearch}
        protectedRoll={protectedRoll}
      />
    </section>
  )
}
