# Contributing

Contributions are welcome - localization patches especially. By contributing
you agree your work is released under the repository's MIT license.

## Dev setup

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc --noEmit + production build (must pass before a PR)
```

## Where things live

- `src/logic/parser.ts` - clipboard chart-text importer. Item detection
  (`Item Class: Chart`), header reward stats (`HEADER_STATS` regexes), chart
  shapes (`SHAPE_EDGES`), and the fuzzy implicit-mod matcher (`matchImplicit`).
  Localization hooks belong here: alternate header/shape tables per language,
  detected from the pasted text.
- `src/data/mods.ts` - canonical voyage/border modifier definitions. Mod `id`s
  are the stable keys used by scoring, strategies and saved state - do not
  change them; add localized alias text instead.
- `src/components/ImportPanel.tsx` - paste box + the global Ctrl+V handler
  (currently gated on `/Item Class:\s*Chart/i` - a localization patch should
  extend that detection).
- `src/logic/scoring.ts`, `src/logic/solver.ts` - solver internals; a parsing/
  localization PR should not need to touch these.

## Localization notes

- Keep canonical mod ids and shape names internal; map localized text onto
  them at the parser boundary.
- Import unknown shapes as unresolved with a clear reason (see
  `ParseResult.unresolved`) rather than guessing a layout. Unresolved charts
  must stay out of solver inputs until the user confirms a canonical shape.
- Please include clipboard fixtures (sample copied item text) for any language
  you add, so parser changes can be checked against real client output.

## PRs

Fork, branch, and open a pull request against `main`. Merges to `main`
auto-deploy to the public site via GitHub Actions, so PRs should build clean
(`npm run build`) and describe how they were tested.
