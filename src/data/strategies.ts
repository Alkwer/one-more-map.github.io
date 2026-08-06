// Curated strategies. Each one overrides the user's reward weights and adds
// position rules that shape what the solver suggests while it is active.
//
// First set is from Milkybk_'s "Curse of the Allflame Buffs and My Strategy"
// (https://www.youtube.com/watch?v=gVKQhYxeavk) - transcribed and encoded
// 2026-07-28. His approach is deliberately all-or-nothing: run the speedrun
// board with spare charts until you've collected the pieces for a juiced one.

import type { ChartAreaType, Edges, Stat, Weights } from '../types'

export const STRATEGY_RESERVATION_OPTIONS = [
  { id: 'genericStrongboxes', label: 'Generic Strongboxes (+1 / +2-4 / +5)' },
  { id: 'divinerStrongboxes', label: "Diviner's Strongboxes" },
  { id: 'arcanistStrongboxes', label: "Arcanist's Strongboxes" },
  { id: 'operativeStrongboxes', label: "Operative's Strongboxes" },
  { id: 'messages', label: 'Messages in a Bottle' },
  { id: 'starfish', label: 'Giant Starfish' },
  { id: 'globalRares', label: 'Rare Monsters in all Voyage Areas' },
  { id: 'adjacentRares', label: 'Rare Monsters in adjacent Areas' },
  { id: 'seaPillars', label: 'Sea-Pillar destinations' },
  { id: 'pelagicAbyss', label: 'Pelagic Abyss destinations' },
  { id: 'meatfish', label: 'Other Meatfish pieces' },
] as const

export type StrategyReservationId = (typeof STRATEGY_RESERVATION_OPTIONS)[number]['id']
export type StrategyReservationPreferences = Record<StrategyReservationId, boolean>

export const defaultStrategyReservations = (): StrategyReservationPreferences => ({
  genericStrongboxes: true,
  divinerStrongboxes: true,
  arcanistStrongboxes: true,
  operativeStrongboxes: true,
  messages: true,
  starfish: true,
  globalRares: true,
  adjacentRares: true,
  seaPillars: true,
  pelagicAbyss: true,
  meatfish: true,
})

export interface StrategyReservationGroup {
  id: StrategyReservationId
  label: string
  modIds?: string[]
  nameMatches?: string[]
  areaTypes?: ChartAreaType[]
}

export interface StrategyPosition {
  /** board cells this rule targets (row-major, 4 = centre) */
  cells?: number[]
  /** or resolve cells dynamically: tiles touched by border segments rolled
   *  with this border mod id (e.g. put a chart ON the Divine-border tile) */
  nearBorderId?: string
  /** with nearBorderId: target the NEIGHBOURS of the border tile instead */
  adjacentToBorder?: boolean
}

export interface StrategyChartMatcher {
  /** chart implicit mod ids that satisfy the rule */
  modIds?: string[]
  /** or match by chart name (case-insensitive substring, e.g. Sea-Pillar) */
  nameMatch?: string
  /** or match a locale-independent Chart destination */
  areaTypes?: ChartAreaType[]
}

export interface PositionRule extends StrategyPosition, StrategyChartMatcher {
  /** or a header reward stat, scored as percent/100 × per */
  rewardStat?: { stat: Stat; per: number }
  /** objective bonus per matching placement */
  bonus: number
}

export interface StrategyRequirementDef extends StrategyPosition, StrategyChartMatcher {
  count: number
  /** adapt the required count to the number of physical neighbours around
   *  the best currently rolled border tile (2 for a corner, 3 for an edge) */
  countByBorderNeighbours?: {
    borderId: string
    two: number
    three: number
  }
  label: string
}

export type StrategyRecommendationTier = 'fallback' | 'specialized' | 'jackpot'

