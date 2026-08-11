# Allflame Voyage Solver - Mechanics and Modeling Notes

Last reviewed: **2026-08-11**.

This document separates live observations from model assumptions and unresolved
questions. Historical preview notes are retained only where they explain the
project's design; current live evidence takes precedence.

Confidence labels:

- **Confirmed** — supported by current client data, official material, or direct
  live observation.
- **Strongly supported** — repeated live reports or UI wording agree, but the
  rule is not officially documented.
- **Heuristic** — an explicit app-level scoring or search choice, not a claimed
  game rule.
- **Unknown** — available public data and observations do not answer the
  question.

## Border reroll research

### Result

Research is sufficient to model the **Sulphur cost curve** and an experimental
slot-aware roll distribution, but not a defensible reroll EV. The canonical
2026-08-10 export contains 50 boards from 29 Voyages: 29 natural boards and 21
paid rerolls from 12 paid sequences. It strongly supports physical slot
families and confirms duplicates, but does not establish within-board
independence or rare-mod probabilities. Border modifiers are present before any
charts are placed, so the levels of subsequently placed charts cannot determine
border-mod eligibility.

### Reroll mechanics and cost

- **Confirmed:** the first paid reroll costs **3,000 Dead Man's Sulphur**.
- **Confirmed:** the price doubles after every reroll of the current board:
  **3k, 6k, 12k, 24k, 48k**. Current `DeepwaterConstants.datc64` contains three
  `RerollBorder...` values: `3000`, `200`, and `5`; the first two match the live
  base cost and 200% cost multiplier.
- The cost of reroll number `n` (1-based) is:
  `cost(n) = 3000 × 2^(n - 1)`.
- The cumulative cost of `k` rerolls is:
  `total(k) = 3000 × (2^k - 1)`.

| Paid rerolls | Next costs    | Cumulative Sulphur |
| -----------: | ------------- | -----------------: |
|            1 | 3,000         |              3,000 |
|            2 | 3,000 + 6,000 |              9,000 |
|            3 | + 12,000      |             21,000 |
|            4 | + 24,000      |             45,000 |
|            5 | + 48,000      |         **93,000** |

One community comment gives `75k` for five rerolls, but its written sequence is
`3+6+12+24+48`; the correct sum is **93k**.

- **Strongly supported:** the action rerolls the current **board/set of 12
  Corruption Currents**, rather than a chosen border slot. Live discussion
  consistently calls this "rerolling the board", and no per-slot control has
  been reported.
- **Probable, not yet proven:** the third client constant (`5`) is a maximum of
  five paid rerolls for one board. Its full identifier was truncated in the
  current data viewer, so this needs one live UI check before implementation.
- **Unknown:** the exact event that resets the cost counter. The working
  assumption is that completing/starting the next Voyage creates a fresh board
  and resets the first cost to 3,000, but this has not been directly captured.

### Border pool and probabilities

- The current RePoE 3.29.0.4.2 export contains **66** modifier records whose IDs
  start with `DeepwaterBorder`.
- All 66 use domain `deepwater_border`, generation type `unique`, required level
  `1`, and an empty `spawn_weights` array. Therefore the normal `Mods.dat`
  fields do not reveal their actual roll weights or level gates.
- **Unknown:** Vesper's five `Superior Sovereign` upgrades may affect the pool or
  tier selection through external or server-side logic. Patch 3.29.0b confirms
  that Vesper upgrades did gate other Voyage content, so the app now records the
  player's 0–5 challenge progress for every sequence instead of assuming all
  progress states share one distribution.
- The app intentionally contains **64 canonical, OCR-visible definitions** rather
  than mirroring every raw record. Two raw records are tracked separately in
  `src/data/borderSourceRecords.ts` pending live verification:
  - `DeepwaterBorderMagicMonsterMods2` has a value of 2 in the datamined stat,
    but its public translation is blank and no live tooltip is confirmed.
  - `DeepwaterBorderTreasureAnchorsHardMode` has the same public translation as
    `b-anchor-1` ("Adjacent Areas contain 2 additional Treasure Anchors"). It is
    not added as a duplicate OCR definition because text-only matching could not
    distinguish the two IDs, and equivalent gameplay semantics are not yet
    confirmed.
