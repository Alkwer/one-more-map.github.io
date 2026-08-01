# UI ownership boundaries

The React layer is split incrementally so that file moves do not change the rendered DOM, browser
storage, accessibility behavior, or worker protocol. These boundaries describe ownership rather
than introducing a new state-management framework.

## Persisted application state

`logic/storage.ts` remains the owner of the persisted `AppState` schema, migrations, JSON import
and export, and shared URL encoding. `state/appStateReducer.ts` owns pure transitions of that
existing shape. It must not read or write storage, schedule timers, access the clipboard, or run
domain calculations.

`App.tsx` initializes and saves the state, dispatches explicit transitions, coordinates transient
workflows, and composes the major screens. Importing a complete state uses the reducer's explicit
replacement action so storage and share compatibility remain unchanged.

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

Solver request lifecycle state owns worker creation, cancellation, request keys, stale-result
rejection, and result/error status. It continues to call `SolverWorkerClient`; expensive solver and
strategy work stays behind the Web Worker boundary. Controls, weights, regex output, and results
are presentational sections that receive values and explicit callbacks.

## Extraction order

1. Establish pure transitions, reusable selectors, and characterization tests.
2. Extract board cells and the border picker without changing DOM structure.
3. Extract chart editor and grid/list presentation.
4. Extract solver lifecycle state and its presentational sections.
5. Extract remaining `App.tsx` workflows and summary panels.

Every step keeps the existing Playwright assertions and runs `npm run validate` and
`npm run test:e2e` before handoff.
