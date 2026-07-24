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
  /** number of rule violations, used as a penalty to guide the solver */
  violations: number
}

/**
 * Check the connector rules for placed tiles.
 * - 'any': edges ignored entirely.
 * - 'connected': all placed tiles must form one component via matched connectors.
 * - 'strict': 'connected' + no connector may face a placed neighbour that lacks
 *   the matching connector (dangling connectors toward the board edge are fine).
 * The real in-game rule is unconfirmed; default is 'connected'.
 */
export function checkConnectivity(
  board: Board,
  charts: Map<string, ChartData>,
  mode: ConnectivityMode,
): ConnectivityResult {
  if (mode === 'any') return { valid: true, violations: 0 }

  const placedIdx = board.map((p, i) => (p ? i : -1)).filter((i) => i >= 0)
  if (placedIdx.length <= 1) return { valid: true, violations: 0 }

  const edgesAt = (i: number): Edges | null => {
    const p = board[i]
    if (!p) return null
    const c = charts.get(p.chartUid)
    if (!c) return null
    return rotateEdges(c.edges, p.rotation)
  }

  let mismatches = 0
  const adj: number[][] = Array.from({ length: 9 }, () => [])
  for (const i of placedIdx) {
    const e = edgesAt(i)
    if (!e) continue
    const r = Math.floor(i / 3)
    const c = i % 3
    for (const d of DIRS) {
      const nr = r + d.dr
      const nc = c + d.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue
      const j = nr * 3 + nc
      const ne = edgesAt(j)
      if (!ne) continue
      if (e[d.edge] && ne[d.opp]) {
        adj[i].push(j)
      } else if (e[d.edge] !== ne[d.opp]) {
        mismatches++ // one side has a connector, the other doesn't
      }
    }
  }
  mismatches /= 2 // each mismatched pair is seen from both tiles

  // flood fill over matched connections
  const seen = new Set<number>()
  const stack = [placedIdx[0]]
  while (stack.length) {
    const i = stack.pop()!
    if (seen.has(i)) continue
    seen.add(i)
    for (const j of adj[i]) if (!seen.has(j)) stack.push(j)
  }
  const disconnected = placedIdx.length - seen.size

  let violations = disconnected
  if (mode === 'strict') violations += mismatches
  return { valid: violations === 0, violations }
}