- The **66 raw versus 64 canonical** difference is therefore an explicit source
  gap, not evidence that the UI is missing two independently observable
  modifiers. The matcher now has a regression invariant requiring normalized
  canonical tooltip texts to remain unique.
- The 66 records include explicit tier variants (for example 16/24/32% pack
  size and 50/75/100% more currency), but all tiers still report required level
  1. Tier selection must therefore be controlled by other game logic or
     server-side data, not the public mod-level field or chart levels chosen later.
- `DeepwaterBalancePerLevel.datc64` and the other public `Deepwater*.datc64`
  tables inspected do not expose a border weight/tier table. Some patch bundles
  returned 404 in the community data viewer, so this is **not proof that no such
  table exists**; it only means it is not currently recoverable from the checked
  public exports.
- The experimental-roll button now draws from the version 3 slot-aware model.
  It remains a model demonstration, not a proven reproduction of the server
  roll algorithm.

Current evidence and remaining unknowns:

1. Weight of each family and tier.
2. Whether the 12 slots are independent.
3. Exact duplicates are confirmed, including three copies of one modifier on a
   board; any higher duplicate limit remains unknown.
4. A matched natural-versus-paid comparison detects no difference (`p = 0.41`),
   but only 12 Voyages contain a paid reroll and player-selected rerolls can bias
   the sample. This is non-detection, not evidence of equivalence.
5. Whether the third reroll constant really enforces a five-reroll cap.
6. Precisely when the doubling counter resets.

### Consequence for the suggested feature

- A deterministic **current-roll appraiser** is unblocked: score the 12 observed
  borders against the user's planned charts and preferences.
- Experimental **"reroll or keep" guidance** is available from version 3 of the
  observed-roll model. Natural boards enter the sparse slot estimates at half
  weight, but only paid sequences raise confidence. The current 12 paid
  sequences remain `low`.
- Model output reports prior sensitivity and compares rolls on a border-blind
  reference layout. It does not price Sulphur or claim optimal stopping; the
  3,000/6,000 guardrail remains in force.
- While confidence is `low`, the model is diagnostic: it cannot independently
  issue `KEEP` or influence incomplete-border strategy ranking. Medium begins at
  30 paid Voyage sequences and high at 100.
- The model imports the canonical JSON dataset directly, so every accepted
  dataset rebuild updates probabilities on the next application build.

### Minimal in-game data collection needed

The app now includes an opt-in local capture log for this protocol. It accepts
only complete 12-border samples, assigns roll indexes automatically, groups a
natural board and its paid rerolls by Voyage sequence, and exports the versioned
format described in `docs/border-roll-data.md`. Submission remains explicit
because the static app has no collection backend. A GitHub issue workflow
validates and closes submitted sequences, and a separate batch workflow creates
reviewable dataset-update pull requests; issue input is never written directly
to `main`. A voluntary randomized mode pre-assigns 20% of new Voyages before the
natural board is visible and asks for exactly one affordable paid reroll. The
sampling reason is retained so this subset can test natural/paid equivalence
without conditioning only on the player's keep decision.

Capture natural boards and paid rerolls without discarding bad outcomes. For
each observation store:

```text
patch, Vesper upgrade count (0–5 or unknown), sampling reason,
natural-or-paid, reroll index,
displayed cost, 12 ordered border
modifier IDs/texts
```

The first validation batch should answer mechanics, not estimate rare-mod EV:

1. Record one board through every allowed reroll to confirm the cap, all-12
   scope, and displayed costs.
2. Complete/start the next Voyage and record the first displayed reroll cost.
3. Check whether a single board can contain duplicate IDs/families.
4. Compare natural boards with paid rerolls before combining their samples.

Only after those checks should a larger unbiased sample be used to estimate
weights. Every board contributes 12 observations, but slots from one board
should be kept under the same `board_id` so independence can be tested instead
of assumed.

### Research sources

- Official 3.29.0 notes (describe Voyages, but publish no reroll constants):
  https://www.pathofexile.com/forum/view-thread/3985332
- Official 3.29.0b notes (Voyage content previously gated by Vesper upgrades):
  https://www.pathofexile.com/forum/view-thread/3989412/page/1
- Current RePoE PoE1 export index and `mods.min.json`:
  https://repoe-fork.github.io/poe1.html
