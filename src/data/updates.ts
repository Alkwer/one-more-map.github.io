// Site updates log: NEW features and REWORKED behaviour only - bug fixes and
// data corrections stay out. Newest first; the top entry's date drives the
// "unseen updates" dot on the header button.

export interface UpdateEntry {
  /** ISO date the feature shipped */
  date: string
  tag: 'new' | 'reworked'
  title: string
  /** one or two plain sentences - what it is and where to find it */
  detail: string
}

export const UPDATES: UpdateEntry[] = [
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Site tutorial',
    detail:
      'The 🧭 TUTORIAL button next to the site name walks the whole workflow in 8 steps - import, borders, strategies, keep counts, solve, copy into game, finish - spotlighting each section of the page as it goes. The 📋 Plan button also moved next to Solve.',
  },
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Keep-count wizard',
    detail:
      '🔖 Save charts for strategies… (Chart Library) walks you through each strategy\'s recommended chart types with a "keep X" stepper - the solver banks your best X of each type and spends everything beyond that. Banked charts wear a 🔒 naming their strategy; a chart type shared by strategies gets one knob sized for the hungriest.',
  },
  {
    date: '2026-08-02',
    tag: 'reworked',
    title: 'Reservations became keep counts',
    detail:
      'Blanket holds ("save every Lantern") are gone: every protection now banks the best X of each recommended piece type, defaulting to what each strategy actually needs (rares get one spare). The Solver Settings toggles switch whole categories of banks off.',
  },
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Session planner',
    detail:
      '📋 Plan (next to Solve) sequences your whole library into a run order: juiced strategies first when their pieces are ready, Speedruns while centre charts last, Alc & Go with the rest - and shows what each waiting strategy still needs.',
  },
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Rare chart import alerts',
    detail:
      'Importing a Rare Monsters chart (Divine-strategy fuel) now pops a golden alert in the Import panel, so a jackpot piece never slips into the library unnoticed.',
  },
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Strategy fuel locks in the library',
    detail:
      'Charts saved as another strategy’s fuel (rare-implicits for the Divine strats, Rare Fracture for Meatfish) now show a 🔒 badge in the Chart Library with a tooltip naming the strategy. Badges follow the protection toggles.',
  },
  {
    date: '2026-08-02',
    tag: 'new',
    title: 'Configurable keeper protections',
    detail:
      'Solver Settings now has "Protect charts for other strategies" checkboxes (Divine / Meatfish / Magic Ethereal). Switch a category off to let Alc & Go and Speedrun spend its charts - the solve note tells you what was held back and why. Community contribution by Alkwer.',
  },
  {
    date: '2026-08-01',
    tag: 'new',
    title: 'Chart destinations power the strategies',
    detail:
      'Imports now read the destination line (Sea Pillars, Pelagic Abyss, …) in any client language, so the Sea-Pillar and Pelagic Abyss strategy pieces are detected reliably. Community contribution by jinyounghub.',
  },
  {
    date: '2026-08-01',
    tag: 'new',
    title: 'Korean client support',
    detail:
      'The bulk importer and border OCR understand the Korean client: chart names, implicit modifiers and all border tooltips map to the same solver data as English. Community contribution by jinyounghub.',
  },
  {
    date: '2026-08-01',
    tag: 'reworked',
    title: 'Locked charts stay put',
    detail:
      'A 🔒-preserved chart placed on the board is pinned to its exact square and rotation - every solve arranges the other eight charts around it instead of moving it.',
  },
  {
    date: '2026-08-01',
    tag: 'new',
    title: 'Importer setup wizard',
    detail:
      'First run of the Windows bulk importer opens a guided overlay: calibrate the chart grid, click all 12 border points, preview, done. One contextual key (F7) handles every calibration step; all hotkeys are rebindable from the tray.',
  },
  {
    date: '2026-08-01',
    tag: 'new',
    title: 'Border OCR import',
    detail:
      'The Windows bulk importer reads all 12 board-border tooltips with local Windows OCR and fills them in automatically alongside your charts. Shift+F9 imports just the borders. Built with Alkwer.',
  },
  {
    date: '2026-07-30',
    tag: 'new',
    title: 'Divine Strongboxes & Alc + Go strategies',
    detail:
      'Two more curated strategies: cutedog_’s Divine Strongboxes (Pelagic Abyss on the Divine border tile) and Alc & Go, a one-lane-highway trash burner that only uses charts no other strategy wants. Jackpot alerts flag "cannot drop Equipment" charts and Divine border rolls with a one-click strategy switch.',
  },
  {
    date: '2026-07-30',
    tag: 'new',
    title: 'Open source',
    detail:
      'The solver is MIT-licensed with a contributing guide - issues and pull requests welcome on GitHub.',
  },
  {
    date: '2026-07-29',
    tag: 'new',
    title: 'Curated Strategies tab',
    detail:
      'Pick a community strategy (Milkybk_’s Speedrun Strongboxes, Meatfish and Magic Ethereal, plus Divine Border Rares) and the solver builds its exact board: piece placements, connector layout, reserved charts, readiness warnings when you lack the pieces, and rolling regexes.',
  },
  {
    date: '2026-07-27',
    tag: 'new',
    title: 'Windows bulk importer',
    detail:
      'A downloadable AutoHotkey script sweeps your whole in-game chart panel and imports everything in one paste - no more copying charts one at a time. Find it in the Import panel.',
  },
  {
    date: '2026-07-27',
    tag: 'new',
    title: 'Voyage Mod Count & filler voyages',
    detail:
      'The board shows a live count of area / adjacent / voyage-wide mods and connections. A Filler Voyage button builds a throwaway board from your lowest-value spares, keeping your best nine and locked charts safe.',
  },
  {
    date: '2026-07-27',
    tag: 'reworked',
    title: 'Real connector rules & per-reward weights',
    detail:
      'The solver only suggests runnable boards: adjacent connectors must match, all nine squares filled, everything reachable from the ⚓ start. Reward weights became one slider per reward type, grouped by scope and collapsed by default.',
  },
  {
    date: '2026-07-25',
    tag: 'new',
    title: 'Copy into game & Finish Voyage',
    detail:
      'Copy into game steps through your board in the in-game fill order (bottom-left first), copying a search string for each chart - Ctrl+C advances. Finish Voyage consumes the board and asks, chart by chart, which preserved ones actually survived.',
  },
]

/** the newest entry's date - drives the unseen-updates dot */
export const LATEST_UPDATE_DATE = UPDATES[0].date
