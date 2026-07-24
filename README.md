# Allflame Voyage Solver

Planner + auto-solver for the **Voyage Board** in Path of Exile 3.29 *Curse of the
Allflame*. 

## Features

- 3×3 Voyage Board with the 12 border-modifier segments (corners get 2, edges 1, center 0)
- Chart library with per-chart editor (name, level, voyage mod, connector edges)
- Paste-importer for Ctrl+C chart item text (format is a guess until launch - unmatched
  mod lines are kept as raw text, nothing is lost)
- Live score panel with per-stat bonus breakdown and connector validity check
- Auto-solver: exhaustive (optimal) for pools ≤ 9 charts without rotation, hill-climbing
  with restarts otherwise; configurable reward weights and connector rule
- Share layouts via URL, autosave to localStorage, JSON export/import
