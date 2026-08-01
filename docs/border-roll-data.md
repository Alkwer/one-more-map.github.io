# Border roll data collection

The game client exposes the Corruption Current modifier pool, but not selection
weights, duplicate rules, or slot independence. The app therefore
collects complete observed boards instead of treating the known pool as uniform.

## Unbiased capture protocol

1. Capture the natural board before deciding whether it is good or bad.
2. If you pay for a reroll, capture every resulting board in order.
3. Keep the natural board and its paid rerolls in one Voyage sequence.
4. Start a new sequence when the next Voyage generates a new natural board.
5. Submit only complete samples with all 12 modifiers recognised. Correct OCR
   misses before saving.

The capture panel assigns roll numbers automatically. The first saved board in
a Voyage is roll 0; each later save is the next paid reroll. The displayed next
cost is derived from the confirmed cost curve when it is known. Start the next
Voyage only when the game has generated a new natural board.

Do not submit only rare, strong, or surprising boards. That would measure what
players choose to report rather than what the game rolls.

## Sample schema

Each `allflame-border-roll/v2` record contains:

- a random sample ID used for deduplication;
- a random sequence ID grouping one natural board with its paid rerolls;
- capture time and game patch;
- generation type, reroll number, and the known next reroll cost (derived by the
  current client; older v2 samples may contain the observed display value);
- 12 canonical border modifier IDs in UI order: top, right, bottom, then left,
  with three slots per side.

The dataset export is a JSON document with schema
`allflame-border-roll-dataset/v2`. It contains no screenshots, account names,
character names, IP addresses, or browser identifiers. Samples remain in the
browser until the user explicitly exports them or opens a pre-filled GitHub
submission issue. A submission contains one complete Voyage sequence rather
than an arbitrarily selected latest roll. The record itself has no account data;
a submitted issue does show the contributor's GitHub username under GitHub's
normal privacy terms.

Legacy v1 browser samples are migrated to v2 automatically. V1 requested a
Voyage level derived from charts placed after the border roll; v2 removes it
because border modifiers already exist before chart placement and therefore
cannot be gated by those chart levels.

## GitHub submission processing

Issues whose title starts with `[data] Border roll` are processed by
`.github/workflows/process-border-roll-data.yml`. The workflow treats the issue
body as untrusted input and never executes it. It extracts one fenced JSON block
and validates:

- the sample or dataset schema and field types;
- all 12 canonical modifier IDs for every roll;
- unique sample IDs and reroll indexes;
- one game patch and one sequence ID per submission;
- a contiguous sequence beginning at natural roll 0.

A displayed cost that differs from the currently known cost curve produces a
warning rather than rejection because confirming that mechanic is one purpose
of the research.

The bot comments with the result and applies exactly one processing label:

- `border-roll:accepted` — a complete, normalized sequence; the issue is closed;
- `border-roll:partial` — valid rolls without a complete sequence from roll 0;
  retained for reference, excluded from the canonical dataset, and closed;
- `border-roll:duplicate` — sample IDs already accepted elsewhere; closed;
- `border-roll:invalid` — malformed or unknown data; left open so the author can
  edit it and trigger validation again;
- `border-roll:test` — a manually identified test submission, excluded and
  closed.

Accepted comments include a SHA-256 digest of the normalized dataset. Edits and
reopened data issues run validation again.

## Canonical dataset

`.github/workflows/build-border-roll-dataset.yml` runs daily and on manual
dispatch. It reads only issues labelled `border-roll:accepted`, validates them
again, deduplicates by sample ID, sorts samples deterministically, and opens a
pull request updating `data/border-rolls-v2.json` when the result changes. Issue
events never write untrusted input directly to `main`.

The repository must allow GitHub Actions to create pull requests for the final
PR-opening step. Until an accepted sequence exists, the workflow makes no data
file and no PR.

## Analysis requirements

Initial analysis should report raw counts and confidence intervals by modifier,
patch, generation type, and slot. Samples from one sequence
must remain grouped so duplicate limits and within-board dependence can be
tested. Paid rerolls must not be mixed with natural boards until the two
distributions are shown to agree.
