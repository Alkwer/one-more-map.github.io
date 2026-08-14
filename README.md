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
- Lets low-investment strategies protect Speedrun, Divine, and Meatfish
  keeper charts independently, so imported charts remain available when a
  protection is switched off.
- Finds an optimal layout exhaustively for pools of up to nine charts without
  rotation. Larger or rotational searches use seeded hill climbing with
  restarts.
- Saves data in the browser, imports/exports JSON, and shares layouts through
  URL state.
- Includes an optional Windows AutoHotkey helper for copying charts and reading
  border tooltips with local Windows OCR.
- Automatically records complete 12/12 border OCR scans locally for community
  research, with versioned JSON export and an opt-in reviewed GitHub submission
  flow when a Voyage is finished.

## What the model can and cannot claim

The project separates observed game mechanics from app-level assumptions:

- **Confirmed mechanics:** the 3×3 board and 12 border segments, chart item text
  and shapes, connector matching, chart rotation, the bottom-left start, and the
  distinction between self, adjacent, and voyage-wide effects.
- **Solver heuristics:** user-defined reward weights, strategy rankings,
  appraiser thresholds, and the approximate search used for larger pools.
  Scores are utility scores for comparing layouts, not currency expected value.
  Experimental strategies remain available for manual use but do not drive the
  automatic recommendation. The default reroll prompt is limited to the 3k and
  6k Sulphur steps as an explicit guardrail, not an optimal-stopping claim.
  The theoretical ceiling ratio is diagnostic only and never acts as a
  keep/reroll line. Complete rolls are compared with achievable slot-aware
  paid rolls for the same strategy: the full prior-sensitivity range must clear
  the 60th percentile initially or the median later to issue `PLAY`/`SWITCH`,
  and must remain fully below the line before suggesting a 3k/6k reroll. An
  overlapping range or unavailable comparison preserves the current board.
  Alc & Go receives fallback preference at a robust 50th modeled percentile.
  Low confidence remains visible and the guidance remains experimental. PoE
  3.29.3 Cursed Ducats are planner-wide and intentionally excluded from the
  layout score: their global monster rewards do not change layout ordering,
  while Toughness and the six build-specific downsides require character context
  the solver does not model.
- **Observed, still experimental:** complete boards strongly support physical
  slot families and confirm duplicate modifiers. No natural-versus-paid
  difference is detected yet, but the current sample does not establish
  equivalence. Exact weights, within-board independence, Vesper effects, and the
  reset/cap behavior remain unknown. The demo button now samples the same
  slot-aware model and is explicitly labelled experimental.

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

| Command                        | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `npm ci`                       | Install the exact dependency versions from `package-lock.json` |
| `npm run dev`                  | Start the Vite development server                              |
| `npm test`                     | Run the Vitest test suite once                                 |
| `npm run test:performance`     | Enforce the noise-tolerant solver latency budget               |
| `npm run validate:data-update` | Validate a dataset-only update and build the application       |
| `npm run audit:ci`             | Enforce the production and high-severity dependency policy     |
| `npm run check:scope`          | Verify test discovery stays inside the tracked project scope   |
| `npm run check:research-stats` | Check documented corpus statistics against canonical JSON      |
| `npm run sync:research-stats`  | Regenerate documented corpus statistics from canonical JSON    |
| `npm run typecheck`            | Strict-check app, E2E, tests, benchmarks, and TS configs       |
| `npm run lint`                 | Run ESLint with zero warnings allowed                          |
| `npm run check:eol`            | Require LF endings in every tracked text file                  |
| `npm run format:eol`           | Normalize every tracked text file to LF                        |
| `npm run format:check`         | Check formatting with Prettier                                 |
| `npm run format`               | Rewrite supported files with Prettier                          |
| `npm run build`                | Create the production bundle in `dist/`                        |
| `npm run preview`              | Serve the production bundle locally after a build              |
| `npm run build:pages`          | Build the Pages artifact and nested-prefix E2E wrapper         |
| `npm run preview:pages`        | Serve the staged E2E wrapper locally                           |
| `npm run test:e2e`             | Build and run the bounded Chromium/WebKit browser matrix       |
| `npm run test:e2e:exit`        | Check bounded Playwright teardown and preview-port cleanup     |
| `npm run test:e2e:ui`          | Build and open the interactive Playwright test runner          |
| `npm run validate`             | Run typecheck, tests, lint, formatting, and production build   |
| `npm run bench:solver`         | Run the solver performance benchmark                           |

Run `npm run validate` before opening a pull request. Git attributes, Prettier,
and the EOL check keep tracked text on LF even when Git uses `core.autocrlf=true`.
The deterministic solver
fixture, quality floor, reference environment, and current before/after timings
are documented in [docs/solver-performance.md](docs/solver-performance.md).

Install the Playwright browser binaries once before running browser tests locally:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

The suite uses the exact production artifact in both root-site and configurable
project-site layouts. Each test gets isolated browser storage and deterministic
fixtures. CI runs the full suite in desktop Chromium plus focused 390×844
Chromium, desktop WebKit, and nested project-site deployment projects, then
uploads the Playwright report for failed-run diagnosis. The exact browser,
viewport, and platform-specific coverage is documented in
[docs/browser-support.md](docs/browser-support.md).

Keyboard behavior, automated axe coverage, and the manual screen-reader checklist
are documented in [docs/accessibility.md](docs/accessibility.md).

## Importing charts and borders

