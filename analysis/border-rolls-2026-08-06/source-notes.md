# Border-roll analysis source notes

## Reporting job

- Question: czy obecny korpus border modów pozwala już wyciągnąć wnioski użyteczne dla modelu i produktu?
- Decision: co można już zakodować lub komunikować, a co nadal powinno pozostać eksperymentalne.
- Audience: product stakeholders.
- Delivery: portable HTML report.
- Scope: canonical `origin/main` dataset at commit `5da127d99125722301046ab56461574f73c67f1e`, exported 2026-08-07 14:29 UTC.
- Grain: one complete 12-slot board; sequence grouping is retained for generation comparisons.
- Current sample: 42 boards, 21 sequences, 504 slots; 21 natural boards and 21 paid rerolls from 12 sequences.

## Required-structure mapping

- Title: `Co już wiemy o border modach`.
- Executive Summary: visible immediately after the title.
- Key findings with quantitative evidence: slot-family lookup, ranked frequency chart, and decision summary.
- Recommended next steps: explicit model and collection priorities.
- Further questions: slot eligibility, Vesper, generation, contributor breadth.
- Caveats and assumptions: patch, sample size, unknown Vesper records, contributor identity, and non-causal interpretation.

## Chart map

| Report segment | Analytical question | Family / type | Fields | Supported claim | Palette |
|---|---|---|---|---|---|
| Slot structure | Are semantic mod families independent of border position? | Compact lookup table | family, expected_position, observed, match_rate | Four reward families occupy their corresponding middle-side slot in all 21 observations. | n/a |
| Pool concentration | Are canonical modifiers close to uniformly weighted? | Ranked horizontal bar | label, slot_share, boards, sequences, natural_slots, paid_slots, rank | The top eight mods account for 40.7% of 504 slots; the uniform 1/64 benchmark is not credible. | single blue root |

The slot-family evidence is a table because exact positions and counts are the point. The concentration evidence uses one sorted horizontal bar with a zero baseline, long-label space, direct category labels, and no redundant category color encoding. Exact chart rows retain board, sequence, generation, rank, denominator, and benchmark context in the embedded dataset.

## Reproducibility and validation

- Executed analysis: `node analysis/border-rolls-2026-08-06/analyze.mjs`.
- Slot association uses 20,000 within-board permutations after collapsing numbered tiers into families.
- Stability is reported as `first21` versus `afterFirst21`: 9/9 and 12/12 special-family hits landed in the expected slot.
- Natural versus paid comparison enumerates all 157,464 possible natural-board assignments within the 12 sequences that contain paid rerolls.
- Duplicate dependence check shuffles the 252 paid-reroll slot values across 21 boards while preserving global paid marginal counts.
- The companion JavaScript notebook is structurally valid but unexecuted; it delegates to the executed Node analysis and requires a JavaScript Jupyter kernel (`ijavascript`) to run interactively.
- The portable report is generated from the complete validated `artifact.json` through the packaged Data Analytics report builder.
- Builder validation and exact payload checks passed. Browser QA is `structural_only`: the installed Chromium headless shell left the enhanced reader in fallback state, so the delivered HTML retains the complete semantic chart table and report content but does not claim enhanced-reader viewport or interaction verification.

## Omitted or deferred analyses

- No Vesper effect estimate: only `5` and legacy/unknown are present, and the strata are time-confounded.
- No patch comparison: every board is patch 3.29.
- No contributor-diversity adjustment: the dataset intentionally omits player identity.
- No stable per-mod rare-event estimate for Divine or other unseen modifiers.
- No causal claim that position explains modifier value; the result is an association and likely eligibility restriction.

## Validation disposition

- Overall: share with caveats.
- Ready: duplicate allowance, observed reroll costs through index 2, strong slot/family association, and non-uniform concentration.
- Provisional: exact slot eligibility masks and any probability estimate for rare or unseen modifiers.
- Not established: equivalence of natural and paid rerolls, Vesper effects, higher reroll costs, or player-population representativeness.
