# Allflame Voyage Solver - Mechanics and Modeling Notes

Last reviewed: **2026-07-30**.

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

Research is sufficient to model the **Sulphur cost curve**, but not yet to
calculate a defensible reroll EV. The game data exposes the border-mod pool and
reroll constants, but it does **not** expose border selection weights, tier
eligibility by Voyage level, duplicate rules, or independence between slots.

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
  1. Tier selection must therefore be controlled by separate Voyage logic or
     server-side data, not the public mod-level field.
- `DeepwaterBalancePerLevel.datc64` and the other public `Deepwater*.datc64`
  tables inspected do not expose a border weight/tier table. Some patch bundles
  returned 404 in the community data viewer, so this is **not proof that no such
  table exists**; it only means it is not currently recoverable from the checked
  public exports.
- The current demo/randomize button selects each of the 12 slots independently
  and uniformly with `Math.random()`. That is useful demo behaviour, but there is
  no evidence that it matches the game. It must not be used as the probability
  model for a real reroll recommendation.

Still unknown:

1. Weight of each family and tier.
2. How Voyage/chart area level changes tier eligibility or magnitude.
3. Whether the 12 slots are independent.
4. Whether duplicate modifiers can occur on one board and, if so, without limit.
5. Whether paid rerolls use the same distribution as a newly generated board.
6. Whether the third reroll constant really enforces a five-reroll cap.
7. Precisely when the doubling counter resets.

### Consequence for the suggested feature

- A deterministic **current-roll appraiser** is unblocked: score the 12 observed
  borders against the user's planned charts and preferences.
- A mathematically honest **"reroll or keep" recommendation** is still blocked
  on the roll distribution. Do not label a uniform-pool calculation as expected
  value.
- Until probabilities are measured, a later strategy feature may expose a
  clearly labelled heuristic (for example, compare the current board score with
  a user-selected keep threshold), but not a claimed optimal decision.

### Minimal in-game data collection needed

The app now includes an opt-in local capture log for this protocol. It accepts
only complete 12-border samples, groups a natural board and its paid rerolls by
Voyage sequence, and exports the versioned format described in
`docs/border-roll-data.md`. Submission remains explicit because the static app
has no collection backend.

Capture natural boards and paid rerolls without discarding bad outcomes. For
each observation store:

```text
patch, voyage/board level, natural-or-paid, reroll index, displayed cost,
12 ordered border modifier IDs/texts
```

The first validation batch should answer mechanics, not estimate rare-mod EV:

1. Record one board through every allowed reroll to confirm the cap, all-12
   scope, and displayed costs.
2. Complete/start the next Voyage and record the first displayed reroll cost.
3. Check whether a single board can contain duplicate IDs/families.
4. Repeat at low, mid, and endgame chart levels and compare which tier variants
   appear.

Only after those checks should a larger unbiased sample be used to estimate
weights. Every board contributes 12 observations, but slots from one board
should be kept under the same `board_id` so independence can be tested instead
of assumed.

### Research sources

- Official 3.29.0 notes (describe Voyages, but publish no reroll constants):
  https://www.pathofexile.com/forum/view-thread/3985332
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

- **Chart item tooltip anatomy** (seen on "Armoured Coral Forest Chart of Power" -
  magic-rarity naming): Area Level 47 · Item Quantity: +20% · **Gold Found: +70%** ·
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
  `Item Quantity: +N%`, `Gold Found: +N%`, `Dead Man's Sulphur: +N%` (also Item
  Rarity / Pack Size likely). These are SUMS across the chart's mods (e.g. Fecund
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
- [ ] Collect unbiased natural and paid-reroll samples to estimate weights, tier
      gates, duplicate rules, and slot independence.
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
