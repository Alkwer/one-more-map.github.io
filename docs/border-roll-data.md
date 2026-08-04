# Border roll data collection

The game client exposes the Corruption Current modifier pool, but not selection
weights, duplicate rules, or slot independence. The app therefore
collects complete observed boards instead of treating the known pool as uniform.

## Unbiased capture protocol

1. Check `Challenges → Superior Sovereign` and select the current Vesper upgrade
   count (0–5) before capturing the natural board.
2. Capture the natural board before deciding whether it is good or bad.
3. If you pay for a reroll, capture every resulting board in order.
4. Keep the natural board and its paid rerolls in one Voyage sequence, without
   changing the selected Vesper progress mid-sequence.
5. Start a new sequence when the next Voyage generates a new natural board.
6. Submit only complete samples with all 12 modifiers recognised. Correct OCR
   misses before saving.

Every complete 12/12 OCR paste is saved automatically. The reroll-cost scan
identifies roll 0 and later paid rerolls; after the natural board, automatic
capture skips a scan whose reroll cost was not recognised rather than guessing
its position. `Save current roll` remains available to repair that case. The
displayed next cost is derived from the confirmed cost curve when it is known.
`Finish Voyage` closes the active sequence and starts the next one; use `Start
next Voyage` manually only when abandoning or correcting a sequence.

Do not submit only rare, strong, or surprising boards. That would measure what
players choose to report rather than what the game rolls.

## Sample schema

Each `allflame-border-roll/v2` record contains:

- a random sample ID used for deduplication;
- a random sequence ID grouping one natural board with its paid rerolls;
- capture time and game patch;
- Vesper upgrade progress from `Superior Sovereign` (0–5), or `null` for a
  legacy sample whose progress is unknown;
- generation type, reroll number, and the known next reroll cost (derived by the
  current client; older v2 samples may contain the observed display value);
- 12 canonical border modifier IDs in UI order: top, right, bottom, then left,
  with three slots per side.

The dataset export is a JSON document with schema
`allflame-border-roll-dataset/v2`. It contains no screenshots, account names,
character names, IP addresses, or browser identifiers. Samples remain in the
browser until the user explicitly exports or submits them, or enables automatic
submission with a private limited key. A submission contains one complete
Voyage sequence rather than an arbitrarily selected latest roll. The record
itself has no account data. Manual issues show the contributor's GitHub username;
automatic issues show the account used by the intake service.

Legacy v1 browser samples are migrated to v2 automatically. V1 requested a
Voyage level derived from charts placed after the border roll; v2 removes it
because border modifiers already exist before chart placement and therefore
cannot be gated by those chart levels. Older browser and submitted v2 samples
without Vesper progress remain valid and are normalized to `null`; they are not
silently assigned the player's current progress.

## GitHub submission processing

Issues whose title starts with `[data] Border roll` are processed by
`.github/workflows/process-border-roll-data.yml`. The workflow treats the issue
body as untrusted input and never executes it. It extracts one fenced JSON block
and validates:

- the sample or dataset schema and field types;
- all 12 canonical modifier IDs for every roll;
- unique sample IDs and reroll indexes;
- one game patch, one sequence ID, and one Vesper upgrade count per submission;
- Vesper progress is `null` for legacy data or an integer from 0 to 5;
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

## Optional automatic delivery

Automatic delivery is disabled by default. A visitor without a private
submission key behaves exactly as before and can only open the reviewed,
pre-filled issue flow. When an authorised user enables it, `Finish Voyage` puts
the complete active sequence into a durable browser outbox and starts the next
sequence immediately. Network failures never block finishing a Voyage; the
outbox retries on the next load or configuration change.

After the intake service confirms a sequence as created or already submitted,
the browser removes it from the outbox and archives it locally. Archived rolls
are hidden from the active list and counter by default, but remain available
through `Show archived`, can be restored, and are still included in a dataset
export. A failed submission is never archived automatically.

