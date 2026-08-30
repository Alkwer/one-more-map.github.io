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

## Local quality gate

The required jobs in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
have two paths. `npm run validate` is only the static/unit/build portion of the
normal path, not the entire CI gate. All normal changes, including documentation
and configuration changes, run the following checks.

### Normal changes

Run these commands from the repository root in Bash on Linux (the quality job's
platform), using Node 24 and authenticated GitHub CLI access to the canonical
repository. The private-reporting check reads a repository setting; a permission
error requires a maintainer or CI to verify it, and must not be treated as a pass.

```bash
npm ci
test "$(gh api repos/Alkwer/one-more-map.github.io/private-vulnerability-reporting --jq '.enabled')" = true
export CI=1
export PAGES_CANONICAL_ORIGIN=https://alkwer.github.io
export PAGES_PRODUCTION_SITE_PREFIX=/one-more-map.github.io/
export PLAYWRIGHT_PROJECT_SITE_PREFIX=/one-more-map.github.io/
npm run audit:ci
npm run validate
npm run test:performance
npx playwright install --with-deps chromium webkit
npm run build:pages:e2e
npx playwright test
```

`npm run test:e2e` combines the last two commands. The browser matrix is required
for every normal change, not only edits to browser code. Browser installation
is needed once per Playwright version; `--with-deps` installs Linux system
dependencies and may require elevated OS permissions. `CI=1` also matches CI's
single browser worker, retry policy, forbidden focused tests, and fresh preview
server requirement.

The separate Windows job must also pass. On Windows, install the same pinned
AutoHotkey v2.0.26 runtime used by `deploy.yml` (its install step records the
download URL and SHA-256), then run the following in PowerShell. Adjust the
runtime directory to its actual location; the native probe skips without an
installed runtime, so check that the executable exists first:

```powershell
npm ci
$env:AUTOHOTKEY_V2_DIR = 'C:\tools\AutoHotkey-2.0.26'
if (-not (Test-Path (Join-Path $env:AUTOHOTKEY_V2_DIR 'AutoHotkey64.exe'))) {
    throw 'Install the pinned AutoHotkey v2.0.26 runtime before the native launcher check.'
}
npx vitest run --config vitest.config.ts tests/border-ocr.test.ts
npx playwright install chromium
npm run test:e2e:exit
```

`test:e2e:exit` verifies bounded no-tests and deliberately failing Playwright
runs and checks that the preview port is released. A Linux or macOS
run cannot substitute for this Windows process-cleanup gate. Contributors
without Windows should report that limitation and require the Windows CI job
to pass before merge.

Browser staging builds the deployable Pages artifact in `staging/` and a
`staging-playwright/` wrapper that serves it at the root and below
`PLAYWRIGHT_PROJECT_SITE_PREFIX` (default `/one-more-map.github.io/`). It then
runs the bounded desktop Chromium, mobile Chromium, WebKit, and focused nested
deployment projects against that production artifact. See
[docs/browser-support.md](docs/browser-support.md) for the exact flow and
viewport matrix.

`validate` checks test discovery, command documentation, generated research
statistics, and TypeScript application/E2E/test/benchmark/configuration files;
then it runs unit, data, and workflow tests, lint, LF enforcement, Prettier, and
the production build with bundle budgets. When changing the solver or scoring
hot path, also run `npm run bench:solver` as a diagnostic; the performance gate
above is mandatory for all normal changes. The environment and budgets are in
[docs/solver-performance.md](docs/solver-performance.md). The full command
reference is in [README.md](README.md#commands).

### Dataset-only changes

The focused path applies only when `data/border-rolls-v2.json` changes, optionally
with its generated corpus-statistics block in `RESEARCH.md`, and no other files
change. CI's path classifier permits the whole `RESEARCH.md` file, so contributors
must keep edits there limited to the generated block. A README-only, research-only,
or mixed code/data change uses the normal gate. Manual workflow dispatch always
uses the normal gate.

Fetch the current accepted source corpus before validation. Do not point the
validator at the proposed dataset as its own source. These Bash commands match
the dataset-only quality job and require authenticated GitHub CLI access:

```bash
npm ci
test "$(gh api repos/Alkwer/one-more-map.github.io/private-vulnerability-reporting --jq '.enabled')" = true
export BORDER_ROLL_ACCEPTED_PATH="$(mktemp)"
trap 'rm -f "$BORDER_ROLL_ACCEPTED_PATH"' EXIT
export PAGES_CANONICAL_ORIGIN=https://alkwer.github.io
export PAGES_PRODUCTION_SITE_PREFIX=/one-more-map.github.io/
export PLAYWRIGHT_PROJECT_SITE_PREFIX=/one-more-map.github.io/
node scripts/fetch-accepted-border-roll-issues.mjs \
  --repo Alkwer/one-more-map.github.io \
  --output "$BORDER_ROLL_ACCEPTED_PATH"
npm run validate:data-update
```

This verifies a byte-for-byte canonical rebuild from accepted issue records,
research statistics, data tests, the focused border-roll model test, LF endings,
formatting, and the production build/bundle budget. It skips dependency audits,
full unit/workflow/type/lint validation, solver timing, the browser matrix, and
the Windows job, exactly as the dataset-only CI path does. The accepted corpus
can change after a local fetch; rerun the fetch if CI reports a newer source.

The deployment-only `npm run build:pages`, Pages upload/deploy, and public URL
smoke test run after a successful push to `main`; they are not PR validation
commands and require the workflow's deployment configuration and credentials.

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
4. Run the applicable [local quality gate](#local-quality-gate), plus any relevant
   solver benchmark or manual check. Record any platform-only checks left to CI.
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
