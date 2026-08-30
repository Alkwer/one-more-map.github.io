# Contributing

Contributions are welcome, especially parser fixtures and localization patches.
By contributing, you agree that your work is released under the repository's
MIT license.

## Development setup

Use Node.js 24 (the CI version) and npm:

```bash
npm ci
npm run dev
```

Before opening a pull request, run the same quality gate as CI:

```bash
npm run validate
```

For browser, Web Worker, import/export, or GitHub Pages path changes, also run:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

This builds the deployable Pages artifact in `staging/` and a
`staging-playwright/` wrapper that serves it at the root and below
`PLAYWRIGHT_PROJECT_SITE_PREFIX` (default `/one-more-map.github.io/`). It then
runs the bounded desktop Chromium, mobile Chromium, WebKit, and focused nested
deployment projects against that production artifact. See
[docs/browser-support.md](docs/browser-support.md) for the exact flow and
viewport matrix.

`validate` strictly type-checks application code, E2E tests, root tests,
benchmarks, and the Vite/Vitest configuration before running the Vitest suite,
ESLint, Prettier's format check, and the production build. When changing the
solver or scoring hot path, also run `npm run test:performance` and
`npm run bench:solver`. The benchmark environment and budgets are documented in
[docs/solver-performance.md](docs/solver-performance.md). The full command
reference is in [README.md](README.md#commands).

## Dependency updates and audit policy

Dependabot checks the npm ecosystem weekly. Compatible minor and patch updates
to development tools are grouped, and at most three npm version-update pull
requests remain open at once.

Run the same non-mutating audit policy as CI with:

```bash
npm run audit:ci
```

The first audit rejects every known production-dependency advisory. The second
rejects high or critical findings across the full tree, so high-severity
development-only advisories also block the quality job. Low and moderate
development-only findings stay visible in the report but do not block CI; review
them with the weekly Dependabot updates. CI never runs `npm audit fix` or changes
the lockfile automatically. If an audit fails, inspect `npm audit`, update the
specific direct dependency or transitive lockfile entry, and rerun the audit and
normal validation before opening a pull request.

## Architecture

- `src/App.tsx` owns the top-level application state and composes the major
  screens.
- `src/state/` contains pure transitions for persisted UI state and transient
  workflow state. Detailed ownership boundaries and extraction invariants are
  documented in [`docs/ui-architecture.md`](docs/ui-architecture.md).
- `src/components/` contains the board, chart library, importer, solver controls,
  border appraiser, voyage advisor, and strategy UI.
- `src/types.ts` defines the shared chart, board, modifier, scoring, and solver
  contracts.
- `src/data/mods.ts` and `src/data/strategies.ts` contain canonical game modifier
  and strategy definitions. Their IDs are persistent storage keys; do not rename
  existing IDs without a migration.
- `src/logic/parser.ts`, `regex.ts`, and `chartShapes.ts` convert clipboard text
  into canonical chart data. Real client samples belong in
  `src/logic/__fixtures__/`.
- `src/logic/importParser.ts`, `importWorkerClient.ts`, `importWorkerProtocol.ts`,
  and `src/workers/import.worker.ts` keep bounded clipboard parsing off the UI
  thread. A new request must terminate stale parsing, and component teardown
  must cancel pending worker work.
- `src/logic/scoring.ts`, `connectivity.ts`, and `solver.ts` evaluate boards and
  search for layouts. The exhaustive and approximate search paths must obey the
  same connector and reachability rules.
- `src/logic/solverWorkerClient.ts`, `solverWorkerProtocol.ts`, and
  `src/workers/solver.worker.ts` keep expensive searches off the UI thread and
  define the worker boundary.
- `src/logic/borderAppraisal.ts`, `rerollAdvice.ts`, and `voyageDecision.ts`
  provide decision-support heuristics. They must not describe unknown roll
  probabilities as expected value.
- `src/logic/storage.ts` owns browser persistence and migrations.
- `public/voyage-import.ahk` is the optional Windows chart-copy and border-OCR
  helper. Its user instructions live in [docs/windows-ocr.md](docs/windows-ocr.md).
- `benchmarks/` contains solver and maximum-size import performance fixtures.
- `.github/workflows/deploy.yml` is the pull-request quality gate and GitHub Pages
  deployment. `process-border-roll-data.yml` validates and resolves data issues;
  `build-border-roll-dataset.yml` opens reviewable batch-update PRs. Their pure
  parsing and aggregation code lives under `scripts/` and is covered by
  `npm run test:data`.

Tests live next to the modules they cover. Add a focused regression test when
changing parsing, storage, worker behavior, scoring, connectivity, or solver
search.

## Data and model changes

- Separate confirmed mechanics, app heuristics, and unknown behavior in code,
  labels, and documentation. Update [RESEARCH.md](RESEARCH.md) when new evidence
  changes that boundary.
- Preserve canonical modifier IDs and shape names. Map localized text to them at
  the parser boundary.
- Import unknown shapes as unresolved with a clear reason rather than guessing a
  layout. Unresolved charts must stay out of solver inputs until the user selects
  a canonical shape.
- Include clipboard fixtures for every parser format or language added. Extend
  the importer detection in `src/components/ImportPanel.tsx` when the localized
  item-class line differs.
- Keep benchmark fixtures deterministic. Document intentional score or search
  tradeoffs in the pull request.

## Pull requests

1. Branch from an up-to-date `main` and keep the change focused.
2. Install from the lockfile with `npm ci`.
3. Make the change and add or update tests and documentation.
4. Run `npm run validate` and any relevant solver benchmark or manual check.
5. Describe the user-visible effect, model assumptions, and verification in the
   pull request.

Use `agent/<issue-or-short-description>` or
`codex/<issue-or-short-description>` for task branches and
`automation/<workflow>-<run-id>` for disposable workflow branches. Branches
with open pull requests or work not integrated into `main` must be retained;
merged heads are deleted automatically. The full audit, expected-SHA deletion,
retention, and recovery procedure is documented in
[docs/branch-maintenance.md](docs/branch-maintenance.md).

Branch maintenance is limited to `origin`. This repository does not maintain an
upstream synchronization workflow.

Pull requests run the quality job but do not deploy. A merge to `main` deploys
only after that same quality gate succeeds.

## Public feedback

Use the app's **Feedback** link for a bug report or **Request a feature** in the
footer for an improvement. Both open structured GitHub forms with the full app
revision and build time already filled in. Bug reports ask for reproduction
steps, browser/OS and game patch; importer diagnostics remain optional.
[Choose a report type](https://github.com/Alkwer/one-more-map.github.io/issues/new/choose)
when reporting from outside the app. Never use public issue forms for security
reports; follow [SECURITY.md](SECURITY.md) instead.
