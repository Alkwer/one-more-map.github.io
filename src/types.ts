// Core data model for the Voyage Board solver.
// NOTE: built pre-launch from reveal coverage - field shapes are designed to be
// easy to adjust once real in-game data is available (see RESEARCH.md).

/** Reward dimensions a modifier can affect (from the datamined 3.29 mod pools). */
export type Stat =
  | 'currency'
  | 'gold'
  | 'scarabs'
  | 'divcards'
  | 'essences' // Imprisoned Monsters
  | 'spirits' // Tormented Spirits
  | 'wisps' // Wildwood Wisp empowerment
  | 'rares'
  | 'magicmonsters'
  | 'sulphur'
  | 'packsize'
  | 'quantity'
  | 'rarity'
  | 'uniques' // unique ring/amulet/belt conversion
  | 'treasure' // anchors, lockers, barrels, messages, fish, altars…
  | 'exp' // experience gain
  | 'preserve' // chance charts aren't consumed

export const ALL_STATS: Stat[] = [
  'currency',
  'gold',
  'scarabs',
  'divcards',
  'essences',
  'spirits',
  'wisps',
  'rares',
  'magicmonsters',
  'sulphur',
  'packsize',
  'quantity',
  'rarity',
  'uniques',
  'treasure',
  'exp',
  'preserve',
]

/** compact labels for tight UI spots (tiles, pills, grid squares) */
export const STAT_SHORT: Record<Stat, string> = {
  currency: 'Currency',
  gold: 'Gold',
  scarabs: 'Scarabs',
  divcards: 'Div Cards',
  essences: 'Essences',
  spirits: 'Spirits',
  wisps: 'Wisps',
  rares: 'Rares',
  magicmonsters: 'Magic',
  sulphur: 'Sulphur',
  packsize: 'Pack Size',
  quantity: 'Quantity',
  rarity: 'Rarity',
  uniques: 'Uniques',
  treasure: 'Treasure',
  exp: 'XP',
  preserve: 'Preserve',
}

export const STAT_LABELS: Record<Stat, string> = {
  currency: 'Currency',
  gold: 'Gold',
  scarabs: 'Scarabs',
  divcards: 'Divination Cards',
  essences: 'Imprisoned Monsters',
  spirits: 'Tormented Spirits',
  wisps: 'Wildwood Wisps',
  rares: 'Rare Monsters',
  magicmonsters: 'Magic Monsters',
  sulphur: "Dead Man's Sulphur",
  packsize: 'Pack Size',
  quantity: 'Item Quantity',
  rarity: 'Item Rarity',
  uniques: 'Unique Items',
  treasure: 'Treasure',
  exp: 'Experience',
  preserve: 'Chart Preservation',
}

/** Who a voyage modifier applies to. */
export type Scope = 'self' | 'adjacent' | 'global'

export interface ModEffect {
  stat: Stat
  /** percentage value; treated multiplicatively as (1 + percent/100) */
  percent: number
}

/** A voyage modifier definition (on a chart). */
export interface VoyageModDef {
  id: string
  text: string
  scope: Scope
  effects: ModEffect[]
  /** some mods scale per connection the chart has (or reward fewer connections) */
  scaling?: 'connections' | 'inverse-connections'
}

/** A border modifier definition (rolled on the 12 board edge segments). */
export interface BorderModDef {
  id: string
  text: string
  effects: ModEffect[]
  /** meta-mod: % increased magnitude of the touched chart's own modifiers */
  magnitude?: number
  /** effects applied per matched connection the touched chart has (can be negative) */
  perConnEffects?: ModEffect[]
}

/** Edge connectors, clockwise from North: [N, E, S, W]. */
export type Edges = [boolean, boolean, boolean, boolean]

/** A chart instance owned by the player. */
export interface ChartData {
  uid: string
  name: string
  level: number
  edges: Edges
  /** ids into VOYAGE_MODS; usually one per chart */
  modIds: string[]
  /** unparsed mod lines kept from import so nothing is silently lost */
  rawText?: string
}

/** A chart placed on the board. */
export interface Placement {
  chartUid: string
  /** 90° clockwise rotations applied to the chart's edges (0–3) */
  rotation: number
}

/** 9 cells, row-major (index = row * 3 + col). null = empty. */
export type Board = (Placement | null)[]

/**
 * 12 border segments, each touching exactly one tile:
 * indices 0–2 top (cols 0–2), 3–5 right (rows 0–2),
 * 6–8 bottom (cols 0–2), 9–11 left (rows 0–2).
 * Value is a BorderModDef id or null.
 */
export type Borders = (string | null)[]

/** Connectivity rule - the real rule is unconfirmed pre-launch, so it's a setting. */
export type ConnectivityMode = 'any' | 'connected' | 'strict'

export type Weights = Record<Stat, number>

export const DEFAULT_WEIGHTS: Weights = {
  currency: 10,
  gold: 3,
  scarabs: 6,
  divcards: 6,
  essences: 4,
  spirits: 3,
  wisps: 5,
  rares: 4,
  magicmonsters: 2,
  sulphur: 4,
  packsize: 3,
  quantity: 5,
  rarity: 1,
  uniques: 3,
  treasure: 4,
  exp: 2,
  preserve: 3,
}

/** the Voyage starts at the bottom-left square (row 2, col 0) */
export const START_CELL = 6

export const emptyBoard = (): Board => Array(9).fill(null)
export const emptyBorders = (): Borders => Array(12).fill(null)

/** Which tile does border segment i touch? Returns board cell index. */
export function borderTouches(i: number): number {
  if (i < 3) return i // top row
  if (i < 6) return (i - 3) * 3 + 2 // right col
  if (i < 9) return 6 + (i - 6) // bottom row
  return (i - 9) * 3 // left col
}
