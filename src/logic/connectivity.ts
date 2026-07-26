import type { Board, ChartData, ConnectivityMode, Edges } from '../types'

/** Rotate edges r × 90° clockwise. */
export function rotateEdges(edges: Edges, r: number): Edges {
  const out = [false, false, false, false] as Edges
  for (let i = 0; i < 4; i++) out[i] = edges[(i - r + 4) % 4]
  return out
}

const DIRS = [
  { dr: -1, dc: 0, edge: 0, opp: 2 }, // N
  { dr: 0, dc: 1, edge: 1, opp: 3 }, // E
  { dr: 1, dc: 0, edge: 2, opp: 0 }, // S
  { dr: 0, dc: -1, edge: 3, opp: 1 }, // W
]

export interface ConnectivityResult {
  valid: boolean
  /** total rule violations, used as a penalty to guide the solver */
  violations: number
  /** connector mismatches between two adjacent placed charts */
  mismatches: number
  /** empty squares (a real voyage always uses all 9) */
  unfilled: number
}

/**
 * Check the connector rules for placed tiles.
 *
 * Confirmed in-game rule (Zac, from the live board): where two placed charts
 * share an edge, either BOTH have a connector there or NEITHER does - a
 * connector meeting a blank neighbour edge is broken (shown red in game).
 * Connectors pointing off the outer board edge are fine. A voyage always fills
 * all 9 squares. The board can branch (T/Cross charts); it need not be a single
 * chain, so there is no reachability requirement.
 *
 * - 'any': connectors ignored entirely (experiment mode).
 * - anything else: the confirmed rule (no mismatches + all 9 filled).
 */
export function checkConnectivity(
  board: Board,
  charts: Map<string, ChartData>,
  mode: ConnectivityMode,
): ConnectivityResult {
  const placedIdx = board.map((p, i) => (p ? i : -1)).filter((i) => i >= 0)
  const unfilled = 9 - placedIdx.length

  if (mode === 'any') return { valid: true, violations: 0, mismatches: 0, unfilled }

  const edgesAt = (i: number): Edges | null => {
    const p = board[i]
    if (!p) return null
    const c = charts.get(p.chartUid)
    if (!c) return null
    return rotateEdges(c.edges, p.rotation)
  }

  // a mismatch is an internal edge where exactly one side has a connector;
  // edges facing an empty square or the board rim don't count (only unfilled does)
  let mismatches = 0
  for (const i of placedIdx) {
    const e = edgesAt(i)
    if (!e) continue
    const r = Math.floor(i / 3)
    const c = i % 3
    for (const d of DIRS) {
      const nr = r + d.dr
      const nc = c + d.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue // off-board rim: fine
      const ne = edgesAt(nr * 3 + nc)
      if (!ne) continue // neighbour empty: penalised via unfilled, not here
      if (e[d.edge] !== ne[d.opp]) mismatches++
    }
  }
  mismatches /= 2 // each mismatched pair is seen from both tiles

  const violations = mismatches + unfilled
  return { valid: violations === 0, violations, mismatches, unfilled }
}