export interface StrategyDef {
  id: string
  name: string
  tagline: string
  /** Coarse evidence-backed recommendation class. Reward weights optimize and
   *  compare strategies only within a class; they are not calibrated profit/EV. */
  recommendationTier: StrategyRecommendationTier
  source: { label: string; url: string }
  /** the video's guidance, shown on the expanded card */
  guide: string[]
  /** reward-weight override while active (unlisted rewards count as 0) */
  weights: Weights
  rules: PositionRule[]
  /** exact connector layout to build (effective edges [N,E,S,W] per cell after
   *  rotation) - the solver treats any deviation as a heavy penalty */
  layout?: Edges[]
  /** per-cell cost of deviating from the layout. Default is strict (300);
   *  a small value makes the lines a soft preference that yields to the
   *  position rules (piece locations matter more than exact lines) */
  layoutPenalty?: number
  /** Optional chart-type keeper groups excluded while this strategy is active.
   *  Users can enable each group independently in the solver controls. */
  reservationGroups?: StrategyReservationGroup[]
  /** pieces the strategy needs before it can receive a PLAY recommendation;
   *  the UI lists any missing requirements as diagnostic context */
  requirements?: StrategyRequirementDef[]
  /** Explicit keep-wizard chart types. When present they replace the
   * requirement-derived types, allowing banking to be more granular than
   * readiness requirements. */
  bankTypes?: {
    label: string
    modIds?: string[]
    areaTypes?: ChartAreaType[]
    keep: number
  }[]
  /** a border roll the strategy hinges on (readiness warns if not entered) */
  requiresBorderId?: { id: string; label: string }
  /** what to do instead while pieces are missing */
  waitHint?: string
  /** Divine strategies may consume rare-implicit charts; every other mode
   *  keeps them available for a future Divine-border run by default. */
  allowRareImplicits?: boolean
  /** Meatfish may consume Rare Fracture charts; other strategies bank them. */
  allowFractureCharts?: boolean
  /** Milky's in-game search string highlighting this strategy's keeper charts */
  searchRegex?: string
  /** extra links shown on the card (trade searches, guides) */
  extraLinks?: { label: string; url: string }[]
}

const RECOMMENDATION_TIER_PRIORITY: Record<StrategyRecommendationTier, number> = {
  fallback: 0,
  specialized: 1,
  jackpot: 2,
}

export const strategyRecommendationPriority = (strategy: {
  recommendationTier?: StrategyRecommendationTier
}): number => RECOMMENDATION_TIER_PRIORITY[strategy.recommendationTier ?? 'specialized']

/** Apply contextual fit without losing the fallback semantics: a fitting
 * specialized strategy wins, then fallback, then non-fitting specializations. */
export const contextualStrategyRecommendationPriority = (
  strategy: { recommendationTier?: StrategyRecommendationTier },
  fitsCurrentBorders: boolean | null,
): number => {
  const tier = strategy.recommendationTier ?? 'specialized'
  if (fitsCurrentBorders === null) return strategyRecommendationPriority(strategy)
  if (tier === 'fallback') return 1
  return fitsCurrentBorders ? 2 + strategyRecommendationPriority(strategy) : 0
}

/** Rare-monster implicit charts are Divine-strategy fuel. */
export const RARE_IMPLICITS = ['adj-rare-1', 'adj-rare-2', 'voy-rare'] as const

/** Rare Fracture charts are Meatfish fuel. */
export const MEATFISH_FUEL = ['voy-fracture'] as const

/** Milky's master keeper regex - every mod worth saving, across all strats */
export const ALL_GOOD_MODS_REGEX =
  '"cannot drop|poss|fract|bottle|divine|arca|oper|star|pantheon|belt|lantern|4000 w|strongbo|rare monsters in all voy|sulphur found in all"'

const CENTER = [4]
const EDGES = [1, 3, 5, 7]
const ALL_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

