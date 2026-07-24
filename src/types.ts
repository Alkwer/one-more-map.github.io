// Core data model for the Voyage Board solver.
// NOTE: built pre-launch from reveal coverage — field shapes are designed to be
// easy to adjust once real in-game data is available (see RESEARCH.md).

/** Reward dimensions a modifier can affect. Extend as real mods are datamined. */
export type Stat =
  | 'currency'
  | 'scarabs'
  | 'rares'
  | 'sulphur'
  | 'packsize'
  | 'quantity'
  | 'preserve' // chance charts aren't consumed

export const ALL_STATS: Stat[] = [
  'currency',
  'scarabs',
  'rares',
  'sulphur',
  'packsize',
  'quantity',
  'preserve',
]

export const STAT_LABELS: Record<Stat, string> = {
  currency: 'Currency',
  scarabs: 'Scarabs',
  rares: 'Rare Monsters',
  sulphur: "Dead Man's Sulphur",
  packsize: 'Pack Size',
  quantity: 'Item Quantity',
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
}

/** A border modifier definition (rolled on the 12 board edge segments). */
export interface BorderModDef {
  id: string
  text: string
  effects: ModEffect[]
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

/** Connectivity rule — the real rule is unconfirmed pre-launch, so it's a setting. */
export type ConnectivityMode = 'any' | 'connected' | 'strict'

export type Weights = Record<Stat, number>

export const DEFAULT_WEIGHTS: Weights = {
  currency: 10,
  scarabs: 6,
  rares: 4,
  sulphur: 4,
  packsize: 3,
  quantity: 5,
  preserve: 3,
}

export const emptyBoard = (): Board => Array(9).fill(null)
export const emptyBorders = (): Borders => Array(12).fill(null)

/** Which tile does border segment i touch? Returns board cell index. */
export function borderTouches(i: number): number {
  if (i < 3) return i // top row
  if (i < 6) return (i - 3) * 3 + 2 // right col
  if (i < 9) return 6 + (i - 6) // bottom row
  return (i - 9) * 3 // left col
}
