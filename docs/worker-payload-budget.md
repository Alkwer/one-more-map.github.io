# Solver worker payload budget

The solver worker receives at most 250 charts. Its chart DTO payload must remain
at or below 128 KiB when encoded as UTF-8 JSON, including maximum-length chart
names, modifier ids, and reward aggregates used by the solver. Imported source
text and presentation state are excluded before `postMessage`.

The regression in `src/logic/solverWorkerProtocol.test.ts` measures this stable
structured-clone size proxy under Vitest on Node.js 24, Windows x64. Run it with:

```text
npx vitest run --config vitest.config.ts src/logic/solverWorkerProtocol.test.ts
```