// Milky's exact Meatfish board (from his planner, screenshotted 2026-07-28):
// corners at 0/2/7... rendered as effective edges [N,E,S,W] per cell.
// 10 connections, all linked to the ⚓ start; cell 6's south arm dangles off-board.
const T = true
const F = false
const MEATFISH_LAYOUT: Edges[] = [
  [F, T, T, F], // 0 corner
  [F, T, T, T], // 1 T-junction
  [F, F, T, T], // 2 corner
  [T, F, T, F], // 3 straight
  [T, T, T, F], // 4 T-junction
  [T, F, T, T], // 5 T-junction
  [T, F, T, F], // 6 straight (start; south dangles off-board)
  [T, T, F, F], // 7 corner
  [T, F, F, T], // 8 corner
]

// the ONE chart Speedrun puts in the centre: premium typed Strongboxes or
// Messages in a Bottle (generic Strongboxes don't qualify)
const SPEEDRUN_PREMIUM_STRONGBOX_MODS = [
  'adj-divbox-1',
  'adj-divbox-2',
  'adj-arcbox-1',
  'adj-arcbox-2',
  'adj-opbox-1',
  'adj-opbox-2',
]
export const SPEEDRUN_CENTER_MODS = [...SPEEDRUN_PREMIUM_STRONGBOX_MODS, 'adj-msg-1', 'adj-msg-2']
const NOT_CENTER = [0, 1, 2, 3, 5, 6, 7, 8]

const GENERIC_STRONGBOX_RESERVATION: StrategyReservationGroup = {
  id: 'genericStrongboxes',
  label: 'Generic Strongboxes',
  modIds: ['adj-box-1', 'adj-box-2', 'adj-box-3'],
}

const DIVINER_STRONGBOX_RESERVATION: StrategyReservationGroup = {
  id: 'divinerStrongboxes',
  label: "Diviner's Strongboxes",
  modIds: ['adj-divbox-1', 'adj-divbox-2'],
}

const ARCANIST_STRONGBOX_RESERVATION: StrategyReservationGroup = {
  id: 'arcanistStrongboxes',
  label: "Arcanist's Strongboxes",
  modIds: ['adj-arcbox-1', 'adj-arcbox-2'],
}

const OPERATIVE_STRONGBOX_RESERVATION: StrategyReservationGroup = {
  id: 'operativeStrongboxes',
  label: "Operative's Strongboxes",
  modIds: ['adj-opbox-1', 'adj-opbox-2'],
}

const MESSAGE_RESERVATION: StrategyReservationGroup = {
  id: 'messages',
  label: 'Messages in a Bottle',
  modIds: ['adj-msg-1', 'adj-msg-2'],
}

const SPEEDRUN_RESERVATIONS = [
  DIVINER_STRONGBOX_RESERVATION,
  ARCANIST_STRONGBOX_RESERVATION,
  OPERATIVE_STRONGBOX_RESERVATION,
  MESSAGE_RESERVATION,
]

const STARFISH_RESERVATION: StrategyReservationGroup = {
  id: 'starfish',
  label: 'Giant Starfish',
  modIds: ['adj-star-1', 'adj-star-2'],
}

const ADJACENT_RARES_RESERVATION: StrategyReservationGroup = {
  id: 'adjacentRares',
  label: 'Adjacent Rare Monsters',
  modIds: ['adj-rare-1', 'adj-rare-2'],
}

const GLOBAL_RARES_RESERVATION: StrategyReservationGroup = {
  id: 'globalRares',
  label: 'Voyage-wide Rare Monsters',
  modIds: ['voy-rare'],
}

export const DIVINE_RARE_RESERVATIONS = [ADJACENT_RARES_RESERVATION, GLOBAL_RARES_RESERVATION]

const SEA_PILLAR_RESERVATION: StrategyReservationGroup = {
  id: 'seaPillars',
  label: 'Sea-Pillar destinations',
  nameMatches: ['pillar'],
  areaTypes: ['sea-pillars'],
}

const PELAGIC_ABYSS_RESERVATION: StrategyReservationGroup = {
  id: 'pelagicAbyss',
  label: 'Pelagic Abyss destinations',
  nameMatches: ['pelagic'],
  areaTypes: ['pelagic-abyss'],
}

