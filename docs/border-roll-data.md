# Border roll data collection

The game client exposes the Corruption Current modifier pool, but not selection
weights, tier gates, duplicate rules, or slot independence. The app therefore
collects complete observed boards instead of treating the known pool as uniform.

## Unbiased capture protocol

1. Capture the natural board before deciding whether it is good or bad.
2. If you pay for a reroll, capture every resulting board in order.
3. Keep the natural board and its paid rerolls in one Voyage sequence.
4. Start a new sequence when the next Voyage generates a new natural board.
5. Submit only complete samples with all 12 modifiers recognised. Correct OCR
   misses before saving.

Do not submit only rare, strong, or surprising boards. That would measure what
players choose to report rather than what the game rolls.

## Sample schema

Each `allflame-border-roll/v1` record contains:

- a random sample ID used for deduplication;
- a random sequence ID grouping one natural board with its paid rerolls;
- capture time, game patch, and Voyage level;
- generation type, reroll number, and the next displayed reroll cost;
- 12 canonical border modifier IDs in UI order: top, right, bottom, then left,
  with three slots per side.

The dataset export is a JSON document with schema
`allflame-border-roll-dataset/v1`. It contains no screenshots, account names,
character names, IP addresses, or browser identifiers. Samples remain in the
browser until the user explicitly exports them or opens a pre-filled GitHub
submission issue. The record itself has no account data; a submitted issue does
show the contributor's GitHub username under GitHub's normal privacy terms.

## Analysis requirements

Initial analysis should report raw counts and confidence intervals by modifier,
patch, Voyage-level band, generation type, and slot. Samples from one sequence
must remain grouped so duplicate limits and within-board dependence can be
tested. Paid rerolls must not be mixed with natural boards until the two
distributions are shown to agree.
