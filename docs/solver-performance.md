# Solver performance budget

This document defines the deterministic 25-chart reference workload, quality
floor, latency target, and CI regression budget introduced for issue #31.

## Reference workload

The shared scenario in `benchmarks/performance-fixture.ts` is the source of
truth for the benchmark and quality checks:

- 25 deterministic charts with a fixed mix of connector shapes and modifiers;
- 12 fixed border segments, including magnitude, rare, and
  quantity-per-connection effects;
- strict connectivity, rotation enabled, physical adjacency, and adjacent
  modifiers not affecting their source chart;
- interactive seed `0x15c0ffee`, top five results, and the production defaults
  of 40 restarts × 4,000 iterations;
- all six strategy definitions, each using 12 restarts × 900 iterations for
  inventory evaluation.

`npm run bench:solver` performs one warm-up and reports the mean of three
measured samples. `npm run test:performance` performs one warm-up and gates on
the median of five samples.

## Reference environment

The before/after results below were collected on 2026-07-31 with:

- AMD Ryzen 7 9800X3D 8-Core Processor;
- 64-bit Windows, build 10.0.26200;
- Node.js 24.13.1;
- the committed fixture and seed described above;
- no other intentional CPU-heavy workload.

Timings vary by machine. The product target is measured on this documented
reference environment; CI uses a wider regression tolerance described below.

## Before and after

| Workload           | Issue baseline at `8bf3f8d` | Recheck before the fix at `d95213f` | After the fix | Improvement from recheck | Target |
| ------------------ | --------------------------: | ----------------------------------: | ------------: | -----------------------: | -----: |
| Strategy inventory |                     ~1.28 s |                             1.132 s |   **0.143 s** |                 **7.9×** |   ≤1 s |
| Interactive solve  |                     ~3.38 s |                             3.207 s |   **0.237 s** |                **13.5×** |   <2 s |

The initial targets are met without reducing restart or iteration counts. The
known best interactive result remains fully reachable with an objective of at
least 145.68 and displayed reward of at least 144.48. Strategy inventory keeps
the established ranking and per-strategy quality floors.

## Profile findings

A V8 CPU profile of the pre-fix deterministic interactive workload attributed
approximately:

- 70% to `scoreBoard` and its effect/breakdown callbacks;
- 12% to connectivity and repeated rotated-edge lookup;
- 6% to repeatedly deriving reward families with regular expressions;
- 5% to garbage collection caused by hot-path temporary arrays, maps, sets,
  and effect objects;
- less than 2% to hill-climb control flow and seeded random-number generation.

The dominant waste was computing `perTile` and `perStat` UI breakdowns for
every hill-climb candidate even though candidate selection consumes only one
scalar score. Connectivity was also walked independently by validation and
scoring.

The optimized path now compiles static chart, border, disabled-mod, reward-key,
and weight data once per search. Candidate evaluation produces only the scalar
score. The full breakdown is retained for recorded results, and connectivity
analysis is shared with scoring.

Worker startup was measured separately in Chrome against the Vite development
server. After one warm-up, ten create → trivial request → response → terminate
samples had a 10.7 ms median and 12.1 ms p90. Startup is not a primary latency
driver, so the terminate-on-cancel design remains: it immediately stops stale
synchronous searches and preserves request isolation. The 80 ms inventory
debounce and exact-key result cache continue to absorb short editing bursts and
repeat requests.

## Search-budget decision

The production defaults remain at 40 × 4,000 for interactive searches and
12 × 900 per strategy. Deterministic early stopping was considered but is not
needed after removing evaluation overhead. Lowering exploration now would save
little user-visible time while risking a silent quality regression on plateaus.

Any future change to restarts, iterations, move acceptance, or stopping rules
must update the quality floors with evidence from more than one fixture/seed.
Heuristic results must continue to be described as near-optimal rather than
globally optimal.

## Quality and CI budgets

`tests/solver-performance-quality.test.ts` is the non-timing quality gate. It
allows better results but rejects lower known-best scores, invalid connector
layouts, loss of full reachability, duplicate top results, or strategy-ranking
regressions. `tests/scoring.test.ts` also compares the compiled scalar scorer
with the full breakdown across 120 deterministic boards covering physical and
connected adjacency, self-adjacency, rotation, imported rewards, disabled
modifiers, empty cells, and border effects.

The CI timing gate runs separately after `npm run validate` so other test files
cannot contend with the measurement. It uses one warm-up, the median of five
samples, and a 25% noisy-runner allowance:

| Workload           | Reference target | CI budget |
| ------------------ | ---------------: | --------: |
| Strategy inventory |         1,000 ms |  1,250 ms |
| Interactive solve  |         2,000 ms |  2,500 ms |

The wider CI ceiling is a regression alarm, not a revision of the user-facing
target. A failure should be reproduced with `npm run bench:solver` and
`npm run test:performance` on an otherwise idle machine before changing the
budget.

## Reproducing

```bash
npm ci
npm test
npm run test:performance
npm run bench:solver
```

Record the commit, CPU, operating system, Node.js version, fixture/seed changes,
sample count, and both quality and timing results when publishing a new
baseline.
