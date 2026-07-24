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
  // border meta-mods: % increased magnitude of the touched chart's own mods
  const tileMagnitude: number[] = Array(9).fill(0)
  borders.forEach((id, seg) => {
    if (!id) return
    const mod = borderModById.get(id)
    if (mod?.magnitude) tileMagnitude[borderTouches(seg)] += mod.magnitude
  })

  // collect effects per tile
  const tileEffects: ModEffect[][] = Array.from({ length: 9 }, () => [])
  const globalEffects: ModEffect[] = []

  board.forEach((p, i) => {
    if (!p) return
    const chart = charts.get(p.chartUid)
    if (!chart) return
    const mag = 1 + tileMagnitude[i] / 100
    for (const modId of chart.modIds) {
      const mod = voyageModById.get(modId)
      if (!mod) continue
      // magnitude scales the chart's own mods (approximation of the in-game meta-mod)
      const effects =
        mag !== 1 ? mod.effects.map((e) => ({ ...e, percent: e.percent * mag })) : mod.effects
      if (mod.scope === 'self') tileEffects[i].push(...effects)
      else if (mod.scope === 'global') globalEffects.push(...effects)
      else for (const n of NEIGHBOURS[i]) if (board[n]) tileEffects[n].push(...effects)
    }
  })

  borders.forEach((id, seg) => {
    if (!id) return
    const mod = borderModById.get(id)
    if (!mod) return
    const tile = borderTouches(seg)
    if (board[tile]) tileEffects[tile].push(...mod.effects)
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
