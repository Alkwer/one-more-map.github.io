import { borderModById, voyageModById } from '../data/mods'
import type { Board, Borders, ChartData, ModEffect, Stat, Weights } from '../types'
import { ALL_STATS, borderTouches } from '../types'
import { rotateEdges } from './connectivity'

const NEIGHBOURS: number[][] = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3)
  const c = i % 3
  const out: number[] = []
  if (r > 0) out.push(i - 3)
  if (r < 2) out.push(i + 3)
  if (c > 0) out.push(i - 1)
  if (c < 2) out.push(i + 1)
  return out
})

export interface ScoreBreakdown {
  total: number
  perTile: number[]
  /** per-stat aggregate multiplier bonus across the board, for the score panel */
  perStat: Record<Stat, number>
}

/**
 * Heuristic value model: for each tile and stat, multiply (1 + pct/100) over
 * every effect reaching that tile (own self-mods, neighbours' adjacent-mods,
 * all global mods, border segments touching it). Tile score is the weighted
 * sum of (multiplier − 1); board score is the sum over tiles.
 * Deliberately simple - tune once real numbers are known.
 */
export type AdjacencyMode = 'physical' | 'connected'

export interface ScoreOptions {
  /** 'physical' = any grid neighbour; 'connected' = only neighbours linked by matching connectors */
  adjacencyMode: AdjacencyMode
  /** whether a chart's Adjacent modifier also applies to its own area */
  adjacentAffectsSelf: boolean
  /** mod ids the user switched off; excluded from scoring entirely */
  disabledMods?: Set<string>
}

const DEFAULT_SCORE_OPTS: ScoreOptions = { adjacencyMode: 'physical', adjacentAffectsSelf: false }

export function scoreBoard(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions = DEFAULT_SCORE_OPTS,
): ScoreBreakdown {
  // border meta-mods: % increased magnitude of the touched chart's own mods
  const tileMagnitude: number[] = Array(9).fill(0)
  borders.forEach((id, seg) => {
    if (!id || opts.disabledMods?.has(id)) return
    const mod = borderModById.get(id)
    if (mod?.magnitude) tileMagnitude[borderTouches(seg)] += mod.magnitude
  })

  // matched-connection count per tile (for mods that scale with connections)
  const edgesAt = (i: number): [boolean, boolean, boolean, boolean] | null => {
    const p = board[i]
    if (!p) return null
    const c = charts.get(p.chartUid)
    return c ? rotateEdges(c.edges, p.rotation) : null
  }
  const connCount: number[] = Array(9).fill(0)
  const connectedNeighbours: number[][] = Array.from({ length: 9 }, () => [])
  board.forEach((_, i) => {
    const e = edgesAt(i)
    if (!e) return
    const r = Math.floor(i / 3)
    const col = i % 3
    const dirs = [
      { dr: -1, dc: 0, edge: 0, opp: 2 },
      { dr: 0, dc: 1, edge: 1, opp: 3 },
      { dr: 1, dc: 0, edge: 2, opp: 0 },
      { dr: 0, dc: -1, edge: 3, opp: 1 },
    ]
    for (const d of dirs) {
      const nr = r + d.dr
      const nc = col + d.dc
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue
      const j = nr * 3 + nc
      const ne = edgesAt(j)
      if (e[d.edge] && ne?.[d.opp]) {
        connCount[i]++
        connectedNeighbours[i].push(j)
      }
    }
  })

  // which neighbours does an Adjacent mod on tile i reach?
  const adjacentTargets = (i: number): number[] => {
    const base =
      opts.adjacencyMode === 'connected' ? connectedNeighbours[i] : NEIGHBOURS[i].filter((n) => board[n])
    return opts.adjacentAffectsSelf ? [...base, i] : base
  }

  // collect effects per tile
  const tileEffects: ModEffect[][] = Array.from({ length: 9 }, () => [])
  const globalEffects: ModEffect[] = []

  board.forEach((p, i) => {
    if (!p) return
    const chart = charts.get(p.chartUid)
    if (!chart) return
    const mag = 1 + tileMagnitude[i] / 100
    for (const modId of chart.modIds) {
      if (opts.disabledMods?.has(modId)) continue
      const mod = voyageModById.get(modId)
      if (!mod) continue
      // magnitude + connection scaling apply to the chart's own mods
      let scale = mag
      if (mod.scaling === 'connections') scale *= connCount[i]
      else if (mod.scaling === 'inverse-connections') scale *= 4 - connCount[i]
      const effects =
        scale !== 1 ? mod.effects.map((e) => ({ ...e, percent: e.percent * scale })) : mod.effects
      if (mod.scope === 'self') tileEffects[i].push(...effects)
      else if (mod.scope === 'global') globalEffects.push(...effects)
      else for (const n of adjacentTargets(i)) tileEffects[n].push(...effects)
    }
  })

  borders.forEach((id, seg) => {
    if (!id || opts.disabledMods?.has(id)) return
    const mod = borderModById.get(id)
    if (!mod) return
    const tile = borderTouches(seg)
    if (!board[tile]) return
    tileEffects[tile].push(...mod.effects)
    // per-connection border effects (e.g. "+50% rares per Chart connection")
    if (mod.perConnEffects && connCount[tile] > 0) {
      tileEffects[tile].push(
        ...mod.perConnEffects.map((e) => ({ ...e, percent: e.percent * connCount[tile] })),
      )
    }
  })

  // Additive stacking within an area (PoE "increased" convention). The game's
  // exact stacking rules are undocumented; this stays deliberately conservative.
  const perStat = Object.fromEntries(ALL_STATS.map((s) => [s, 0])) as Record<Stat, number>
  const perTile: number[] = Array(9).fill(0)
  let total = 0
  let placedCount = 0

  board.forEach((p, i) => {
    if (!p) return
    placedCount++
    let tileScore = 0
    for (const stat of ALL_STATS) {
      let pct = 0
      for (const e of tileEffects[i]) if (e.stat === stat) pct += e.percent
      for (const e of globalEffects) if (e.stat === stat) pct += e.percent
      if (pct !== 0) {
        const bonus = pct / 100
        perStat[stat] += bonus
        tileScore += (weights[stat] ?? 0) * bonus
      }
    }
    perTile[i] = tileScore
    total += tileScore
  })

  // report per-stat bonuses as the average per placed area, not a 9x sum
  if (placedCount > 0) for (const s of ALL_STATS) perStat[s] /= placedCount

  return { total, perTile, perStat }
}