const MEATFISH_RESERVATION: StrategyReservationGroup = {
  id: 'meatfish',
  label: 'Other Meatfish pieces',
  modIds: [
    'adj-pantheon',
    'adj-lantern',
    'voy-possess',
    'voy-fracture',
    'voy-noequip',
    'adj-wisps-1',
    'adj-wisps-2',
  ],
}

const DIVINE_RESERVATIONS: StrategyReservationGroup[] = [
  GENERIC_STRONGBOX_RESERVATION,
  STARFISH_RESERVATION,
  ADJACENT_RARES_RESERVATION,
  GLOBAL_RARES_RESERVATION,
  SEA_PILLAR_RESERVATION,
  PELAGIC_ABYSS_RESERVATION,
]

/** Manual solving protects every curated chart type by default. */
export const MANUAL_STRATEGY_RESERVATIONS: StrategyReservationGroup[] = [
  ...SPEEDRUN_RESERVATIONS,
  ...DIVINE_RESERVATIONS,
  MEATFISH_RESERVATION,
]

// "Alc & Go" highway: three vertical lanes capped at the top,
// joined along the bottom row. 8 connections, all reaching the ⚓ start.
const ALC_GO_LAYOUT: Edges[] = [
  [F, F, T, F], // 0 end (lane cap)
  [F, F, T, F], // 1 end
  [F, F, T, F], // 2 end
  [T, F, T, F], // 3 straight
  [T, F, T, F], // 4 straight
  [T, F, T, F], // 5 straight
  [T, T, F, F], // 6 corner (start)
  [T, T, F, T], // 7 T-junction
  [T, F, F, T], // 8 corner
]

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'alc-and-go',
    name: 'Alc & Go',
    tagline: 'Burn the charts nothing else wants - one-lane highways, hope for random encounters.',
    recommendationTier: 'fallback',
    source: { label: 'Milky’s strat', url: '' },
    guide: [
      'Uses only charts no other strategy needs - every juice piece and centre box is held back automatically.',
      'Forms single-lane highways (three lanes joined along the bottom) - or whatever the shapes allow.',
      'Don’t care what’s on the tiles: you’re there for scattered loot, sulphur and random encounters.',
      'Alc, go, place every lantern, click everything, leave. Rinse and repeat between real runs.',
    ],
    weights: {
      'self:quant': 2,
      'self:sulph': 2,
      'voyage:sulph': 2,
      'voyage:quant': 2,
    },
    rules: [],
    layout: ALC_GO_LAYOUT,
    layoutPenalty: 15, // a preference, not a law - "whatever works"
    reservationGroups: [...SPEEDRUN_RESERVATIONS, ...DIVINE_RESERVATIONS, MEATFISH_RESERVATION],
  },
  {
    id: 'milky-speedrun',
    name: 'Speedrun Strongboxes',
    tagline: 'Milky’s interim farm - burn spare charts, crack boxes, get in, get out.',
    recommendationTier: 'specialized',
    source: {
      label: 'Milkybk_ - Allflame Buffs and My Strategy',
      url: 'https://www.youtube.com/watch?v=gVKQhYxeavk',
    },
    guide: [
      'Put exactly ONE premium Strongbox chart in the CENTRE. Operative’s is the scarab-first choice; Arcanist’s, Diviner’s and Message-in-a-Bottle are valuable fallbacks whose order depends on current prices.',
      'Roll charts to 110%+ Item Quantity BEFORE running them - they can’t be rolled after, and quantity scales the boxes.',
      'Put your highest Item Quantity charts on the four sides.',
      'Everything else is junk you don’t need for other strategies - corners just make the connectors line up.',
      'Take Alchemy, Scouring and Exalted orbs in to juice every box before opening.',
      'If a Filthscrabble border appears (a ~4,000-sulphur boss), the solver pins your highest-sulphur chart to its tile.',
      'Speed matters: place lanterns, click everything, open the boxes, leave. Even a junk voyage yields a div or two of scattered loot.',
      'Never burns your juice pieces: Starfish, Pantheon, Lantern, Possessed, Fracture, Rares, No-Equipment, Wisp, Strongbox and Sea-Pillar charts are held back for the other strats.',
    ],
    weights: {
      'adjacent:opbox': 10,
      'adjacent:arcbox': 8,
      'adjacent:divbox': 7,
      'adjacent:msg': 7,
      'self:quant': 8,
      'voyage:quant': 5,
      'voyage:sulph': 3,
      'self:sulph': 3,
      'border:quantconn': 6,
      'border:divine': 4,
      'border:exalt': 3,
      'border:ancient': 3,
    },
    reservationGroups: [...DIVINE_RESERVATIONS, MEATFISH_RESERVATION],
    rules: [
      // one centre chart, never a second one wasted elsewhere. Operative's
      // outranks the fallbacks (Milky: "won't yield as much, but consistent")
      { cells: CENTER, modIds: ['adj-opbox-1', 'adj-opbox-2'], bonus: 55 },
      {
        cells: CENTER,
        modIds: ['adj-arcbox-1', 'adj-arcbox-2'],
        bonus: 45,
      },
      {
        cells: CENTER,
        modIds: ['adj-divbox-1', 'adj-divbox-2', 'adj-msg-1', 'adj-msg-2'],
        bonus: 40,
      },
      { cells: NOT_CENTER, modIds: SPEEDRUN_CENTER_MODS, bonus: -40 },
      // 150%+ quant charts adjacent to the centre (continuous: higher = better)
      { cells: EDGES, rewardStat: { stat: 'quantity', per: 6 }, bonus: 0 },
      // Filthscrabble border: park the highest-sulphur chart on its tile
      { nearBorderId: 'b-octoboss', rewardStat: { stat: 'sulphur', per: 8 }, bonus: 0 },
    ],
    requirements: [
      {
        modIds: SPEEDRUN_CENTER_MODS,
        cells: CENTER,
        count: 1,
        label: 'Operative’s / Arcanist’s / Diviner’s / Message chart (centre)',
      },
    ],
    waitHint: 'Run manual boards until one drops.',
    searchRegex: '"bottle|divine|arca|oper"',
  },
  {
    id: 'milky-meatfish',
    name: 'Meatfish',
    tagline: 'Milky’s big one - possessed, Pantheon-touched giga-starfish rares that rain uniques.',
    recommendationTier: 'specialized',
    source: {
      label: 'Milkybk_ - Allflame Buffs and My Strategy',
      url: 'https://www.youtube.com/watch?v=gVKQhYxeavk',
    },
    guide: [
      'Milky’s full composition (his sheet): 2× Starfish, 1× Pantheon, 2× Sea-Pillars (corners), 2× Golden Lanterns, 1× Possessed Rares, 1× No-Equipment.',
      'Starfish always top- and bottom-middle; Pantheon only ever right-middle; Golden Lantern preferably centre - any chart shape.',
      '"Monsters cannot drop Equipment" is the jackpot piece and is required before the app calls the full strategy ready. Rares Fracture is a degraded manual fallback, not an equivalent replacement. Optionally swap Pantheon for 4k Wisps.',
      'Collect every lantern in the voyage: ≈280% Quantity, 840 Rarity. Kill all the giga-rares. Obtain Mageblood/Headhunter.',
      'Very risky, all-or-nothing - don’t water it down. Speedrun boxes until you have the pieces.',
    ],
    weights: {
      'adjacent:star': 10,
      'adjacent:pantheon': 10,
      // The guide accepts only the 4k version as the Pantheon substitute. It is
      // strong enough to build around, but less established than Pantheon.
      'adjacent:wisps': 8,
      // Current field reports show the visible Lantern quantity/rarity buff but
      // weak monster-loot returns. Keep it supportive until better data exists.
      'adjacent:lantern': 3,
      'voyage:possess': 10,
      'border:rare': 9,
      'self:quant': 4,
      'self:rarity': 3,
    },
    rules: [
      // Placement rules: Starfish ALWAYS top/bottom-middle, Pantheon
      // ONLY right-middle, Golden Lantern preferably centre - any chart shape.
      // Bonuses outweigh the (soft) layout so location wins over exact lines;
      // negative bonuses keep the locked pieces out of every other square.
      { cells: [1, 7], modIds: ['adj-star-1', 'adj-star-2'], bonus: 80 },
      { cells: [0, 2, 3, 4, 5, 6, 8], modIds: ['adj-star-1', 'adj-star-2'], bonus: -80 },
      { cells: [5], modIds: ['adj-pantheon'], bonus: 80 },
      { cells: [0, 1, 2, 3, 4, 6, 7, 8], modIds: ['adj-pantheon'], bonus: -80 },
      { cells: [4], modIds: ['adj-lantern'], bonus: 40 },
      // This global conversion piece has no numeric ModEffect, so explicitly
      // keep it in the selected nine when the strategy is complete.
      { cells: ALL_CELLS, modIds: ['voy-noequip'], bonus: 100 },
      // Sea-Pillars belong in the corners (their rain juices their own tile)
      { cells: [0, 2, 6, 8], nameMatch: 'pillar', areaTypes: ['sea-pillars'], bonus: 40 },
      {
        cells: [1, 3, 4, 5, 7],
        nameMatch: 'pillar',
        areaTypes: ['sea-pillars'],
        bonus: -40,
      },
    ],
    layout: MEATFISH_LAYOUT,
    // soft: a full-board layout deviation (9 cells × 6) must still cost less
    // than any single piece bonus, so lines always yield to piece locations
    layoutPenalty: 6,
    requirements: [
      // Milky's sheet composition (2+1+2+2+1+1 = 9 charts)
      {
        modIds: ['adj-star-1', 'adj-star-2'],
        cells: [1, 7],
        count: 2,
        label: 'Giant Starfish chart',
      },
      {
        modIds: ['adj-pantheon', 'adj-wisps-2'],
        cells: [5],
        count: 1,
        label: 'Pantheon (or 4k Wisp) chart',
      },
      {
        nameMatch: 'pillar',
        areaTypes: ['sea-pillars'],
        cells: [0, 2, 6, 8],
        count: 2,
        label: 'Sea-Pillar chart (corners)',
      },
      { modIds: ['adj-lantern'], count: 2, label: 'Golden Lantern chart' },
      { modIds: ['voy-possess'], count: 1, label: 'Possessed Rares chart' },
      { modIds: ['voy-noequip'], count: 1, label: 'No-Equipment chart' },
    ],
    waitHint: 'Speedrun Strongboxes in the meantime.',
    searchRegex: '"cannot|poss|lantern|pantheon"',
    allowFractureCharts: true,
  },
  {
    id: 'divine-border-rares',
    name: 'Divine Border Rares',
    tagline:
      'Roll a Divine border, park a Sea-Pillar chart on it, and drown that tile in rares - every rare drops a Divine Orb.',
    recommendationTier: 'jackpot',
    source: { label: 'Milky’s strat', url: '' },
    guide: [
      'If you hit "+1 Divine Orb per Rare Monster", preserve the roll. The app only suggests the two cheap default rerolls (3k and 6k); the unknown roll distribution does not justify chasing it at any cost.',
      'Enter your borders on the board - the solver pins your Sea-Pillar chart to the Divine tile (its pillars rain extra rares into that exact area).',
      'Use 2 feeder charts when the Divine tile is a corner and 3 when it is a middle edge tile. Strongboxes can be rolled for rare guards, but treat the maximum seven-rares outcome as potential rather than guaranteed live yield.',
      'Starfish charts also feed it if you’re short on Strongbox charts.',
      'Fill the remaining 5-6 slots with Increased Rare Monsters charts; the exact count depends on whether the Divine tile has 3 or 2 neighbours.',
    ],
    weights: {
      'adjacent:rare': 10,
      'voyage:rare': 10,
      'border:rare': 10,
      'adjacent:star': 8,
      'adjacent:box': 8,
      'border:divine': 10,
      'self:pack': 3,
    },
    rules: [
      // the Sea-Pillar chart sits ON whichever tile the Divine border touches
      {
        nearBorderId: 'b-divine',
        nameMatch: 'pillar',
        areaTypes: ['sea-pillars'],
        bonus: 100,
      },
      // feeders shoot INTO the Divine tile from beside it. "+5 Strongboxes"
      // (7 rares per box when rolled = 35 divines) outranks lower tiers/starfish
      { nearBorderId: 'b-divine', adjacentToBorder: true, modIds: ['adj-box-3'], bonus: 35 },
      {
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        modIds: ['adj-box-1', 'adj-box-2'],
        bonus: 22,
      },
      {
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        modIds: ['adj-star-1', 'adj-star-2'],
        bonus: 15,
      },
    ],
    requirements: [
      {
        nameMatch: 'pillar',
        areaTypes: ['sea-pillars'],
        nearBorderId: 'b-divine',
        count: 1,
        label: 'Sea-Pillar chart',
      },
      {
        modIds: ['adj-star-1', 'adj-star-2', 'adj-box-1', 'adj-box-2', 'adj-box-3'],
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        count: 3,
        countByBorderNeighbours: { borderId: 'b-divine', two: 2, three: 3 },
        label: 'Starfish or Strongbox feeder chart',
      },
      {
        modIds: ['adj-rare-1', 'adj-rare-2', 'voy-rare'],
        count: 5,
        countByBorderNeighbours: { borderId: 'b-divine', two: 6, three: 5 },
        label: 'Increased Rares chart',
      },
    ],
    // Banking is more granular than readiness: typed boxes remain available
    // to Speedrun, while voyage-wide rares outrank adjacent rares.
    bankTypes: [
      { label: 'Sea-Pillar chart', areaTypes: ['sea-pillars'], keep: 1 },
      { label: 'Giant Starfish chart', modIds: ['adj-star-1', 'adj-star-2'], keep: 3 },
      {
        label: 'Strongbox chart (+2-4 / +5)',
        modIds: ['adj-box-2', 'adj-box-3'],
        keep: 3,
      },
      { label: 'Strongbox chart (+1)', modIds: ['adj-box-1'], keep: 0 },
      { label: 'Increased Rares chart (voyage-wide)', modIds: ['voy-rare'], keep: 6 },
      {
        label: 'Increased Rares chart (adjacent)',
        modIds: ['adj-rare-1', 'adj-rare-2'],
        keep: 0,
      },
    ],
    requiresBorderId: {
      id: 'b-divine',
      label: 'a "+1 Divine Orb" border roll (enter your borders)',
    },
    waitHint: 'Speedrun Strongboxes until the pieces and the Divine border line up.',
    searchRegex: '"rare monsters in all voy|strongbox"',
    allowRareImplicits: true,
  },
  {
    id: 'cutedog-divine-boxes',
    name: 'Divine Strongboxes',
    tagline:
      'cutedog_’s Divine-border variant - Pelagic Abyss on the Divine tile with strongboxes feeding potential rare guards into it.',
    recommendationTier: 'jackpot',
    source: { label: 'cutedog_ (Twitch)', url: 'https://www.twitch.tv/cutedog_' },
    guide: [
      'Needs the "+1 Divine Orb per Rare" border. Put a Pelagic Abyss chart with high % Pack Size on that exact tile.',
      'Use 2 Strongbox charts beside a corner Divine tile or 3 beside a middle edge tile. Any Strongbox type can feed the target area.',
      'Roll the Strongboxes for rare guards. The combined seven-rares outcome is difficult to roll and current field reports are not consistent enough to call every guard a guaranteed Divine.',
      'Fill the remaining 5-6 tiles with voyage-wide increased Rare Monsters.',
      'Buy good charts cheap on trade (link below) - whisper "fastge". Use the 120%+ quantity regex when browsing.',
    ],
    weights: {
      'voyage:rare': 10,
      'border:rare': 10,
      'adjacent:box': 9,
      'adjacent:divbox': 8,
      'adjacent:arcbox': 8,
      'adjacent:opbox': 8,
      'border:divine': 10,
      'self:pack': 6,
    },
    rules: [
      // Pelagic Abyss (high pack size) sits ON the Divine-border tile
      {
        nearBorderId: 'b-divine',
        nameMatch: 'pelagic',
        areaTypes: ['pelagic-abyss'],
        bonus: 80,
      },
      { nearBorderId: 'b-divine', rewardStat: { stat: 'packsize', per: 8 }, bonus: 0 },
      // any strongbox adjacent charts feed the Divine tile from beside it
      {
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        modIds: [
          'adj-box-1',
          'adj-box-2',
          'adj-box-3',
          'adj-divbox-1',
          'adj-divbox-2',
          'adj-arcbox-1',
          'adj-arcbox-2',
          'adj-opbox-1',
          'adj-opbox-2',
        ],
        bonus: 25,
      },
    ],
    requirements: [
      {
        nameMatch: 'pelagic',
        areaTypes: ['pelagic-abyss'],
        nearBorderId: 'b-divine',
        count: 1,
        label: 'Pelagic Abyss chart (high pack size)',
      },
      {
        modIds: [
          'adj-box-1',
          'adj-box-2',
          'adj-box-3',
          'adj-divbox-1',
          'adj-divbox-2',
          'adj-arcbox-1',
          'adj-arcbox-2',
          'adj-opbox-1',
          'adj-opbox-2',
        ],
        nearBorderId: 'b-divine',
        adjacentToBorder: true,
        count: 3,
        countByBorderNeighbours: { borderId: 'b-divine', two: 2, three: 3 },
        label: 'Strongbox adjacent chart (any type)',
      },
      {
        modIds: ['voy-rare'],
        count: 5,
        countByBorderNeighbours: { borderId: 'b-divine', two: 6, three: 5 },
        label: 'Increased Rares (voyage) chart',
      },
    ],
    bankTypes: [
      {
        label: 'Pelagic Abyss chart (high pack size)',
        areaTypes: ['pelagic-abyss'],
        keep: 1,
      },
      {
        label: 'Strongbox chart (+2-4 / +5)',
        modIds: ['adj-box-2', 'adj-box-3'],
        keep: 3,
      },
      {
        label: "Diviner's Strongbox chart",
        modIds: ['adj-divbox-1', 'adj-divbox-2'],
        keep: 0,
      },
      {
        label: "Arcanist's Strongbox chart",
        modIds: ['adj-arcbox-1', 'adj-arcbox-2'],
        keep: 0,
      },
      {
        label: "Operative's Strongbox chart",
        modIds: ['adj-opbox-1', 'adj-opbox-2'],
        keep: 0,
      },
      { label: 'Increased Rares chart (voyage-wide)', modIds: ['voy-rare'], keep: 6 },
    ],
    requiresBorderId: {
      id: 'b-divine',
      label: 'a "+1 Divine Orb" border roll (enter your borders)',
    },
    waitHint: 'Speedrun Strongboxes until the pieces and the Divine border line up.',
    searchRegex: '"m q.*(1[2-9].|[2-9]..)%"',
    allowRareImplicits: true,
    extraLinks: [
      {
        label: 'Trade search: cheap good charts',
        url: 'https://www.pathofexile.com/trade/search/Allflame/9zRn7YLRHK',
      },
    ],
  },
]

export const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]))