- PoE Dat Viewer used to inspect `DeepwaterConstants.datc64` and the available
  `Deepwater*.datc64` tables:
  https://snosme.github.io/poe-dat-viewer/
- PoEDB border-mod listing:
  https://poedb.tw/us/Maiden_Voyage#DeepWaterBorderMods
- Live reports of the 3k/6k cost and doubling:
  https://www.reddit.com/r/PathOfExileBuilds/comments/1v90lxh/voyage_strategies_discussion/
  https://www.reddit.com/r/pathofexile/comments/1v79vww/list_of_issues_with_current_league_mechanic/
  https://www.reddit.com/r/pathofexile/comments/1v74hcz/ive_solved_voyages_theyre_good_but_maybe_theres/

## Confirmed live mechanics

- Board is **3×3** ✓. Border has **12 segments (2 per corner, 1 per middle edge)**
  called **Corruption Currents**, rerolled each Voyage ✓ (corner tiles get 2, center 0 ✓).
- Charts **rotate with RMB** ✓; tiles are "specifically shaped" and must interlink.
- Chart **implicits are adjacent-scope or voyage(global)-scope**; charts also carry
  their own **self-scope area mods** (sulphur/quantity/rarity/magic monsters/jellyfish).
- Real adjacent-mod pool so far: equipment→Gold conversion, Wildwood Wisp empowerment,
  +Imprisoned Monsters, +Diviner's Strongboxes, +Operative's Strongboxes, +Tormented
  Spirit cages. (Now in src/data/mods.ts.)
- **One portal, one attempt** per Voyage. Loot is "Dredge" (unusable until sent to
  surface via Allflame Capsule, 60 slots, one send each).
- Dead Man's Sulphur: from lanterns near green-coral corpses; non-tradeable currency.

## Historical preview evidence

The following observations came from ZiggyD's early hands-on video
(`youtu.be/BUhy78_RgF0`, around 21:00, 2026-07-24). They informed the initial
implementation; the confirmed live sections above and below supersede them if
they conflict.