The public GitHub Pages application sends the dataset to a separate Codex Sites
endpoint. The browser holds the revocable submission key in React memory only;
it is never written to local or session storage and must be re-entered after a
reload. The durable outbox contains only the exact anonymous v2 dataset sent to
the intake service plus its sequence ID; it contains no credential or queue
timestamp. The page loads no third-party analytics script, and its CSP restricts
scripts to the application's own origin. The GitHub credential is a server
secret scoped to issue access for `Alkwer/one-more-map.github.io`; it is never
embedded in the application. The endpoint:

- accepts requests only from the configured GitHub Pages origin;
- limits request size and requires the private key;
- validates the v2 dataset, contiguous roll order, all canonical modifier IDs,
  and consistent Vesper progress across the sequence;
- uses a SHA-256 digest and D1 uniqueness constraints to make retries
  idempotent;
- creates one GitHub issue, after which the existing issue workflow performs an
  independent validation, labels the result, comments, and closes accepted
  data.

The intake database stores only the digest, sequence ID, processing status, and
resulting issue number/URL. It does not retain the submitted JSON or OCR output.

### Key rotation

Version 2 of the browser outbox automatically rewrites valid version 1 data on
load, removing any previously persisted submission key before the application
renders. Operators should revoke or replace the old intake key in the service,
distribute the replacement only to authorised contributors, and ask them to
enter it again for the current tab. Rotating the key does not discard queued
datasets; after a replacement is entered, the existing outbox retries normally.

## Canonical dataset

`.github/workflows/build-border-roll-dataset.yml` runs daily and on manual
dispatch. It reads only issues labelled `border-roll:accepted`, validates them
again, deduplicates by sample ID, sorts samples deterministically, and opens a
pull request updating `data/border-rolls-v2.json` when the result changes. Issue
events never write untrusted input directly to `main`.

Both validation and rebuild workflows read the accepted corpus through the
GitHub REST issues endpoint with 100 results per page and follow every pagination
link. The completed response is flattened and sorted by issue number before it
replaces the temporary input file. A failed or malformed page stops the workflow
before validation or dataset output, so a partial corpus cannot remove older
samples. This consumes one core REST request per 100 accepted issues; operators
should check the workflow token's core rate limit if the corpus grows into the
hundreds of thousands.

The repository must allow GitHub Actions to create pull requests for the final
PR-opening step. Until an accepted sequence exists, the workflow makes no data
file and no PR.

## Analysis requirements

Initial analysis should report raw counts and confidence intervals by modifier,
patch, Vesper upgrade progress, generation type, and slot. Samples whose Vesper
progress is unknown should be reported separately. Samples from one sequence
must remain grouped so duplicate limits and within-board dependence can be
tested. Paid rerolls must not be mixed with natural boards until the two
distributions are shown to agree.

## Experimental roll model

The application builds experimental model version 1 directly from
`data/border-rolls-v2.json` at compile time. Dataset-update pull requests
therefore update the shipped estimates automatically without a separately
maintained weight table.

Version 1:

- estimates the next paid reroll from paid-reroll samples only; natural boards
  remain separate until equivalence is supported;
- uses a symmetric Dirichlet(1) prior across every canonical modifier, so a
  known but not-yet-observed modifier never receives zero probability;
- samples the 12 slots independently from the posterior mean weights to compare
  a concrete chart layout with a paid reroll;
- labels confidence from the number of complete Voyage sequences: low below
  30, medium from 30 to 99, and high from 100;
- keeps the 3,000/6,000 Sulphur guardrail and does not convert score into
  currency expected value.

The UI reports the current roll percentile, the estimated chance that a fresh
paid reroll scores higher for the selected strategy layout, and the model sample
size.
These are posterior-predictive diagnostics, not a claim of optimal stopping.
Future model versions may introduce Vesper, generation, patch, or slot profiles
once those strata have enough complete sequences.
