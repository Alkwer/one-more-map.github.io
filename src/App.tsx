import { useEffect, useReducer, useRef, useState } from 'react'
import { BoardView } from './components/Board'
import { BorderAppraiser } from './components/BorderAppraiser'
import { ImportPanel } from './components/ImportPanel'
import { Library } from './components/Library'
import { ModBrowser } from './components/ModBrowser'
import { Onboarding } from './components/Onboarding'
import { SolverPanel } from './components/SolverPanel'
import { SaveWizard } from './components/SaveWizard'
import { SessionPlanner } from './components/SessionPlanner'
import { Tutorial } from './components/Tutorial'
import { UpdatesLog } from './components/UpdatesLog'
import { StrategiesPanel } from './components/StrategiesPanel'
import { StrategySuggestions } from './components/StrategySuggestions'
import { TooltipLayer } from './components/Tooltip'
import { VoyageAdvisor } from './components/VoyageAdvisor'
import { AppHeader } from './components/app/AppHeader'
import { VoyageBoardStatus } from './components/app/VoyageBoardStatus'
import {
  CopySequencePrompt,
  PreserveConfirmationPrompt,
} from './components/app/VoyageWorkflowPrompts'
import { VoyageRewards } from './components/VoyageRewards'
import { useAppChrome } from './hooks/useAppChrome'
import { useBoardSelection } from './hooks/useBoardSelection'
import { useBorderRollResearch } from './hooks/useBorderRollResearch'
import { useVoyageAnalysis } from './hooks/useVoyageAnalysis'
import { useVoyageWorkflows } from './hooks/useVoyageWorkflows'
import { generateDemoCharts } from './logic/demo'
import { LATEST_UPDATE_DATE } from './data/updates'
import { clampRerollsUsed } from './logic/rerollAdvice'
import { decodeShare, mergeSharedLayout, type ShareDecodeResult } from './logic/share'
import { defaultState, loadLocal, saveLocal, type AppState } from './logic/storage'
import { appStateReducer } from './state/appStateReducer'
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
}

function initialState(): InitialStateResult {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.length > 0) {
    const shared = decodeShare(hash)
    if (shared.ok) {
      return {
        state: shared.state,
        shareSession: { kind: 'valid', format: shared.format },
      }
    }
    return {
      state: defaultState(),
      shareSession: { kind: 'invalid', message: shared.message },
    }
  }
  return { state: loadLocal() ?? defaultState(), shareSession: null }
}

export default function App() {
  const [initial] = useState(initialState)
  const [state, dispatch] = useReducer(appStateReducer, initial.state)
  const [shareSession, setShareSession] = useState<ShareSession | null>(initial.shareSession)
  const chrome = useAppChrome(state)
  const analysis = useVoyageAnalysis(state)
  const selection = useBoardSelection(state.board, dispatch)
  const borderResearch = useBorderRollResearch()
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
    borderResearch.finishVoyage,
  )
  const saveTimer = useRef<number>()

  useEffect(() => {
    if (shareSession) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveLocal(state), 300)
    return () => window.clearTimeout(saveTimer.current)
  }, [shareSession, state])

  const clearShareHash = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }
  const openSavedState = () => {
    dispatch({ type: 'replace', state: loadLocal() ?? defaultState() })
    setShareSession(null)
    clearShareHash()
  }
  const adoptSharedState = () => {
    setShareSession(null)
    clearShareHash()
  }
  const mergeSharedState = () => {
    const result = mergeSharedLayout(loadLocal() ?? defaultState(), state)
    if (!result.ok) {
      setShareSession((session) =>
        session?.kind === 'valid' ? { ...session, mergeError: result.message } : session,
      )
      return
    }
    dispatch({ type: 'replace', state: result.state })
    setShareSession(null)
    clearShareHash()
  }

  const patch = (patchState: Partial<AppState>) => dispatch({ type: 'patch', patch: patchState })
  const addCharts = (charts: ChartData[]) => dispatch({ type: 'charts/add', charts })
  const clearCharts = () => {
    if (
      !window.confirm(
        'Remove all charts from the library and clear the board? (Borders and weights are kept.)',
      )
    )
      return
    dispatch({ type: 'charts/clear' })
    selection.clearChart()
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
      {chrome.showOnboarding && (
        <Onboarding
          onClose={chrome.closeOnboarding}
          onDemo={() => addCharts(generateDemoCharts(25))}
        />
      )}
      {chrome.showMods && (
        <ModBrowser
          disabled={analysis.disabledSet}
          onToggle={(id, disabled) => dispatch({ type: 'mods/set-disabled', ids: [id], disabled })}
          onBulk={(ids, disabled) => dispatch({ type: 'mods/set-disabled', ids, disabled })}
          onClose={chrome.closeMods}
        />
      )}
      {showUpdates && <UpdatesLog onClose={() => setShowUpdates(false)} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      {showSaveWizard && (
        <SaveWizard
          pool={state.pool}
          keeps={state.pieceKeeps}
          reservations={state.strategyReservations}
          onApply={(pieceKeeps) => patch({ pieceKeeps })}
          onClose={() => setShowSaveWizard(false)}
        />
      )}
      {showPlanner && (
        <SessionPlanner
          pool={state.pool}
          mode={state.mode}
          borders={state.borders}
          reservations={state.strategyReservations}
          pieceKeeps={state.pieceKeeps}
          onUseStrategy={(strategyId) => patch({ strategyId })}
          onClose={() => setShowPlanner(false)}
        />
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
            onRemove={(uid) => dispatch({ type: 'charts/remove', uid })}
            onUpdate={(chart) => dispatch({ type: 'charts/update', chart })}
            onClearCharts={clearCharts}
            onOpenSaveWizard={() => setShowSaveWizard(true)}
          />
          <ImportPanel
            onImport={addCharts}
            state={state}
            borderResearch={borderResearch}
            onLoadState={(loadedState) => dispatch({ type: 'replace', state: loadedState })}
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
            onRemove={(cell) => dispatch({ type: 'board/remove', cell })}
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
              onAdvance={workflows.copyCurrentAndAdvance}
              onCancel={workflows.cancelCopySequence}
            />
          )}
          {workflows.preserveConfirmation && (
            <PreserveConfirmationPrompt
              confirmation={workflows.preserveConfirmation}
              onDecide={workflows.decidePreserve}
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
          <StrategySuggestions
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