- **Historical Chart item tooltip anatomy before 3.29.2** (seen on "Armoured Coral
  Forest Chart of Power" - magic-rarity naming): Area Level 47 · Item Quantity:
  +20% · **Gold Found: +70%** ·
  Requires Level 36 · an explicit "**Adjacent Modifier:**" section ("Adjacent Areas
  contains 5 additional Giant Starfish") · area mods incl. downsides ("+6% Monster
  Physical Damage Reduction", "Monsters gain a Power Charge on Hit") · footer "Take
  this item to Valerie aboard the Sovereign to chart this area". → Parser must read
  quantity/gold quality-stats + the Adjacent Modifier section + area mod lines.
- **Charted charts auto-transfer to a dedicated chart stash**; a placeable hideout
  stash with **affinities** exists. Inventory shows shape glyph + "L:47" level and
  has a **keyword search box** (regex feature target).
- **Chart shapes**: straight / L-corner / T / cross glyphs - matches our N/E/S/W edges.
- **Border mods can be REROLLED by spending Dead Man's Sulphur** → borders are a
  crafting sub-game; solver could later compute reroll EV ("is this roll worth keeping?").
- **Meta border mods exist that multiply chart modifier effects** (observed banner:
  "Adjacent Areas have 60% increased explicit modifier magnitude") → modelled as
  `magnitude` on BorderModDef, scales the touched chart's own mods in scoring.
- Scale: a voyage ≈ hundreds of treasure locations, huge zone; ZiggyD ran ~1/act in campaign.
- On-screen note: GGG has been **buffing adjacency and border modifiers** since the
  preview build - expect live numbers to be higher than preview footage.

## Confirmed chart item format

- `Item Class: Chart` (not "Lost Charts"). Rarity: Magic. Name on line after Rarity.
- Header block after `Area Level:` lists aggregated reward "quality" stats:
  `Item Quantity: +N%`, `Item Rarity: +N%`, `Dead Man's Sulphur: +N%` (also Pack
  Size). Patch 3.29.2 converted the former Gold-found Chart modifiers into Item
  Rarity; equipment-to-Gold adjacent and border modifiers were not changed.
  These are SUMS across the chart's mods (e.g. Fecund
  +20% and of Insulation +20% show as "Item Quantity: +40%"). Parser reads these
  directly into ChartData.rewards (self-scope), NOT snapped to mod tiers.
- `Chart Shape:` gives the connector shape: End(1), Corner(2 adjacent L),
  Straight(2 opposite), Junction(3 T), presumably Crossroads(4). Mapped to edges.
  Missing or unknown names are imported in a needs-confirmation state and are
  excluded from solving until the user selects a canonical shape.
- Implicit (adjacent/voyage modifier) is HIDDEN until charted: uncharted charts show
  "Voyage Modifier will be revealed once Charted". Uncharted charts are REJECTED on
  import (must be run first). Charted charts show the real implicit line, matched to
  the adjacent/voyage mod pool.
- Prefix/suffix explicit mods are mostly monster downsides; their reward part is
  already in the header aggregate, so they're kept as rawText only (not re-scored).
- Deepwater area type ("Seafloor Ridges", "Abyssal Plain", "Undersea Groves") appears
  in the header but isn't scored.

## Scoring assumptions and unknowns

- **Heuristic:** stacking rules are undocumented. The model assumes additive stacking within
  an area ("increased" convention); the rewards panel reports average bonus per area.
- **Start square is bottom-left** (confirmed in-game). The game allows a
  locally valid but disconnected Voyage to start; only the component containing
  this square can then be explored. The solver therefore distinguishes a board
  the game will launch from a fully reachable board and defaults to the latter.
  Unconfirmed whether the start ever moves.
- **CONFIRMED (ZiggyD video): some mods scale with the number of connections a
  chart has** - stacking bonuses per connection, and others that reward FEWER
  connections. Modelled via `scaling: 'connections' | 'inverse-connections'` on
  VoyageModDef (effect × connection count, or × (4 − connections)). No real mod
  texts known yet - wire them in as they're found.

## Strategy calibration after 3.29.2

The curated strategies remain decision-support heuristics rather than profit or
expected-value calculations. The following evidence changed the defaults after
the initial strategy transcription:

- **Confirmed:** patch 3.29.0b made Diviner's, Arcanist's, and Operative's
  Strongboxes eligible to appear by default above area level 67, increased the
  frequency and rewards of valuable scattered chests, made dead-end and
  straight-line Charts less common, and added quantity to Golden Lanterns.
- **Confirmed:** patch 3.29.1 allows Dredged currency to be used on Strongboxes
  and added Sunken Opulence and Sunken Gems chests. These changes strengthen the
  general Strongbox speedrun direction but do not establish currency-per-hour
  ratios between Strongbox families.
- **Confirmed:** patch 3.29.2 replaced every increased-Gold-found Chart modifier
  with increased Item Rarity. Imported header totals and legacy saved Charts are
  therefore scored on the Rarity axis; equipment-to-Gold conversion modifiers
  remain on the Gold axis.
- **Strongly supported:** a `+1 Divine Orb` border should be preserved and the
  touched tile should be fed with Rare Monsters. Current reports support both a
  Sea-Pillars/Starfish approach and a Strongbox approach, but do not establish a
  universal winner.
- **Strongly supported:** a corner Divine tile has only two physical feeder
  positions, while a middle-edge Divine tile has three. Strategy requirements
  must therefore adapt to the rolled border position.
- **Conflicting field evidence:** Strongboxes can be rolled with two rare-guard
  modifiers, but reports disagree on whether every resulting rare consistently
  receives the Divine-border drop. The app describes seven rares per box as a
  potential maximum, not a guaranteed yield.
- **Conflicting field evidence:** Golden Lantern quantity and rarity are visible
  in character stats, but repeated reports describe little corresponding
  monster loot. Lantern weights are reduced to a supporting role, and the
  magic-monster variant is omitted from curated strategies until better
  measurements or a game fix exists.
- **Supported as workflow, not EV:** players commonly preserve a Divine border,
  otherwise use complete high-value recipes or a premium Strongbox centre, and
  burn leftovers with a quick generic layout. Reports do not provide enough
  controlled samples to put all strategies on one numeric profit scale.
- **Conflicting field evidence:** the exact Meatfish composition is being run in
  practice, but reported uniques and juiced-tile loot are inconsistent. It stays
  a complete specialized recipe rather than receiving a universal EV premium.

App policy resulting from this evidence:

1. Compare every ready strategy built around the Divine border; never hard-code
   one creator's variant as the winner.
2. Require 2 feeders plus 6 remaining Rare charts for a corner Divine tile, or
   3 feeders plus 5 remaining Rare charts for a middle-edge tile.
3. Count Arcanist's Strongboxes as a premium Speedrun centre option.
4. Treat `Monsters cannot drop Equipment` as a required Meatfish piece;
   Fracture remains a degraded manual fallback.
5. Limit the default reroll suggestion to the 3,000 and 6,000 Sulphur steps.
   This is a community-informed guardrail, not optimal stopping or EV.
6. Treat strategy weights as within-strategy layout preferences and same-tier
   tie-breakers. The explicit minimum fit for Alc & Go fallback preference is
   50%. A fitting specialized recipe outranks a fitting Alc & Go board; a
   fitting Alc & Go board can outrank a weak specialization; below 50%, the
   ready specialized strategy remains ahead of the weak fallback. A relative
   reroll-model percentile cannot promote sub-50% Alc & Go to PLAY or SWITCH.
   Divine-border jackpots remain the preserve exception.
7. Accept 4,000 Wisps, but not 2,000 Wisps, as the documented Meatfish
   Pantheon substitute. Do not score Fracture or spare Rare-chart families in
   the exact nine-chart Meatfish recipe.

Strategy-calibration sources:

- Official 3.29.0b notes:
  https://www.pathofexile.com/forum/view-thread/3989412
- Official 3.29.1 notes:
  https://www.pathofexile.com/forum/view-thread/3991672
- Official 3.29.2 notes:
  https://www.pathofexile.com/forum/view-thread/3994431
- Current Voyage strategy discussion:
  https://www.reddit.com/r/PathOfExileBuilds/comments/1v90lxh/voyage_strategies_discussion/
- Current practical Chart/Voyage discussion:
  https://www.reddit.com/r/PathOfExileBuilds/comments/1vcddgn/how_do_you_run_chartsvoyages/
- Divine Voyage optimization reports:
  https://www.reddit.com/r/pathofexile/comments/1v9qoh7/optimizing_divine_voyage/
- Golden Lantern field reports:
  https://www.reddit.com/r/pathofexile/comments/1vblw8w/golden_lanterns_are_irrelevant/
- Exact Meatfish composition and inconsistent loot report:
  https://www.reddit.com/r/pathofexile/comments/1vcjkre/underwater_loot_findings/

League: **Path of Exile 3.29 - Curse of the Allflame**, launched July 24, 2026.

## The mechanic (solver-relevant parts)

- **Lost Charts** drop as items in maps (from Cursed Treasure encounters). Running one
  underwater (Bathysphere + Allflame Lanterns) turns it into a **Charted Chart**, which
  reveals its **Voyage Modifier** implicit.
- **Voyage Board**: a **3×3 grid**. Place 9 Charted Charts to assemble one big
  seafloor Voyage.
- **Connector constraint (CONFIRMED, live board)**: each Chart has connector lines;
  where two placed charts share an edge, either both have a connector there or neither
  does - a connector meeting a blank neighbour edge is broken (drawn red in game).
  Connectors pointing off the outer board rim are fine. A voyage always fills all 9
  squares. The game will launch several separately matched components, but the player
  starts in the bottom-left and cannot enter components disconnected from it. Boards
  may branch (T/Cross); branching is compatible with full reachability and does not
  remove the need for every useful area to be connected to the start. Charts can
  rotate. The default `strict` mode requires both launchability and full reachability.
- **Voyage Modifiers** come in three scopes:
  - affects **own region** only
  - affects **adjacent charts**
  - affects the **entire Voyage**
- **Border modifiers**: the 12 border segments around the 3×3 grid each apply a
  modifier to the tile they touch. **Corner tiles get 2 border mods, edge tiles get 1,
  center gets 0.** Border mods are **re-randomized every time you complete a Voyage**
  and scale with chart area level. Observed examples from the reveal:
  - "50% more Currency found in adjacent Areas"
  - "100% increased number of Rare Monsters in adjacent Areas"
  - "75% more Scarabs found in adjacent Areas"
  - "30% chance Charts aren't consumed on Voyage completion"
  - "Rare monsters drop Dead Man's Sulphur"
- Charts in a completed Voyage can be **revisited/re-claimed**; rewards can be amplified.
- Each of the 9 areas has an **Allflame Capsule** (5×12 loot inventory) since you can't
  portal out mid-voyage.
- **Dead Man's Sulphur** (from Luminous Coral during charting) fuels the Allflame
  Crafting bench on The Sovereign (pick 1 of up to 4 shown crafting outcomes).

## The optimization problem

Given: your pool of N charted charts (each with connector shape + modifier + area
level + content type) and the current 12 border modifiers.

Find: the choice of 9 charts and their arrangement that maximizes a
**user-weighted utility score**, subject to connector matching and the selected
reachability rule. The score is not currency expected value because reward prices,
drop distributions, and border-roll probabilities are not known.

The implementation has two search paths:

- **Exact:** exhaustive search for pools of at most 9 charts when rotation is
  disabled.
- **Heuristic:** seeded hill climbing with restarts for larger pools or rotational
  searches. It is deterministic for the same input and seed but does not claim a
  globally optimal result.

The frequently useful corner/center advice is also heuristic: corners receive two
border effects while the center receives none, but the best placement depends on
the current borders, chart modifiers, connectors, and selected weights.

## Importer status

- **Confirmed:** Charted Charts are copyable as standard `Ctrl+C` item text. The
  parser has live English and Korean fixtures, preserves unmatched lines, and
  rejects uncharted charts whose hidden modifier cannot be scored.
- Border modifiers remain UI-only. The app supports manual entry, while the
  optional Windows helper reads the 12 tooltips with local OCR. See
  [docs/windows-ocr.md](docs/windows-ocr.md).
- No official API is known for reading the current Voyage Board state.

## Historical prior art

- **sulozor.github.io/#/atziri-temple** (PoE2 Atziri temple planner): manual
  drag-and-drop planner, live "active bonuses" panel, saved layouts, shareable
  URL state, Ctrl+C share. React SPA on gh-pages (source repo is build output only;
  `exef86/poo2temple` is a Vue rebuild with readable source). It is a **planner, not
  a solver** - our edge is auto-solve + import.
- Tetriszocker.github.io/atziri-temple-editor - another manual planner.

## Current implementation

A static React + TypeScript SPA deployed to GitHub Pages with no backend:

1. **Data layer:** canonical chart, voyage-modifier, border-modifier, and strategy
   definitions with stable persisted IDs.
2. **Importer:** clipboard parsing for Charted Charts, manual border entry, and an
   optional Windows OCR bridge.
3. **Board UI:** 3×3 board, 12 border slots, rotation, validity/reachability
   feedback, score breakdown, and voyage advice.
4. **Solver:** exact search for the bounded non-rotational case and seeded
   approximate search otherwise, both running behind a Web Worker boundary.
5. **Share/save:** URL state, browser persistence, and JSON import/export.
6. **Quality/deployment:** tests, typecheck, ESLint, Prettier, production build,
   performance benchmark, and GitHub Pages deployment.

## Remaining research checklist

- [x] Capture live Charted Chart item text and parser fixtures.
- [x] Confirm chart rotation, local connector matching, and bottom-left
      reachability behavior.
- [x] Collect the current public border-modifier records.
- [ ] Confirm the paid-reroll cap and exact counter-reset event in the live UI.
- [x] Confirm that exact duplicate border modifiers can occur on one board.
- [ ] Collect more unbiased natural and paid-reroll samples to stabilize weights,
      tier gates, natural/paid comparisons, Vesper splits, and slot independence.
- [ ] Add live fixtures for additional client languages and newly observed chart
      modifier text.

## Sources

- https://maxroll.gg/poe/news/3-29-curse-of-the-allflame-reveal-summary (most detailed)
- https://www.poe-vault.com/guides/curse-of-the-allflame-mechanic-guide
- https://www.poebuilds.net/post/path-of-exile-3-29-curse-of-the-allflame
- https://www.arcanestash.com/guides/curse-of-the-allflame-new-path-of-exile-1-league
- Reveal breakdown video: https://www.youtube.com/watch?v=SCAAl94bJLo
- Disconnected Voyage accepted by the game but inaccessible from the start:
  https://www.reddit.com/r/pathofexile/comments/1v809kx/i_did_it_for_science_but_why_is_it_possible/
  https://www.reddit.com/r/pathofexile/comments/1v6wgku/messed_up_my_first_voyage_and_now_im_stuck/
