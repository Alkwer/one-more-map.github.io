import { borderModById, voyageModById } from '../data/mods'
import type { Board, Borders, ChartData, ModEffect, Stat, Weights } from '../types'
import { ALL_STATS, borderTouches } from '../types'

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
 * Deliberately simple — tune once real numbers are known.
 */
export function scoreBoard(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
): ScoreBreakdown {
  // collect effects per tile
  const tileEffects: ModEffect[][] = Array.from({ length: 9 }, () => [])
  const globalEffects: ModEffect[] = []

  board.forEach((p, i) => {
    if (!p) return
    const chart = charts.get(p.chartUid)
    if (!chart) return
    for (const modId of chart.modIds) {
      const mod = voyageModById.get(modId)
      if (!mod) continue
      if (mod.scope === 'self') tileEffects[i].push(...mod.effects)
      else if (mod.scope === 'global') globalEffects.push(...mod.effects)
      else for (const n of NEIGHBOURS[i]) if (board[n]) tileEffects[n].push(...mod.effects)
    }
  })

  borders.forEach((id, seg) => {
    if (!id) return
    const mod = borderModById.get(id)
    if (!mod) return
    const tile = borderTouches(seg)
    if (board[tile]) tileEffects[tile].push(...mod.effects)
  })

  const perStat = Object.fromEntries(ALL_STATS.map((s) => [s, 0])) as Record<Stat, number>
  const perTile: number[] = Array(9).fill(0)
  let total = 0

  board.forEach((p, i) => {
    if (!p) return
    let tileScore = 0
    for (const stat of ALL_STATS) {
      let mult = 1
      for (const e of tileEffects[i]) if (e.stat === stat) mult *= 1 + e.percent / 100
      for (const e of globalEffects) if (e.stat === stat) mult *= 1 + e.percent / 100
      const bonus = mult - 1
      if (bonus !== 0) {
        perStat[stat] += bonus
        tileScore += (weights[stat] ?? 0) * bonus
      }
    }
    perTile[i] = tileScore
    total += tileScore
  })

  return { total, perTile, perStat }
}
