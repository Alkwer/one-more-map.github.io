# Deepwater border record reconciliation

This protocol collects the missing live evidence for two raw client-data
records. It does not claim that either record rolls, displays a tooltip, or has
gameplay semantics distinct from an existing modifier:

- `DeepwaterBorderMagicMonsterMods2`
- `DeepwaterBorderTreasureAnchorsHardMode`

The RePoE 3.29.3.1.2 export still contains both records. The first has no public
translation rule for its value of 2. The second translates to the same text as
the canonical normal +2 Treasure Anchors modifier. Neither fact proves what the
live client selects or how the server applies the modifier.

## What counts as evidence

Record the following for every candidate occurrence:

```text
Capture date (UTC):
Path of Exile build:
Voyage/board level exactly as displayed, or "not displayed":
Vesper Superior Sovereign progress (0-5 or unknown):
Active Cursed Ducats exactly as displayed, or "none":
Border position:
All-border overview transcription:
Single-hover tooltip transcription:
Windows OCR raw text, or "not captured":
Sanitized overview crop:
Sanitized single-tooltip crop:
Area entered and controlled gameplay observation:
Other anchor or monster-modifier sources present:
Result classification:
Reviewer initials:
```

Use `candidate`, `translation collision`, or `unresolved` as the result until
the observation establishes both identity and behavior. A familiar tooltip,
an absent tooltip, or one board without the modifier is not proof that a raw
record is non-rollable.

## Capture sequence

1. Record the exact client build before interacting with the board. Record
   Vesper progress and whether any Cursed Ducat is active, including its exact
   displayed name. Do not infer a relationship from the internal `HardMode`
   suffix.
2. Hold Alt (Left Trigger on controller) to show all 12 Border Modifiers. Capture
   a tightly cropped, sanitized overview that preserves border positions and
   exact visible text. Release the key before using the Windows helper; the
   helper intentionally rejects scans while Alt is held.
3. Hover the candidate border alone. Capture a tightly cropped tooltip and its
   exact transcription. If permitted by the account and setup, run the local
   OCR scan and retain only sanitized OCR text or the minimum reviewed fixture
   described in `windows-ocr-live-validation.md`.
4. For the Treasure Anchors collision, enter only the affected adjacent area
   and count observable Treasure Anchors. Record every other anchor source on
   the chart, board, character, and active Cursed Ducats. A count without those
   controls cannot establish equivalence with `b-anchor-1`.
5. For the Magic Monster modifier candidate, record the modifiers shown on
   multiple affected Magic Monsters and the equivalent control conditions in
   an unaffected area. Do not translate a monster-modifier count directly into
   a border score; it is behavioral evidence only.
6. Repeat a candidate under the same documented conditions, then have a second
   reviewer compare the overview, single tooltip, OCR text, and gameplay
   observation. Preserve contradictory results rather than selecting the one
   that matches the datamined name.

## Resolution rules

- **Do not create a new OCR definition** from the raw ID alone. A definition
  needs exact live text that the matcher can distinguish.
- **Do not collapse the Treasure Anchors record into `b-anchor-1`** merely
  because the public translation collides. Collapse requires controlled live
  evidence that their observable gameplay and scoring semantics are equivalent.
- **Do not label Magic Monster value 2 blank or non-rollable** from a missing
  translation rule, empty spawn weights, or failure to encounter it in a finite
  sample. That conclusion needs authoritative client/server evidence or a live
  selection state that exposes a deliberately blank border.
- If exact tooltip text is visible but raw-record identity remains unknowable,
  preserve the ambiguity in `src/data/borderSourceRecords.ts` and attach the
  capture as evidence without changing canonical scoring.

## Sources checked

- Official Path of Exile 3.29.3 notes:
  https://www.pathofexile.com/forum/view-thread/3996516
- RePoE PoE1 export index (3.29.3.1.2 when reviewed on 2026-08-14):
  https://repoe-fork.github.io/poe1.html
- Generated RePoE export revision:
  https://github.com/repoe-fork/repoe-fork.github.io/commit/af4ccc5e3e011da671553a40d851b1140902ef19
- Raw modifiers:
  https://repoe-fork.github.io/mods.min.json
- Deepwater implicit translations:
  https://repoe-fork.github.io/stat_translations/deepwater_implicit.min.json
