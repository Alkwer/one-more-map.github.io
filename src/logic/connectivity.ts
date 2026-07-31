import type { Board, ChartData, ConnectivityMode, Edges } from '../types'
import { START_CELL } from '../types'

/** Rotate edges r × 90° clockwise. */
export function rotateEdges(edges: Edges, r: number): Edges {
  const out = [false, false, false, false] as Edges
  for (let i = 0; i < 4; i++) out[i] = edges[(i - r + 4) % 4]
  return out
}

export interface ConnectivityResult {
  /** whether the selected solver rule accepts this layout */
  valid: boolean
  /** whether the game allows the Voyage to start */
  launchable: boolean
  /** whether every chart is reachable from the bottom-left start */
  fullyReachable: boolean
  /** total rule violations, used as a penalty to guide the solver */
  violations: number
  /** connector mismatches between two adjacent placed charts */
  mismatches: number
  /** empty squares (a real voyage always uses all 9) */
  unfilled: number
  /** placed charts that can't be reached from the start via matched connectors */
  unreachable: number
  /** number of matched connections (shared edges where both charts connect) */
  connections: number
}

/**
 * Connector data shared by the validity check and the scoring hot path.
 * Keeping it together avoids rotating and walking the same board twice for
 * every hill-climb candidate.
 */
export interface ConnectivityAnalysis {
  result: ConnectivityResult
  connectionCounts: number[]
  connectedNeighbours: number[][]
}

/**
 * Check the connector rules for placed tiles.
 *
 * The game distinguishes two useful states:
 *  - every internal edge matches: where two placed charts share an edge, both
 *    have a connector or neither does (a connector meeting a blank neighbour is
 *    the broken red line in game). Connectors off the outer rim are fine.
 *  - all 9 squares are filled.
 *    Together these conditions make a layout launchable.
 *  - every chart is reachable from the start (bottom-left ⚓) through matched
 *    connectors. The game allows a Voyage without this, but unreachable areas
 *    cannot be entered, so the strict solver still requires full reachability.
 *
 * 'any' mode ignores connectors entirely (experiment mode).
 */
export function analyzeConnectivity(
  board: Board,
  charts: Map<string, ChartData>,
  mode: ConnectivityMode,
): ConnectivityAnalysis {
  const placedIdx: number[] = []
  const effectiveEdges: (Edges | null)[] = Array(9).fill(null)
  for (let index = 0; index < 9; index++) {
    const placement = board[index]
    if (!placement) continue
    placedIdx.push(index)
    const chart = charts.get(placement.chartUid)
    if (!chart) continue
    effectiveEdges[index] = rotateEdges(chart.edges, placement.rotation)
  }
  const unfilled = 9 - placedIdx.length

  // build the matched-connection graph and count mismatches
  let mismatches = 0
  let connections = 0
  const adj: number[][] = Array.from({ length: 9 }, () => [])
  const connectionCounts: number[] = Array(9).fill(0)
  for (const i of placedIdx) {
    const edges = effectiveEdges[i]
    if (!edges) continue
    const r = Math.floor(i / 3)
    const c = i % 3

    // Each internal pair is visited once: east, then south. Connectors on the
    // outer rim remain legal, and empty neighbours are covered by `unfilled`.
    const compare = (j: number, edge: number, opposite: number) => {
      const neighbourEdges = effectiveEdges[j]
      if (!neighbourEdges) return
      if (edges[edge] && neighbourEdges[opposite]) {
        adj[i].push(j)
        adj[j].push(i)
        connectionCounts[i]++
        connectionCounts[j]++
        connections++
      } else if (edges[edge] !== neighbourEdges[opposite]) {
        mismatches++
      }
    }

    if (c < 2) compare(i + 1, 1, 3)
    if (r < 2) compare(i + 3, 2, 0)
  }

  // reachability: flood-fill from the start square over matched connections
  let unreachable = placedIdx.length
  if (placedIdx.length > 0) {
    const seen: boolean[] = Array(9).fill(false)
    const stack = board[START_CELL] ? [START_CELL] : []
    let reached = 0
    while (stack.length) {
      const i = stack.pop()!
      if (seen[i]) continue
      seen[i] = true
      reached++
      for (const j of adj[i]) if (!seen[j]) stack.push(j)
    }
    unreachable = placedIdx.length - reached
  }

  const launchable = mismatches === 0 && unfilled === 0
  const fullyReachable = launchable && unreachable === 0
  const violations = mode === 'any' ? 0 : mismatches + unfilled + unreachable
  const valid = mode === 'any' || fullyReachable
  return {
    result: {
      valid,
      launchable,
      fullyReachable,
      violations,
      mismatches,
      unfilled,
      unreachable,
      connections,
    },
    connectionCounts,
    connectedNeighbours: adj,
  }
}

export function checkConnectivity(
  board: Board,
  charts: Map<string, ChartData>,
  mode: ConnectivityMode,
): ConnectivityResult {
  return analyzeConnectivity(board, charts, mode).result
}
