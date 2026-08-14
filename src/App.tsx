import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AutosaveFailureWarning } from './components/AutosaveFailureWarning'
import { BoardView } from './components/Board'
import { BorderAppraiser } from './components/BorderAppraiser'
import { ImportPanel } from './components/ImportPanel'
import { Library } from './components/Library'
import { LazyModalFallback } from './components/LazyModalFallback'
import { ModalDialog } from './components/ModalDialogSurface'
import { SolverPanel } from './components/SolverPanel'
import { SavedStateRecovery } from './components/SavedStateRecovery'
import { StrategiesPanel } from './components/StrategiesPanel'
import { DeferredStrategySuggestions } from './components/DeferredStrategySuggestions'
import { TooltipLayer } from './components/Tooltip'
import { VoyageAdvisor } from './components/VoyageAdvisor'
import { AppHeader } from './components/app/AppHeader'
import { VoyageBoardStatus } from './components/app/VoyageBoardStatus'
import {
  ChartDeletionConfirmationPrompt,
  CopySequencePrompt,
  FinishVoyageConfirmationPrompt,
  PreserveConfirmationPrompt,
} from './components/app/VoyageWorkflowPrompts'
import { VoyageRewards } from './components/VoyageRewards'
import { useAppChrome } from './hooks/useAppChrome'
import { useBoardSelection } from './hooks/useBoardSelection'
import { useBorderRollResearch } from './hooks/useBorderRollResearch'
import { useVoyageAnalysis } from './hooks/useVoyageAnalysis'
import { useVoyageWorkflows } from './hooks/useVoyageWorkflows'
import { generateDemoCharts } from './logic/demo'
import { chartAdditionResult, type ChartAdditionResult } from './logic/chartCapacity'
import { LATEST_UPDATE_DATE } from './data/latestUpdate'
import { clampRerollsUsed } from './logic/rerollAdvice'
import { decodeShare, mergeSharedLayout, type ShareDecodeResult } from './logic/share'
import {
  defaultState,
  loadLocalState,
  MAX_POOL_CHARTS,
  saveLocal,
  type AppState,
  type LocalSaveResult,
  type LocalStateRecovery,
} from './logic/storage'
import { persistableAppStateReducer } from './state/appStateReducer'
import type { ChartData } from './types'

type ShareSession =
  | {
      kind: 'valid'
      format: Extract<ShareDecodeResult, { ok: true }>['format']
      mergeError?: string
    }
  | { kind: 'invalid'; message: string }

interface InitialStateResult {
  state: AppState
  shareSession: ShareSession | null
  recovery: LocalStateRecovery | null
}

interface ChartDeletionConfirmation {
  uid: string
  name: string
  boardCells: number[]
}

/** One-time notice for the two-page Windows importer update. */
const AHK_PAGES_KEY = 'announce-ahk-page2'

const ModBrowser = lazy(() =>
  import('./components/ModBrowser').then(({ ModBrowser }) => ({ default: ModBrowser })),
)
const Onboarding = lazy(() =>
  import('./components/Onboarding').then(({ Onboarding }) => ({ default: Onboarding })),
)
const SaveWizard = lazy(() =>
  import('./components/SaveWizard').then(({ SaveWizard }) => ({ default: SaveWizard })),
)
const SessionPlanner = lazy(() =>
  import('./components/SessionPlanner').then(({ SessionPlanner }) => ({ default: SessionPlanner })),
)
const Tutorial = lazy(() =>
  import('./components/Tutorial').then(({ Tutorial }) => ({ default: Tutorial })),
)
const UpdatesLog = lazy(() =>
  import('./components/UpdatesLog').then(({ UpdatesLog }) => ({ default: UpdatesLog })),
)

function readLocationState(): InitialStateResult {
  const saved = loadLocalState()
  const recovery = saved.status === 'recovery' ? saved : null
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.length > 0) {
    const shared = decodeShare(hash)
    if (shared.ok) {
      return {
        state: shared.state,
        shareSession: { kind: 'valid', format: shared.format },
        recovery,
      }
    }
    return {
      state: defaultState(),
      shareSession: { kind: 'invalid', message: shared.message },
      recovery,
    }
  }
  return {
    state: saved.status === 'ready' ? saved.state : defaultState(),
    shareSession: null,
    recovery,
  }
}

