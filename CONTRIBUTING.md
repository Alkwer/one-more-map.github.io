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

`validate` runs TypeScript checking, the Vitest suite, ESLint, Prettier's format
check, and the production build. When changing the solver or scoring hot path,
also run `npm run test:performance` and `npm run bench:solver`. The benchmark
environment and budgets are documented in
[docs/solver-performance.md](docs/solver-performance.md). The full command
reference is in [README.md](README.md#commands).

## Architecture

- `src/App.tsx` owns the top-level application state and composes the major
  screens.
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
- `benchmarks/` contains the solver performance fixture and benchmark.
- `.github/workflows/deploy.yml` is the pull-request quality gate and GitHub Pages
  deployment.

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

Pull requests run the quality job but do not deploy. A merge to `main` deploys
only after that same quality gate succeeds.