Paste one or more Charted Charts into the importer using their in-game `Ctrl+C`
text. Uncharted charts are rejected because their Voyage Modifier has not yet
been revealed.

Clipboard imports are limited to 524,288 characters before parsing. The parser
also caps chart headers at 300, rejection reports at 20, border OCR blocks at
12, reroll and scan-metadata blocks at one each, individual lines at 2,048
characters, and the lines and characters processed for each chart or OCR block.
Oversized or structurally over-budget input is discarded with a concise error;
chart parsing stops as soon as the remaining 250-chart library capacity or the
rejection-reporting budget is exhausted.

The generated single-Chart, solved-board, and best-modifier search helpers,
their language support, and the repeatable live-client validation matrix are
documented in [docs/in-game-search.md](docs/in-game-search.md). Always verify
the highlighted Charts before moving or starting them.

Border modifiers can be entered manually. On Windows, the optional
[AutoHotkey OCR helper](docs/windows-ocr.md) can automate chart copying from both
chart-stash tabs and read the 12 visible border tooltips plus the next border-reroll cost. It requires
AutoHotkey v2, a Windows OCR language capability, a visible unscrolled Voyage
Board, and Path of Exile in Windowed or Windowed Fullscreen mode.

The importer also includes an opt-in **Contribute border-roll data** panel. Its
capture protocol and privacy-preserving sample schema are documented in
[docs/border-roll-data.md](docs/border-roll-data.md). Record every complete board,
not only notable outcomes, so the resulting frequency estimates are not biased.
Complete OCR scans are saved into the active Voyage sequence automatically.
`Finish Voyage` closes that sequence. Manual submission still opens a pre-filled
GitHub issue; a separately configured private submission key can instead queue
the issue automatically through the intake service. Automatic delivery is off
by default, so other visitors keep their samples only in their own browser.
Successfully delivered Voyage sequences are archived and hidden from the active
research list without deleting the local samples or removing them from exports.
GitHub Actions validates, labels, and closes submitted issues, while a separate
scheduled workflow prepares reviewable dataset-update pull requests.
Contributors can additionally enable a voluntary randomized-research mode. It
assigns 20% of new Voyages before the natural board is seen and asks for exactly
one affordable paid reroll even if the ordinary recommendation says keep. A
jackpot/preserve recommendation, including a Divine border, always overrides the
research assignment: the app tells the player to keep the natural board and
waives the research reroll. The assignment reason is exported with the sequence
so natural/paid comparisons are not based only on boards players chose to reroll.

## Architecture

The application is a static React + TypeScript SPA. Parsing, scoring, solver
search, worker communication, persistence, and UI components are kept in
separate modules. See [CONTRIBUTING.md](CONTRIBUTING.md#architecture) for the
module map and contributor workflow.

## Deployment

GitHub Actions runs `npm ci` and `npm run validate` for pull requests and pushes
to `main`. Changes limited to `data/border-rolls-v2.json` and its generated
corpus-statistics block in `RESEARCH.md` use focused dataset, model, and
production-build validation; they skip the Windows teardown job and browser
matrix. A successful `main` build is staged under
`/allflame-voyage-solver/`, with a redirect at the Pages root, and then deployed
to GitHub Pages. The workflow is defined in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Local data and privacy

Saved charts, research samples, and pending submissions stay in browser
`localStorage`. The optional limited submission key is held in memory only and
must be entered again after a reload; version 1 stored keys are erased during
migration. The app loads no third-party page scripts, and its Content Security
Policy allows scripts only from its own origin. Local data leaves the browser
only when explicitly exported, manually submitted, or when the user has enabled
automatic submission. A `Share layout` URL contains only the nine board cells, the charts
placed in them, their rotations, all 12 border slots, and the effective scoring
settings needed to reproduce the layout. Shared chart data is limited to the
name, level, area type, connectors, recognized modifier IDs, and numeric reward
rolls. It excludes unplaced library charts, original clipboard text, verbatim
implicit text, preservation flags, strategy reservations, keep counts, reroll
history, and other local preferences. Opening a share link uses an isolated
session and does not overwrite the recipient's saved state unless they explicitly
choose to replace it.

Externally supplied state is resource-bounded: new layout hashes are limited to
16 KiB, legacy v3 hashes to 256 KiB, JSON files to 2 MiB, and full libraries to
250 charts. Chart IDs are limited to 128 characters, names to 256, implicit text
to 4 KiB, original item text to 32 KiB, and connector-shape input to 256
characters. Each chart accepts at most 64 modifier IDs and 64 numeric rewards;
disabled-modifier lists and keep-count maps accept at most 256 entries. Normal
legacy v3 share links remain readable within the transitional hash limit and are
re-encoded in the minimal layout format when shared again. Layout payloads use
unpadded Base64URL over bounded UTF-8 JSON; compression is intentionally omitted
to keep decoding portable and avoid a separate decompression resource budget.

The GitHub credential remains only in the intake service and is never sent to
the browser. The Windows helper performs OCR on the local machine. During a
normal OCR attempt, a full-window PoE screenshot and UTF-8 OCR result briefly
touch `%TEMP%`; border scans also create a filtered screenshot and may create a
contrast-normalized fallback image. Best-effort cleanup runs after each attempt,
abort, timeout, and normal script exit. The PowerShell helper source is inherited
through an environment value and executed from memory; it is never written to a
`.ps1` file. None of these screenshots or OCR results is uploaded.

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).
