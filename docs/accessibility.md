# Accessibility verification

The primary Voyage workflow is designed to work without a mouse.

## Keyboard model

- Select a chart in the library with `Enter` or `Space`, then activate a board cell to place it.
- Activate one occupied cell and then another cell to swap them.
- Each occupied cell is followed in the tab order by Preserve, Copy, Rotate, and Remove actions.
- Open a border picker with `Enter` or `Space`. Focus moves to its search field.
- Press `Escape` anywhere in the border picker to close it and return focus to its border slot.
- Selecting a border modifier also closes the picker and returns focus to its border slot.

Board-cell names expose the cell number, row, column, start state, occupancy, chart name, rotation,
selection, and preservation state. The visual layout remains a 3×3 board surrounded by 12 border
modifier controls.

## Automated checks

Run the production-style Chromium suite:

```bash
npm run test:e2e
```

The suite runs axe against the primary screen and the open border dialog, then exercises placement,
preservation, rotation, removal, swapping, picker dismissal, and picker focus restoration with the
keyboard.

## Manual screen-reader check

For an accessibility change, verify at least one screen-reader/browser combination and record it in
the pull request. The minimum walkthrough is:

1. Navigate by headings and landmarks from the page title through Library, Import, Voyage Board,
   Voyage Rewards, and Diagnostics.
2. Import a chart and complete place, preserve, rotate, swap, and remove operations.
3. Open a border picker, confirm its dialog name and search-field focus, close it with `Escape`, and
   confirm focus returns to the trigger.
4. Trigger an import result and a solver result and confirm each is announced once.
5. Repeat focus checks in both Allflame and Harvest themes.

Current verification record (2026-07-31): Windows Narrator with Chromium, covering the primary
heading and landmark outline, board-cell names and states, the named border dialog and search field,
Escape focus restoration, and focus visibility in both themes. Import and solver live regions were
cross-checked in Chromium's accessibility tree and the keyboard-driven browser suite.

## Exceptions

Automated axe checks cannot prove screen-reader wording, logical workflow, or focus visibility.
Those remain part of the manual walkthrough above. There are no known product exceptions to the
keyboard or accessible-name requirements.
