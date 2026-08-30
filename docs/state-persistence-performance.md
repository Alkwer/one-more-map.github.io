# State mutation and autosave CPU budget

Issue #339 removes repeated full-library work from the mutation/autosave path.
Domain state and codecs remain independent of browser storage (issue #366).

## Validation boundaries

- Imports continue to decode and migrate untrusted JSON with the existing field,
  count, character, and file-size limits.
- A replacement or chart-library mutation fully validates the compact JSON,
  readable export, UTF-8 export size, and decode-without-recovery requirement.
  It retains those exact strings as a frozen, typed payload. Autosave writes
  that payload and still reads the storage key back to verify the write.
- Once the reducer has certified a state, settings and board mutations with an
  unchanged library validate only settings and the nine board references. They
  subtract/add the small metadata envelopes' exact compact/pretty JSON lengths
  and UTF-8 bytes. Escaping, indentation, non-ASCII text, and chained mutations
  are covered by equivalence tests against fresh full validation.
- A metadata mutation has no reusable full payload, so autosave performs full
  validation once at the persistence boundary. Consecutive metadata changes can
  use their updated size certificate before the debounced autosave runs.
- Arbitrary/manual saves and exports always perform fresh full validation.
  There is no state-identity cache that could let later in-place mutations skip
  validation. The reducer's certificate relies on its normal immutable-state
  contract, while a prepared payload contains immutable strings, not live state.

## Workload and budget

`benchmarks/state-persistence-fixture.ts` creates all 250 allowed charts, with
raw text distributed within each chart's 32 KiB limit. Its readable UTF-8 export
is exactly **2,097,024 bytes**, 128 bytes below the 2 MiB ceiling.

The timing gate measures a board rotation plus autosave (incremental reducer,
full save validation) and a preserved-chart toggle plus autosave (full reducer
validation, reused save payload). Each sample includes verified writes to an
in-memory implementation of the repository's storage interface. The fixture and
the initial certification are outside the measured steady-state operation.

The target is a median of **8 ms** per mutation plus autosave. CI allows 25%
runner noise, for a **10 ms** median ceiling, after three warm-ups and eleven
measured samples. Native browser `localStorage` I/O can vary by device, browser,
quota, and disk conditions; this portable gate measures application CPU work and
the write/read verification path, not a browser disk-latency guarantee.

## Reference measurement

Measured on 2026-08-31 with an AMD Ryzen 7 9800X3D, Windows 10.0.26200, and
Node.js 24.19.0. The baseline uses the original codec/reducer-save sequence from
commit `8ee1cd8`; the after measurements use this issue's implementation with
the same fixture, warm-ups, sample count, and in-memory repository.

| Mutation plus autosave | Before median | After median | Target | CI ceiling |
| ---------------------- | ------------: | -----------: | -----: | ---------: |
| Board rotation         |      10.15 ms |      5.24 ms |   8 ms |      10 ms |
| Preserved-chart toggle |      10.67 ms |      4.59 ms |   8 ms |      10 ms |

These values are a reference, not a timing assertion against the baseline.
The regression gate enforces the documented absolute budget. Run timing tests
on an otherwise idle machine before changing a budget:

```bash
npm run test:performance -- tests/performance/state-persistence-budget.test.ts --silent=false
```

`src/state/statePersistence.test.ts` separately checks payload reuse, unchanged
library serialization avoidance, exact character/UTF-8 limits, malformed board
references/settings, replacement validation, and fresh arbitrary save/export
validation. Existing storage/recovery tests continue to cover quota failures and
verification without weakening recovery behavior.
