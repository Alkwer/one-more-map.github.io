# Allflame Voyage Solver

Planner + auto-solver for the **Voyage Board** in Path of Exile 3.29 *Curse of the
Allflame*. Static SPA (Vite + React + TypeScript) — no backend, deployable to GitHub
Pages or any static host.

> **Status: pre-launch scaffold.** All mod names/values are placeholders taken from
> reveal coverage. See [RESEARCH.md](RESEARCH.md) for the mechanic research and the
> **launch-day checklist** of things to verify in game (item text formats, connector
> rules, real mod pools).

## Features

- 3×3 Voyage Board with the 12 border-modifier segments (corners get 2, edges 1, center 0)
- Chart library with per-chart editor (name, level, voyage mod, connector edges)
- Paste-importer for Ctrl+C chart item text (format is a guess until launch — unmatched
  mod lines are kept as raw text, nothing is lost)
- Live score panel with per-stat bonus breakdown and connector validity check
- Auto-solver: exhaustive (optimal) for pools ≤ 9 charts without rotation, hill-climbing
  with restarts otherwise; configurable reward weights and connector rule
- Share layouts via URL, autosave to localStorage, JSON export/import

## Dev

```
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
```

## Where things live

- `src/data/mods.ts` — **the placeholder mod pools; replace on launch day**
- `src/logic/parser.ts` — chart item-text importer; adjust to the real Ctrl+C format
- `src/logic/connectivity.ts` — connector rules (three modes, real rule TBC)
- `src/logic/scoring.ts` — heuristic value model
- `src/logic/solver.ts` — exact + heuristic search
