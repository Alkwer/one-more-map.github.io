# Accessibility verification

The primary Voyage workflow is designed to work without a mouse.

## Keyboard model

- Select a chart in the library with `Enter` or `Space`, then activate a board cell to place it.
- Activate one occupied cell and then another cell to swap them.
- Each occupied cell is followed in the tab order by Preserve, Copy, Rotate, and Remove actions.
- Open a border picker with `Enter` or `Space`. Focus moves to its search field.
- Press `Escape` anywhere in the border picker to close it and return focus to its border slot.
- Selecting a border modifier also closes the picker and returns focus to its border slot.
- Onboarding, modifier browser, updates, tutorial, keeper wizard, and session planner open as named
  modal dialogs. Focus moves to the dialog heading so its structure can be read before its controls.
- Individual chart deletion opens a named confirmation dialog from both library views. Its warning
  identifies any affected board cell, and focus moves to `Cancel` as the safe default action.
- `Tab` and `Shift+Tab` stay inside the active dialog. The rest of the application is inert until the
  dialog closes.
- `Escape`, the visible close action, and a backdrop click close these dialogs and return focus to
  the exact control that opened them. The automatically shown first-run onboarding dialog instead
  returns focus to the first logical header action because it has no invoking control.
- Importer-update notices use the same focus, trap, inert-background, dismissal, and restoration
  model. Saved-state recovery is an `alertdialog`: it moves focus to its heading and traps focus,
  but deliberately ignores `Escape` and backdrop clicks because the user must retry, migrate, or
  explicitly confirm a reset. Focus returns to the invoking control or the first header action once
  recovery is resolved.

Board-cell names expose the cell number, row, column, start state, occupancy, chart name, rotation,
selection, and preservation state. The visual layout remains a 3×3 board surrounded by 12 border
modifier controls.

## Automated checks

Run the production-style Chromium suite:

```bash
npm run test:e2e
```

The suite runs axe against the primary screen, the open border dialog, and every modal workflow. It
checks initial focus, forward and reverse focus trapping, Escape dismissal, backdrop and visible
close actions, background inertness, and trigger-focus restoration. It also exercises confirmed and
canceled chart deletion from the library, placement, preservation, rotation, board-only removal,
swapping, picker dismissal, and picker focus restoration with the keyboard and touch controls.

## Manual screen-reader check

For an accessibility change, verify at least one screen-reader/browser combination and record it in
the pull request. The minimum walkthrough is:

1. Navigate by headings and landmarks from the page title through Library, Import, Voyage Board,
   Voyage Rewards, and Diagnostics.
2. Import a chart and complete place, preserve, rotate, swap, and remove operations.
3. Open a border picker, confirm its dialog name and search-field focus, close it with `Escape`, and
   confirm focus returns to the trigger.
4. Open each modal workflow and confirm its dialog name and heading are announced. Traverse the
   controls in both directions, including the tutorial steps and keeper-count controls, and confirm
   focus never reaches the dimmed page.
5. Close each modal with `Escape`, its visible close action, and the backdrop. Confirm focus returns
   to the invoking control; for automatic first-run onboarding, confirm it moves to the first header
   action.
6. Trigger saved-state recovery and confirm it is announced as an alert dialog, the page stays
   inert, focus remains trapped, and `Escape` does not dismiss the required decision.
7. In Session Plan, confirm every `Use` button announces the strategy it activates. In Tutorial,
   confirm the close button and each step selector have descriptive names and the current step is
   conveyed.
8. Trigger an import result and a solver result and confirm each is announced once.
9. Repeat focus checks in both Allflame and Harvest themes.

Current verification record (2026-07-31): Windows Narrator with Chromium, covering the primary
heading and landmark outline, board-cell names and states, the named border dialog and search field,
Escape focus restoration, and focus visibility in both themes. Import and solver live regions were
cross-checked in Chromium's accessibility tree and the keyboard-driven browser suite.

## Exceptions

Automated axe checks cannot prove screen-reader wording, logical workflow, or focus visibility.
Those remain part of the manual walkthrough above. There are no known product exceptions to the
keyboard or accessible-name requirements.
