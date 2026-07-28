// Curated strategies. Each one overrides the user's reward weights and adds
// position rules that shape what the solver suggests while it is active.
//
// First set is from Milkybk_'s "Curse of the Allflame Buffs and My Strategy"
// (https://www.youtube.com/watch?v=gVKQhYxeavk) - transcribed and encoded
// 2026-07-28. His approach is deliberately all-or-nothing: run the speedrun
// board with spare charts until you've collected the pieces for a juiced one.

import type { Edges, Stat, Weights } from '../types'

export interface PositionRule {
  /** board cells this rule targets (row-major, 4 = centre) */
  cells: number[]
  /** chart implicit mod ids that satisfy the rule */
  modIds?: string[]
  /** or a header reward stat, scored as percent/100 × per */
  rewardStat?: { stat: Stat; per: number }
  /** objective bonus per matching placement */
  bonus: number
}

export interface StrategyDef {
  id: string
  name: string
  tagline: string
  source: { label: string; url: string }
  /** the video's guidance, shown on the expanded card */
  guide: string[]
  /** reward-weight override while active (unlisted rewards count as 0) */
  weights: Weights
  rules: PositionRule[]
  /** exact connector layout to build (effective edges [N,E,S,W] per cell after
   *  rotation) - the solver treats any deviation as a heavy penalty */
  layout?: Edges[]
}

const CENTER = [4]
const EDGES = [1, 3, 5, 7]

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

// Milky's exact Magic Ethereal board: a full cross at centre, 11 connections;
// cells 6 and 7 have south arms dangling off-board.
const ETHEREAL_LAYOUT: Edges[] = [
  [F, T, T, F], // 0 corner
  [F, T, T, T], // 1 T-junction
  [F, F, T, T], // 2 corner
  [T, T, T, F], // 3 T-junction
  [T, T, T, T], // 4 crossing
  [T, F, T, T], // 5 T-junction
  [T, F, T, F], // 6 straight (start)
  [T, T, T, F], // 7 T-junction
  [T, F, F, T], // 8 corner
]

const BOX_MODS = [
  'adj-divbox-1', 'adj-divbox-2',
  'adj-arcbox-1', 'adj-arcbox-2',
  'adj-opbox-1', 'adj-opbox-2',
  'adj-box-1', 'adj-box-2', 'adj-box-3',
]

export const STRATEGIES: StrategyDef[] = [
  {
    id: 'milky-speedrun',
    name: 'Speedrun Strongboxes',
    tagline: 'Milky’s interim farm - burn spare charts, crack boxes, get in, get out.',
    source: { label: 'Milkybk_ - Allflame Buffs and My Strategy', url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      'Put a Strongbox adjacent modifier (Diviner’s / Arcanist’s / Operative’s / generic) in the CENTRE.',
      'Put your highest Item Quantity charts on the four sides - quantity scales strongboxes.',
      'Corners are throwaways: anything that makes the connectors line up.',
      'Take Alchemy, Scouring and Exalted orbs in to juice every box before opening.',
      'Speed matters: place lanterns, click everything, open the boxes, leave. ~½ div of sulphur plus scarabs, decks and div cards per run.',
    ],
    weights: {
      'adjacent:divbox': 10,
      'adjacent:arcbox': 10,
      'adjacent:opbox': 10,
      'adjacent:box': 8,
      'self:quant': 8,
      'voyage:quant': 5,
      'adjacent:lantern': 6,
      'voyage:sulph': 3,
      'self:sulph': 3,
      'border:quantconn': 6,
      'border:divine': 4,
      'border:exalt': 3,
      'border:ancient': 3,
    },
    rules: [
      { cells: CENTER, modIds: BOX_MODS, bonus: 15 },
      { cells: EDGES, rewardStat: { stat: 'quantity', per: 4 }, bonus: 0 },
      { cells: EDGES, modIds: ['cm-quant-20', 'cm-quant-28', 'cm-quant-32', 'cm-quant-45'], bonus: 3 },
    ],
  },
  {
    id: 'milky-meatfish',
    name: 'Meatfish',
    tagline: 'Milky’s big one - possessed, Pantheon-touched giga-starfish rares that rain uniques.',
    source: { label: 'Milkybk_ - Allflame Buffs and My Strategy', url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      'Builds Milky’s exact board layout: 4 Corners, 2 Straights, 3 T-junctions - 10 connections.',
      'Golden Lantern charts on the corners + right-middle; Starfish on top/bottom-middle; Pantheon on the left-middle and centre.',
      'Add Possessed Rares, and if you ever see "Monsters cannot drop Equipment", run it - Rares Fracture or extra Rare Monsters also work.',
      'Corner voyage mods barely matter - use Sea-Pillar (Coral Forest) charts there for even more starfish.',
      'Save the pieces and run it fully juiced - don’t water it down. Speedrun boxes until you have them.',
    ],
    weights: {
      'adjacent:star': 10,
      'adjacent:pantheon': 10,
      'adjacent:lantern': 10,
      'voyage:possess': 10,
      'voyage:fracture': 8,
      'voyage:rare': 8,
      'adjacent:rare': 6,
      'border:rare': 9,
      'self:quant': 4,
      'self:rarity': 3,
    },
    rules: [
      // icon cells from Milky's planner: lanterns / starfish / pantheon "meat"
      { cells: [0, 2, 5, 6, 8], modIds: ['adj-lantern'], bonus: 6 },
      { cells: [1, 7], modIds: ['adj-star-1', 'adj-star-2'], bonus: 6 },
      { cells: [3, 4], modIds: ['adj-pantheon'], bonus: 6 },
    ],
    layout: MEATFISH_LAYOUT,
  },
  {
    id: 'milky-ethereal',
    name: 'Magic Ethereal',
    tagline: 'Milky’s magic-monster variant - wisps, lanterns and everything at least Magic.',
    source: { label: 'Milkybk_ - Allflame Buffs and My Strategy', url: 'https://www.youtube.com/watch?v=gVKQhYxeavk' },
    guide: [
      'Builds Milky’s exact board layout: 3 Corners, 4 T-junctions, 1 Crossing, 1 Straight - 11 connections.',
      'Wisp charts on the four sides, Golden Lanterns on the corners, the Crossing chart dead centre.',
      'Instead of rares, go wide on magic monsters: All Monsters at least Magic + increased Magic Monsters.',
      'Use Infested Bathysphere zones - they spawn far more monsters to convert.',
      'Leans harder on "Monsters cannot drop Equipment" than Meatfish - it’s the big multiplier here.',
    ],
    weights: {
      'adjacent:wisps': 10,
      'voyage:minmagic': 10,
      'adjacent:magic': 9,
      'voyage:magic': 9,
      'adjacent:lantern': 8,
      'border:minmagic': 8,
      'self:quant': 4,
      'self:pack': 3,
    },
    rules: [
      // icon cells from Milky's planner: wisps on the cross, lanterns on corners
      { cells: EDGES, modIds: ['adj-wisps-1', 'adj-wisps-2'], bonus: 6 },
      { cells: [0, 2, 8], modIds: ['adj-lantern'], bonus: 5 },
      { cells: CENTER, modIds: ['adj-magic-1', 'adj-magic-2', 'adj-wisps-1', 'adj-wisps-2'], bonus: 5 },
    ],
    layout: ETHEREAL_LAYOUT,
  },
]

export const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]))