export default function App() {
  const [initial] = useState(readLocationState)
  const [persistableState, dispatch] = useReducer(persistableAppStateReducer, {
    state: initial.state,
    mutationError: null,
  })
  const { state, mutationError } = persistableState
  const [shareSession, setShareSession] = useState<ShareSession | null>(initial.shareSession)
  const [recovery, setRecovery] = useState<LocalStateRecovery | null>(initial.recovery)
  const [recoveryActionError, setRecoveryActionError] = useState('')
  const [autosaveFailure, setAutosaveFailure] = useState<Extract<
    LocalSaveResult,
    { ok: false }
  > | null>(null)
  const [chartDeletionConfirmation, setChartDeletionConfirmation] =
    useState<ChartDeletionConfirmation | null>(null)
  const chrome = useAppChrome(state)
  const analysis = useVoyageAnalysis(state)
  const selection = useBoardSelection(state.board, state.pool, dispatch)
  const clearSelection = selection.clear
  const borderResearch = useBorderRollResearch(state.borders)
  const [showAhkNotice, setShowAhkNotice] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(AHK_PAGES_KEY)) return false
      if (!localStorage.getItem('onboarding-seen')) {
        localStorage.setItem(AHK_PAGES_KEY, '1')
        return false
      }
      return true
    } catch {
      return false
    }
  })
  const dismissAhkNotice = () => {
    setShowAhkNotice(false)
    try {
      localStorage.setItem(AHK_PAGES_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  const [showPlanner, setShowPlanner] = useState(false)
  const [showSaveWizard, setShowSaveWizard] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [showUpdates, setShowUpdates] = useState(false)
  const [updatesSeen, setUpdatesSeen] = useState(() => {
    try {
      return localStorage.getItem('updates-seen') ?? ''
    } catch {
      return ''
    }
  })
  const openUpdates = () => {
    setShowUpdates(true)
    setUpdatesSeen(LATEST_UPDATE_DATE)
    try {
      localStorage.setItem('updates-seen', LATEST_UPDATE_DATE)
    } catch {
      /* ignore */
    }
  }
  const workflows = useVoyageWorkflows(
    state,
    analysis.chartMap,
    dispatch,
    borderResearch.store.activeSequenceId,
    borderResearch.finishVoyage,
  )
  const saveTimer = useRef<number>()
  const pendingSave = useRef<AppState | null>(null)
  const persistState = useCallback((nextState: AppState) => {
    const result = saveLocal(nextState)
    setAutosaveFailure(result.ok ? null : result)
    return result
  }, [])
  const flushPendingSave = useCallback(() => {
    const nextState = pendingSave.current
    if (!nextState) return
    window.clearTimeout(saveTimer.current)
    pendingSave.current = null
    persistState(nextState)
  }, [persistState])
  const replaceState = useCallback(
    (nextState: AppState) => {
      clearSelection()
      setChartDeletionConfirmation(null)
      dispatch({ type: 'replace', state: nextState })
    },
    [clearSelection],
  )

  useEffect(() => {
    if (shareSession || recovery) {
      pendingSave.current = null
      return
    }
    pendingSave.current = state
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const nextState = pendingSave.current
      pendingSave.current = null
      if (nextState) persistState(nextState)
    }, 300)
    return () => window.clearTimeout(saveTimer.current)
  }, [persistState, recovery, shareSession, state])

  useEffect(() => {
    window.addEventListener('pagehide', flushPendingSave)
    return () => window.removeEventListener('pagehide', flushPendingSave)
  }, [flushPendingSave])

  useEffect(() => {
    const syncHashState = () => {
      if (window.location.hash.length > 1) flushPendingSave()
      const next = readLocationState()
      replaceState(next.state)
      setShareSession(next.shareSession)
      setRecovery(next.recovery)
    }
    window.addEventListener('hashchange', syncHashState)
    return () => window.removeEventListener('hashchange', syncHashState)
  }, [flushPendingSave, replaceState])

  const clearShareHash = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }
  const openSavedState = () => {
    setShareSession(null)
    clearShareHash()
    const saved = loadLocalState()
    if (saved.status === 'recovery') {
      setRecovery(saved)
      return
    }
    setRecovery(null)
    replaceState(saved.status === 'ready' ? saved.state : defaultState())
  }
  const adoptSharedState = () => {
    clearSelection()
    setShareSession(null)
    clearShareHash()
  }
  const mergeSharedState = () => {
    const saved = loadLocalState()
    if (saved.status === 'recovery') {
      setRecovery(saved)
      return
    }
    const result = mergeSharedLayout(saved.status === 'ready' ? saved.state : defaultState(), state)
    if (!result.ok) {
      setShareSession((session) =>
        session?.kind === 'valid' ? { ...session, mergeError: result.message } : session,
      )
      return
    }
    replaceState(result.state)
    setShareSession(null)
    clearShareHash()
  }

  const retrySavedState = () => {
    setRecoveryActionError('')
    const saved = loadLocalState()
    if (saved.status === 'recovery') {
      setRecovery(saved)
      return
    }
    setRecovery(null)
    if (!shareSession) {
      replaceState(saved.status === 'ready' ? saved.state : defaultState())
    }
  }

  const migrateSavedState = () => {
    if (!recovery?.backupKey || !recovery.proposedState) return
    const result = persistState(recovery.proposedState)
    if (!result.ok) {
      setRecoveryActionError(
        `Migration was not committed: ${result.message} The recovery dialog remains active; retry after browser storage is available.`,
      )
      return
    }
    setRecoveryActionError('')
    if (!shareSession) replaceState(recovery.proposedState)
    setRecovery(null)
  }

  const resetSavedState = () => {
    if (!recovery?.backupKey) return
    if (!window.confirm('Reset the incompatible saved state? The recovery backup will be kept.')) {
      return
    }
    const fresh = defaultState()
    const result = persistState(fresh)
    if (!result.ok) {
      setRecoveryActionError(
        `Reset was not committed: ${result.message} The recovery dialog remains active; retry after browser storage is available.`,
      )
      return
    }
    setRecoveryActionError('')
    if (!shareSession) replaceState(fresh)
    setRecovery(null)
  }

  const patch = (patchState: Partial<AppState>) => dispatch({ type: 'patch', patch: patchState })
  const poolCount = useRef(state.pool.length)
  poolCount.current = state.pool.length
  const addCharts = useCallback((charts: ChartData[]): ChartAdditionResult => {
    const result = chartAdditionResult(poolCount.current, charts.length)
    if (result.added > 0) {
      poolCount.current += result.added
      dispatch({ type: 'charts/add', charts: charts.slice(0, result.added) })
    }
    return result
  }, [])
  const clearCharts = () => {
    if (
      !window.confirm(
        'Remove all charts from the library and clear the board? (Borders and weights are kept.)',
      )
    )
      return
    dispatch({ type: 'charts/clear' })
    clearSelection()
  }
  const requestChartDeletion = (uid: string) => {
    const chart = state.pool.find((candidate) => candidate.uid === uid)
    if (!chart) return
    const boardCells = state.board.flatMap((placement, cell) =>
      placement?.chartUid === uid ? [cell] : [],
    )
    setChartDeletionConfirmation({ uid, name: chart.name, boardCells })
  }
  const cancelChartDeletion = () => setChartDeletionConfirmation(null)
  const confirmChartDeletion = () => {
    if (!chartDeletionConfirmation) return
    clearSelection()
    dispatch({ type: 'charts/remove', uid: chartDeletionConfirmation.uid })
    setChartDeletionConfirmation(null)
  }
  const selectedBoardChart =
    selection.selectedChart &&
    state.board.some((placement) => placement?.chartUid === selection.selectedChart)
      ? selection.selectedChart
      : null
  const highlightUid = workflows.sequenceActive ? workflows.highlightUid : selectedBoardChart

  return (
    <div className="app">
      <TooltipLayer />
      {autosaveFailure && (
        <AutosaveFailureWarning
          failure={autosaveFailure}
          state={state}
          onRetry={() => persistState(state)}
          onDismiss={() => setAutosaveFailure(null)}
        />
      )}
      {mutationError && (
        <div className="share-banner error" role="alert">
          <div className="share-banner-copy">
            <strong>Your latest change was kept out of the library</strong>
            <span>{mutationError} Your previous saved state is still intact.</span>
          </div>
        </div>
      )}
      {recovery && (
        <SavedStateRecovery
          recovery={recovery}
          actionError={recoveryActionError}
          onRetry={retrySavedState}
          onMigrate={migrateSavedState}
          onReset={resetSavedState}
        />
      )}
      {shareSession && (
        <div
          className={`share-banner ${shareSession.kind === 'invalid' ? 'error' : ''}`}
          role={shareSession.kind === 'invalid' ? 'alert' : 'status'}
        >
          <div className="share-banner-copy">
            <span>
              {shareSession.kind === 'invalid'
                ? `This shared layout could not be opened: ${shareSession.message}. Your saved state was left unchanged.`
                : shareSession.format === 'legacy-v3'
                  ? 'Viewing a legacy shared state. Your saved state has not been changed.'
                  : 'Viewing a shared layout. Your saved state has not been changed.'}
            </span>
            {shareSession.kind === 'valid' && shareSession.mergeError && (
              <span className="share-merge-error" role="alert">
                {shareSession.mergeError}
              </span>
            )}
          </div>
          <div className="share-banner-actions">
            <button onClick={openSavedState}>
              {shareSession.kind === 'valid' ? 'Discard shared layout' : 'Open my saved state'}
            </button>
            {shareSession.kind === 'valid' && (
              <>
                <button onClick={mergeSharedState}>Merge with my library</button>
                <button onClick={adoptSharedState}>Replace my saved state</button>
              </>
            )}
          </div>
        </div>
      )}
      {!recovery && chrome.showOnboarding && (
        <Suspense
          fallback={<LazyModalFallback title="Plan your Voyage" onClose={chrome.closeOnboarding} />}
        >
          <Onboarding
            onClose={chrome.closeOnboarding}
            onDemo={() => addCharts(generateDemoCharts(25))}
            remainingChartCapacity={Math.max(0, MAX_POOL_CHARTS - state.pool.length)}
          />
        </Suspense>
      )}
      {!recovery && chrome.showMods && (
        <Suspense
          fallback={<LazyModalFallback title="Chart Modifiers" onClose={chrome.closeMods} />}
        >
          <ModBrowser
            disabled={analysis.disabledSet}
            onToggle={(id, disabled) =>
              dispatch({ type: 'mods/set-disabled', ids: [id], disabled })
            }
            onBulk={(ids, disabled) => dispatch({ type: 'mods/set-disabled', ids, disabled })}
            onClose={chrome.closeMods}
          />
        </Suspense>
      )}
      {!recovery && showUpdates && (
        <Suspense
          fallback={<LazyModalFallback title="Updates" onClose={() => setShowUpdates(false)} />}
        >
          <UpdatesLog onClose={() => setShowUpdates(false)} />
        </Suspense>
      )}
      {!recovery && showTutorial && (
        <Suspense
          fallback={
            <LazyModalFallback title="What this site does" onClose={() => setShowTutorial(false)} />
          }
        >
          <Tutorial onClose={() => setShowTutorial(false)} />
        </Suspense>
      )}
      {!recovery && chartDeletionConfirmation && (
        <ModalDialog
          labelledBy="chart-deletion-confirmation-title"
          onClose={cancelChartDeletion}
          className="preserve-confirmation-modal"
        >
          <ChartDeletionConfirmationPrompt
            chartName={chartDeletionConfirmation.name}
            boardCells={chartDeletionConfirmation.boardCells}
            onConfirm={confirmChartDeletion}
            onCancel={cancelChartDeletion}
          />
        </ModalDialog>
      )}
      {!recovery && workflows.finishConfirmation && (
        <ModalDialog
          labelledBy="finish-voyage-confirmation-title"
          onClose={workflows.cancelPreserveConfirmation}
          className="preserve-confirmation-modal"
        >
          <FinishVoyageConfirmationPrompt
            confirmation={workflows.finishConfirmation}
            onConfirm={workflows.confirmFinishVoyage}
            onCancel={workflows.cancelPreserveConfirmation}
          />
        </ModalDialog>
      )}
      {!recovery && workflows.preserveConfirmation && (
        <ModalDialog
          labelledBy="preserve-confirmation-title"
          onClose={workflows.cancelPreserveConfirmation}
          className="preserve-confirmation-modal"
        >
          <PreserveConfirmationPrompt
            confirmation={workflows.preserveConfirmation}
            onDecide={workflows.decidePreserve}
            onCancel={workflows.cancelPreserveConfirmation}
          />
        </ModalDialog>
      )}
      {!recovery && showAhkNotice && !chrome.showOnboarding && (
        <ModalDialog
          labelledBy="ahk-notice-title"
          onClose={dismissAhkNotice}
          className="onboard ahk-notice"
        >
          <div
            className="panel-title"
            id="ahk-notice-title"
            data-dialog-initial-focus
            tabIndex={-1}
          >
            📥 Importer updated — second chart page
            <span className="spacer" />
            <button aria-label="Close importer update" onClick={dismissAhkNotice}>
              ✕
            </button>
          </div>
          <p className="tut-body">
            The game&apos;s chart panel now has <strong>two pages</strong>, and the Windows bulk
            importer scans both by switching between the page tabs. Sweeps are faster too: empty
            tails are skipped instead of waiting on every blank slot.
          </p>
          <p className="tut-body">Your downloaded script does not update itself, so to get this:</p>
          <ol className="ahk-notice-steps">
            <li>Download the script again and replace your old copy.</li>
            <li>
              Hover the page 1 tab and press <kbd>Shift+F7</kbd>, then hover page 2 and press{' '}
              <kbd>Shift+F8</kbd>. Your grid and border calibration stays intact.
            </li>
          </ol>
          <div className="sw-actions">
            <a
              className="ahk-notice-dl"
              href={`${import.meta.env.BASE_URL}voyage-import.ahk`}
              download
              onClick={dismissAhkNotice}
            >
              ⬇ Download the updated script
            </a>
            <span className="spacer" />
            <button onClick={dismissAhkNotice}>Got it</button>
          </div>
        </ModalDialog>
      )}
      {!recovery && showSaveWizard && (
        <Suspense
          fallback={
            <LazyModalFallback
              title="Keep charts for strategies"
              onClose={() => setShowSaveWizard(false)}
            />
          }
        >
          <SaveWizard
            pool={state.pool}
            keeps={state.pieceKeeps}
            reservations={state.strategyReservations}
            onApply={(pieceKeeps) => patch({ pieceKeeps })}
            onClose={() => setShowSaveWizard(false)}
          />
        </Suspense>
      )}
      {!recovery && showPlanner && (
        <Suspense
          fallback={
            <LazyModalFallback title="Session Plan" onClose={() => setShowPlanner(false)} />
          }
        >
          <SessionPlanner
            pool={state.pool}
            mode={state.mode}
            borders={state.borders}
            reservations={state.strategyReservations}
            pieceKeeps={state.pieceKeeps}
            onUseStrategy={(strategyId) => patch({ strategyId })}
            onClose={() => setShowPlanner(false)}
          />
        </Suspense>
      )}
      <AppHeader
        disabledModCount={state.disabledMods.length}
        harvestTheme={chrome.harvestTheme}
        shareMessage={chrome.shareMessage}
        updatesUnseen={updatesSeen < LATEST_UPDATE_DATE}
        onOpenOnboarding={chrome.openOnboarding}
        onOpenMods={chrome.openMods}
        onOpenTutorial={() => setShowTutorial(true)}
        onOpenUpdates={openUpdates}
        onToggleTheme={chrome.toggleTheme}
        onShare={chrome.share}
      />

      <VoyageAdvisor
        decision={analysis.voyageDecision}
        loading={analysis.strategyInventoryLoading}
        error={analysis.strategyInventoryError}
        onChangeRerolls={(value) => patch({ borderRerollsUsed: clampRerollsUsed(value) })}
        onSelectStrategy={(id) => patch({ strategyId: id })}
      />

      <main>
        <div className="col library-col">
          <Library
            pool={state.pool}
            board={state.board}
            weights={analysis.effectiveWeights}
            disabledMods={analysis.disabledSet}
            reservations={state.strategyReservations}
            pieceKeeps={state.pieceKeeps}
            selected={selection.selectedChart}
            onSelect={selection.selectChart}
            onAdd={addCharts}
            onRemove={requestChartDeletion}
            onUpdate={(chart) => dispatch({ type: 'charts/update', chart })}
            onClearCharts={clearCharts}
            onOpenSaveWizard={() => setShowSaveWizard(true)}
          />
          <ImportPanel
            onImport={addCharts}
            state={state}
            borderResearch={borderResearch}
            protectedRoll={
              analysis.voyageDecision.preserveRoll &&
              state.borders.every((border) => border !== null)
                ? {
                    strategy: analysis.voyageDecision.strategyName ?? 'The current jackpot board',
                    borders: state.borders,
                  }
                : null
            }
            onLoadState={replaceState}
          />
        </div>

        <div className="col board-col">
          <BoardView
            board={state.board}
            borders={state.borders}
            charts={analysis.chartMap}
            perTile={analysis.score.perTile}
            selectedCell={selection.selectedCell}
            highlightUid={highlightUid}
            strictMode={state.mode !== 'any'}
            placingChart={
              selection.selectedChart
                ? (analysis.chartMap.get(selection.selectedChart) ?? null)
                : null
            }
            onCellClick={selection.onCellClick}
            onRemove={(cell) => {
              selection.clearCell(cell)
              dispatch({ type: 'board/remove', cell })
            }}
            onRotate={(cell) => dispatch({ type: 'board/rotate', cell })}
            onBorderChange={(segment, id) => dispatch({ type: 'borders/set', segment, id })}
            onTogglePreserve={(uid) => dispatch({ type: 'charts/toggle-preserved', uid })}
            onFinishVoyage={workflows.finishVoyage}
            onCopySequence={workflows.startCopySequence}
            voyageMsg={workflows.voyageMessage}
            sequenceActive={workflows.sequenceActive}
          />

          {workflows.copySequence && (
            <CopySequencePrompt
              sequence={workflows.copySequence}
              board={state.board}
              chartMap={analysis.chartMap}
              failure={workflows.copyFailure}
              pending={workflows.copyPending}
              onAdvance={workflows.copyCurrentAndAdvance}
              onManualAdvance={workflows.confirmManualCopy}
              onCancel={workflows.cancelCopySequence}
            />
          )}
          <VoyageBoardStatus
            mode={state.mode}
            connectivity={analysis.connectivity}
            modCount={analysis.modCount}
          />

          <BorderAppraiser
            appraisal={analysis.borderAppraisal}
            contextLabel={
              analysis.activeStrategy
                ? `Fit for active strategy: ${analysis.activeStrategy.name}`
                : 'Fit for manual reward weights'
            }
          />

          <VoyageRewards
            score={analysis.score}
            board={state.board}
            pool={state.pool}
            chartMap={analysis.chartMap}
            notables={analysis.notables}
          />
        </div>

        <section className="col solver-col" aria-labelledby="diagnostics-title">
          <div className="diagnostics-heading">
            <h2 id="diagnostics-title" className="panel-title">
              Diagnostics
            </h2>
            <div>
              Combined chart-library potential, border-roll fit, strategy requirements, and
              current-board fit explain the recommendation above; they do not replace it.
            </div>
          </div>
          <DeferredStrategySuggestions
            result={analysis.strategySuggestions}
            loading={analysis.strategyInventoryLoading}
            error={analysis.strategyInventoryError}
            activeId={state.strategyId}
            onSelect={(id) => patch({ strategyId: id })}
          />
          <StrategiesPanel
            activeId={state.strategyId}
            pool={analysis.solverEligiblePool}
            borders={state.borders}
            onSelect={(id) => patch({ strategyId: id })}
            layoutChoice={state.layoutChoice}
            onLayoutChoice={(strategyId, layoutId) =>
              patch({ layoutChoice: { ...state.layoutChoice, [strategyId]: layoutId } })
            }
          />
          <SolverPanel
            state={state}
            activeStrategy={analysis.activeStrategy}
            onPatch={patch}
            onApply={selection.applyBoard}
            onOpenPlanner={() => setShowPlanner(true)}
          />
        </section>
      </main>
    </div>
  )
}
