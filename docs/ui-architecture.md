# UI ownership boundaries

The React layer is split incrementally so that file moves do not change the rendered DOM, browser
storage, accessibility behavior, or worker protocol. These boundaries describe ownership rather
than introducing a new state-management framework.

## Persisted application state

`logic/storage.ts` owns the persisted `AppState` schema, migrations, bounded JSON import and
export, and local-storage revival. `logic/share.ts` owns the independent, minimal layout-share
schema, URL-safe encoding, legacy v3 link compatibility, and hash resource limits.
`state/appStateReducer.ts` owns pure transitions of the persisted shape. It must not read or write
storage, schedule timers, access the clipboard, or run domain calculations.

`App.tsx` initializes and saves the state, dispatches explicit transitions, and composes the major
screens. `hooks/useVoyageAnalysis.ts` owns memoized derived scoring, connectivity, strategy,
appraisal, and board-summary data without persisting it. `hooks/useBoardSelection.ts` coordinates
library selection, placement, and cell swapping through explicit reducer actions.

`hooks/useVoyageWorkflows.ts` owns the transient copy sequence and preserved-chart confirmation.
The sequence order remains pure and tested in `state/copySequence.ts`; Voyage consumption remains
an explicit reducer transition. `hooks/useAppChrome.ts` owns onboarding, theme, modifier-browser,
and share-link UI state while retaining the existing storage keys. `App.tsx` keeps state opened
from a share hash isolated from local persistence until the user explicitly adopts the layout.
Importing a complete JSON state still uses the reducer's explicit replacement action.

`components/app/AppHeader.tsx`, `VoyageWorkflowPrompts.tsx`, `VoyageBoardStatus.tsx`, and
`components/VoyageRewards.tsx` render the extracted summary and workflow surfaces without changing
their DOM order, accessible names, or live regions.

## Board UI

`components/Board.tsx` owns the 3×3 grid and the placement of its 12 border controls.
`components/board/BoardCell.tsx` owns only cell rendering and its local copy feedback.
`components/board/BorderPicker.tsx` owns its open/query state, focus trap, Escape handling, and
focus restoration. `components/board/boardEdges.ts` derives presentation-only connector states;
connector and reachability rules remain in the existing domain modules.

Component extraction must keep the current direct children of `.board-grid`; adding wrapper nodes
changes CSS Grid placement. Accessible names, live regions, and focus order are compatibility
contracts.

## Chart library UI

`components/Library.tsx` owns filter/sort controls, the persisted grid/list preference, selection
coordination, and which editor is open. `components/library/libraryView.ts` filters and sorts charts
without owning state or mutating the pool. `components/library/ChartGrid.tsx` and
`components/library/ChartList.tsx` preserve the two existing presentation trees, while
`components/library/ChartEditor.tsx` owns chart field changes and explicit shape resolution.
Reusable chart ranking remains a pure heuristic in `logic/chartRanking.ts`, shared by the library
and filler solver without either UI component importing the other.

Grid/list persistence still uses the existing `library-view` storage key. Unresolved charts must
continue to open the list editor instead of becoming selectable, and the extracted presentation
components must preserve card classes, accessible names, pressed states, tooltips, and action order.

## Solver UI

`hooks/useSolverRequests.ts` owns worker creation, cancellation, request keys, stale-result
rejection, and keyed result/error status. It continues to call `SolverWorkerClient`; expensive
solver and strategy work stays behind the Web Worker boundary. `logic/solverPoolSelection.ts`
selects strategy reservations and filler charts without mutating the persisted pool.

`components/SolverPanel.tsx` derives eligible charts and effective weights, then composes
`SolverControls`, `RewardWeights`, `SolverActions`, `BestChartsRegex`, and `SolverResults`. These
presentation components receive values and explicit callbacks while preserving the existing DOM,
live-region wording, labels, result order, and keyboard behavior.

`SolverPanel` is the canonical solve/result surface. `SolverActions` starts worker-backed requests,
and `SolverResults` displays the keyed response without changing the board. A result is applied only
after the user selects it, through `useBoardSelection.applyBoard`; solver completion never mutates
the board automatically. UI components must not call the expensive `solve()` function directly on
the main thread or keep a parallel busy/result lifecycle.

## Extraction order

1. Establish pure transitions, reusable selectors, and characterization tests.
2. Extract board cells and the border picker without changing DOM structure.
3. Extract chart editor and grid/list presentation.
4. Extract solver lifecycle state and its presentational sections.
5. Extract remaining `App.tsx` workflows and summary panels.

Every step keeps the existing Playwright assertions and runs `npm run validate` and
`npm run test:e2e` before handoff.
