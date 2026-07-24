# Allflame Voyage Solver — Scoping Notes (2026-07-24, pre-launch)

League: **Path of Exile 3.29 — Curse of the Allflame** (launches July 24, 2026).

## The mechanic (solver-relevant parts)

- **Lost Charts** drop as items in maps (from Cursed Treasure encounters). Running one
  underwater (Bathysphere + Allflame Lanterns) turns it into a **Charted Chart**, which
  reveals its **Voyage Modifier** implicit.
- **Voyage Board**: a **3×3 grid**. Place 9 Charted Charts to assemble one big
  seafloor Voyage.
- **Connectivity constraint**: each Chart's icon has lines/connectors on it; connectors
  must line up with adjacent placed charts (exact rules unconfirmed pre-launch —
  unknown whether charts can rotate).
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

Find: the choice of 9 charts and their arrangement that maximizes expected value,
subject to the connector-matching constraint.

Search space is tiny by solver standards: 9! = 362,880 arrangements per chosen set;
even with chart selection from a pool of ~30 it's brute-forceable with basic pruning
(connectivity check first, then score). A simple scoring model (user-weighted: currency
vs scarabs vs sulphur vs rares) + exhaustive/branch-and-bound search will be instant in
the browser. No fancy algorithm needed — the hard part is **data model + import UX**.

Key strategic insight from reveal coverage: put strong global/self-mod charts in the
**center** (it gets no border mods), and put charts you want border-amplified in
**corners** (2 border mods each).

## Importer feasibility (must verify on launch day)

1. **Charts are inventory items** → almost certainly Ctrl+C copyable as standard PoE
   item text (like maps). An importer can parse pasted chart text. **Verify format
   day one.**
2. **Board border mods** are UI-only. Two precedents:
   - PoE1 Incursion: hovering the Temple of Atzoatl UI + Ctrl+C copied the whole
     temple layout as text → maybe the Voyage Board supports the same. **Check
     Ctrl+C over the Voyage Board UI day one.**
   - If not: manual entry from a dropdown of known border mods (only 12 slots,
     modest mod pool — fine UX), or OCR later.
3. No official API for league UI state; Client.txt logs won't have this.

## Prior art

- **sulozor.github.io/#/atziri-temple** (PoE2 Atziri temple planner): manual
  drag-and-drop planner, live "active bonuses" panel, saved layouts, shareable
  URL state, Ctrl+C share. React SPA on gh-pages (source repo is build output only;
  `exef86/poo2temple` is a Vue rebuild with readable source). It is a **planner, not
  a solver** — our edge is auto-solve + import.
- Tetriszocker.github.io/atziri-temple-editor — another manual planner.

## Proposed build

Static SPA (React or Svelte + TypeScript, gh-pages/Netlify deployable — no backend):

1. **Data layer**: chart + border-mod definitions (JSON), filled in from launch-day
   data; community will datamine mod lists quickly (poedb/poewiki).
2. **Importer**: paste-parse chart item text; paste board text if Ctrl+C works,
   else quick-pick UI for the 12 border mods.
3. **Board UI**: 3×3 grid + 12 border slots, drag-and-drop, live score/bonus panel
   (sulozor-style).
4. **Solver**: user weights for reward types → exhaustive search with connectivity
   pruning → show top-k arrangements with score breakdown.
5. **Share/save**: layout state in URL, localStorage saved layouts.

## Launch-day checklist (blockers, ~day 1)

- [ ] Ctrl+C a Lost Chart and a Charted Chart → capture exact item text format
- [ ] Ctrl+C over the Voyage Board UI → does it export anything?
- [ ] Confirm connector rules: rotation? must all 9 connect? partial boards allowed (fewer than 9)?
- [ ] Collect the border modifier pool + whether weights/tiers vary by area level
- [ ] Confirm chart modifier pool + scopes (self/adjacent/global) from poedb/patch notes

## Sources

- https://maxroll.gg/poe/news/3-29-curse-of-the-allflame-reveal-summary (most detailed)
- https://www.poe-vault.com/guides/curse-of-the-allflame-mechanic-guide
- https://www.poebuilds.net/post/path-of-exile-3-29-curse-of-the-allflame
- https://www.arcanestash.com/guides/curse-of-the-allflame-new-path-of-exile-1-league
- Reveal breakdown video: https://www.youtube.com/watch?v=SCAAl94bJLo
