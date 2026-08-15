# Border-roll follow-up source notes

## Reporting job

- Question: co zmieniają próbki zaakceptowane 15 sierpnia 2026 i które wcześniejsze wnioski o border modach nadal się bronią?
- Decision: które reguły można bezpiecznie zachować w modelu, które trzeba poszerzyć oraz jakich danych nadal brakuje.
- Audience: product stakeholders.
- Delivery: MCP app report, with this folder as the reproducibility companion.
- Baseline: canonical dataset at commit `98bcced773e2d50982c8b8c1f7c568cdd08b3bcd`, exported 2026-08-14 22:54 UTC.
- Current: working-tree canonical dataset exported 2026-08-15 15:40 UTC.
- Grain: one complete 12-slot board; Voyage sequence grouping is retained.

## Evidence summary

- Issues [#403](https://github.com/Alkwer/one-more-map.github.io/issues/403) and [#404](https://github.com/Alkwer/one-more-map.github.io/issues/404) add five boards from two Voyages: two natural boards and three paid rerolls from one paid sequence.
- The corpus grows from 56 boards / 33 sequences to 61 boards / 35 sequences; paid evidence grows from 23 boards / 13 sequences to 26 boards / 14 sequences.
- The new sequence reaches reroll index 3 and displays the next cost as 24,000. The observed schedule is now 3k at index 0, 6k at index 1, 12k at index 2, and 24k at index 3.
- `+1 Exalt Drop` (`b-exalt`) is newly observed, increasing canonical modifier coverage from 50/64 to 51/64.
- `b-exalt` appears at Right 2, not the Top 2 slot predicted by the prespecified currency/currency-drop family. The new cohort therefore matches 6/7 prespecified family placements and the cumulative record becomes 38/39. This falsifies the strict universal form of that family rule, while the shipped model safely widens `b-exalt` eligibility from observed evidence.
- Scarab and experience families still replicate perfectly. The exploratory masks also receive clean new support: rare / rare-per-connection is now 66/66 inside the five bottom-touching segments, and `At least magic` is 19/19 inside the five top-touching segments.
- The previous top eight modifiers occupy 26.7% of the 60 new slots versus 40.5% before; the combined share moves to 39.3%. With only five boards, the increment is too small to infer a weight shift. A natural-board permutation comparison using only two new natural boards finds no detectable drift (`p = 0.464`).
- Duplicate modifiers remain common: 4/5 new boards and 55/61 boards overall contain a duplicate. The observed maximum remains four copies of one modifier.
- A matched sequence-level exact test still detects no natural-versus-paid distribution difference (`p = 0.286`, 14 paid sequences, 1,889,568 assignments). This remains a non-detection under selection bias, not evidence of equivalence.
- Divine remains unseen: 0/61 boards overall and 0/26 paid boards. The two-sided Wilson 95% upper bounds are 5.9% and 12.9% board appearance, respectively. The shipped slot-aware model's approximately 1.02% chance is prior-only and still permits Divine only in the top-middle slot.

## Data quality and source reconciliation

- GitHub exposes 35 accepted issues. All 35 have exactly one trusted validation comment and a matching accepted SHA-256 digest.
- An independent canonical rebuild produces 61 boards and is byte-for-byte identical to the updated working-tree dataset.
- New sample IDs and sequence IDs are unique; there are no cross-issue conflicts or digest mismatches.
- Every previous sample ID and normalized historical row is retained.
- The new records are all patch 3.29.3, Vesper upgrade count 5, and sampling reason `gameplay`.
- No sample is labelled `randomized-research`; 50/61 are legacy/unknown and 11/61 are ordinary gameplay. Natural/paid comparisons remain observational and selection-biased.
- Accepted issues still come through one GitHub account. This establishes source-channel concentration, not necessarily one player or device; the canonical dataset has no contributor field.

## Chart contract

| Segment             | Question                                              | Family / type        | Fields                                                                   | Supported claim                                                                                    | Palette          |
| ------------------- | ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------- |
| Evidence growth     | What did today's accepted corpus add?                 | Grouped vertical bar | cohort, boards, paidBoards, sequences                                    | Five boards were added, including three paid rerolls but only one paid sequence.                   | blue + neutral   |
| Frequency stability | Did the prior leading group persist?                  | Vertical bar         | cohort, slotShare, slots, boards                                         | The five-board increment is lower, but the cumulative top-eight share remains close to 40%.        | single blue root |
| Slot replication    | Did prespecified slot-family rules replicate?         | Compact table        | family, expectedPosition, newObserved, newMatch, cumulativeObserved      | One `b-exalt` placement breaks the strict currency-family rule; the other families remain perfect. | n/a              |
| Candidate masks     | Do the row-touching eligibility candidates replicate? | Compact table        | family, candidateMask, baselineObserved, newObserved, cumulativeObserved | Both exploratory masks receive clean additional observations.                                      | n/a              |
| Reroll schedule     | Which costs are now directly observed?                | Compact table        | rerollIndex, displayedNextCost, observations                             | Live data now reaches the 24k next-cost state.                                                     | n/a              |

## Required-structure mapping

- Title: `Border mody — aktualizacja z 15 sierpnia`.
- Executive Summary: direct answer immediately after the title.
- Key findings: corpus growth, first 24k observation, `b-exalt` slot exception, stable aggregate conclusions, and remaining rare-mod uncertainty.
- Recommended next steps: retain adaptive slot widening, inspect the `b-exalt` capture, and prioritize randomized paid sequences plus source breadth.
- Further questions: whether `b-exalt` legitimately spans two slots, Vesper/patch effects, contributor breadth, Divine/other unseen mods, and the 48k state.
- Caveats: one account/source channel, only one new paid sequence, no randomized-research cohort, within-board dependence, and observational comparisons.

## Reproducibility and validation

- Primary calculation: `node analysis/border-rolls-2026-08-15/analyze.mjs --baseline-ref 98bcced773e2d50982c8b8c1f7c568cdd08b3bcd --current-path data/border-rolls-v2.json --output analysis/border-rolls-2026-08-15/results.json`.
- Deterministic natural-board drift test: 20,000 board-level label permutations with seed `20260815`.
- Matched natural-versus-paid test: exact enumeration of the natural-board assignment inside all 14 paid Voyage sequences.
- Companion notebook: `border-roll-follow-up.ipynb`.
- The notebook is structurally valid and delegates to the executed Node analysis. It is not executed through Jupyter because the bundled runtime does not contain `nbformat`, `nbclient`, or a Jupyter kernel. The underlying Node analysis executes successfully.
