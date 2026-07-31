# Allflame Voyage Solver

A browser-based planner and auto-solver for the **Voyage Board** in Path of
Exile 3.29 _Curse of the Allflame_.

## What it does

- Models the 3×3 Voyage Board, chart rotation, connector validity, reachability
  from the bottom-left start, and all 12 Corruption Current border segments.
- Imports Charted Charts from their in-game `Ctrl+C` item text. Unknown modifier
  lines are preserved, and unknown shapes require confirmation instead of being
  guessed.
- Scores layouts using configurable reward weights and shows the contribution
  from charts, borders, and voyage modifiers.
- Finds an optimal layout exhaustively for pools of up to nine charts without
  rotation. Larger or rotational searches use seeded hill climbing with
  restarts.
- Saves data in the browser, imports/exports JSON, and shares layouts through
  URL state.
- Includes an optional Windows AutoHotkey helper for copying charts and reading
  border tooltips with local Windows OCR.

## What the model can and cannot claim

The project separates observed game mechanics from app-level assumptions:

- **Confirmed mechanics:** the 3×3 board and 12 border segments, chart item text
  and shapes, connector matching, chart rotation, the bottom-left start, and the
  distinction between self, adjacent, and voyage-wide effects.
- **Solver heuristics:** user-defined reward weights, strategy rankings,
  appraiser thresholds, and the approximate search used for larger pools.
  Scores are utility scores for comparing layouts, not currency expected value.
- **Still unknown:** border selection weights, tier eligibility, duplicate and
  independence rules, the paid-reroll distribution, and the exact reset/cap
  behavior. The app does not present a uniform random simulation as a proven
  in-game probability model.

See [RESEARCH.md](RESEARCH.md) for the evidence, assumptions, and remaining
research questions.

## Quick start

Use Node.js 24 (the version used by CI) and npm:

```bash
npm ci
npm run dev
```

The development server is available at `http://localhost:5173`.

## Commands

| Command                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `npm ci`                   | Install the exact dependency versions from `package-lock.json` |
| `npm run dev`              | Start the Vite development server                              |
| `npm test`                 | Run the Vitest test suite once                                 |
| `npm run test:performance` | Enforce the noise-tolerant solver latency budget               |
| `npm run typecheck`        | Check TypeScript without emitting files                        |
| `npm run lint`             | Run ESLint with zero warnings allowed                          |
| `npm run format:check`     | Check formatting with Prettier                                 |
| `npm run format`           | Rewrite supported files with Prettier                          |
| `npm run build`            | Create the production bundle in `dist/`                        |
| `npm run preview`          | Serve the production bundle locally after a build              |
| `npm run validate`         | Run typecheck, tests, lint, formatting, and production build   |
| `npm run bench:solver`     | Run the solver performance benchmark                           |

Run `npm run validate` before opening a pull request. The deterministic solver
fixture, quality floor, reference environment, and current before/after timings
are documented in [docs/solver-performance.md](docs/solver-performance.md).

## Importing charts and borders

Paste one or more Charted Charts into the importer using their in-game `Ctrl+C`
text. Uncharted charts are rejected because their Voyage Modifier has not yet
been revealed.

Border modifiers can be entered manually. On Windows, the optional
[AutoHotkey OCR helper](docs/windows-ocr.md) can automate chart copying and read
the 12 visible border tooltips. It requires AutoHotkey v2, a Windows OCR language
capability, a visible unscrolled Voyage Board, and Path of Exile in Windowed or
Windowed Fullscreen mode.

## Architecture

The application is a static React + TypeScript SPA. Parsing, scoring, solver
search, worker communication, persistence, and UI components are kept in
separate modules. See [CONTRIBUTING.md](CONTRIBUTING.md#architecture) for the
module map and contributor workflow.

## Deployment

GitHub Actions runs `npm ci` and `npm run validate` for pull requests and pushes
to `main`. A successful `main` build is staged under
`/allflame-voyage-solver/`, with a redirect at the Pages root, and then deployed
to GitHub Pages. The workflow is defined in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Local data and privacy

Saved charts and settings stay in browser `localStorage` unless they are
explicitly exported or encoded into a share URL. The Windows helper performs OCR
on the local machine; temporary screenshots and helper output are removed after
each attempt or when the script exits.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).
