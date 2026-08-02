import { borderModById, voyageModById } from '../data/mods'
import type { Board, Borders, ChartData, ModEffect, Scope, Stat, Weights } from '../types'
import { ALL_STATS, borderTouches } from '../types'
import { analyzeConnectivity, type ConnectivityAnalysis } from './connectivity'
import { borderRewardKey, chartRewardKey, voyageRewardKey } from './rewards'

/** an effect tagged with the reward-type key it should be weighted under */
type Tagged = ModEffect & { reward: string }

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
  /** average additive bonus by stat per placed area; 1 represents +100% */
  perStat: Record<Stat, number>
}

/**
 * Heuristic value model: collect every effect reaching each placed tile (own
 * self-mods, neighbours' adjacent-mods, Voyage-wide mods, and touching border
 * segments). After applicable magnitude and connection scaling, contributions
 * are summed additively within each reward type and multiplied by the user's
 * weight. The board score is the sum of those weighted tile scores; perStat is
 * the unweighted average additive bonus by stat across placed areas.
 *
 * This is an application heuristic following the PoE "increased" convention;
 * the actual in-game stacking rules remain unconfirmed.
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

type ScoreConnectivity = Pick<ConnectivityAnalysis, 'connectionCounts' | 'connectedNeighbours'>

interface CompiledChartEffect {
  scope: Scope
  value: number
  scaling?: 'connections' | 'inverse-connections'
}

interface CompiledChartScore {
  effects: CompiledChartEffect[]
  importedValue: number
}

/**
 * Compile all score inputs that do not change while a solver search is
 * running. The returned evaluator calculates only the scalar objective used by
 * hill climbing; UI breakdowns are still produced by scoreBoard for the small
 * set of recorded results.
 */
export function prepareScoreTotal(
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions = DEFAULT_SCORE_OPTS,
): (board: Board, connectivity: ScoreConnectivity) => number {
  const disabledMods = opts.disabledMods ?? new Set<string>()
  const weightedValue = (effects: ModEffect[], reward: string): number => {
    const weight = weights[reward] ?? 0
    if (weight === 0) return 0
    let value = 0
    for (const effect of effects) value += (effect.percent / 100) * weight
    return value
  }

  const tileMagnitude: number[] = Array(9).fill(0)
  const borderValue: number[] = Array(9).fill(0)
  const borderPerConnectionValue: number[] = Array(9).fill(0)
  borders.forEach((id, segment) => {
    if (!id || disabledMods.has(id)) return
    const mod = borderModById.get(id)
    if (!mod) return
    const tile = borderTouches(segment)
    if (mod.magnitude) tileMagnitude[tile] += mod.magnitude
    const reward = borderRewardKey(mod)
    borderValue[tile] += weightedValue(mod.effects, reward)
    if (mod.perConnEffects) {
      borderPerConnectionValue[tile] += weightedValue(mod.perConnEffects, reward)
    }
  })

  const compiledCharts = new Map<string, CompiledChartScore>()
  for (const chart of charts.values()) {
    const hasImportedRewards = !!chart.rewards?.length
    const effects: CompiledChartEffect[] = []
    for (const modId of chart.modIds) {
      if (disabledMods.has(modId)) continue
      const mod = voyageModById.get(modId)
      if (!mod || (mod.scope === 'self' && hasImportedRewards)) continue
      const value = weightedValue(mod.effects, voyageRewardKey(mod))
      if (value !== 0) {
        effects.push({ scope: mod.scope, value, scaling: mod.scaling })
      }
    }

    let importedValue = 0
    for (const effect of chart.rewards ?? []) {
      importedValue += (effect.percent / 100) * (weights[chartRewardKey(effect.stat)] ?? 0)
    }
    compiledCharts.set(chart.uid, { effects, importedValue })
  }

  return (board, connectivity) => {
    const tileScores: number[] = Array(9).fill(0)
    let globalScore = 0
    let placedCount = 0

    for (let index = 0; index < 9; index++) {
      const placement = board[index]
      if (!placement) continue
      placedCount++
      const chart = compiledCharts.get(placement.chartUid)
      if (!chart) continue
      const connectionCount = connectivity.connectionCounts[index]
      const magnitude = 1 + tileMagnitude[index] / 100

      for (const effect of chart.effects) {
        let scale = effect.scope === 'self' ? magnitude : 1
        if (effect.scaling === 'connections') scale *= connectionCount
        else if (effect.scaling === 'inverse-connections') scale *= 4 - connectionCount
        const value = effect.value * scale

        if (effect.scope === 'self') {
          tileScores[index] += value
        } else if (effect.scope === 'global') {
          globalScore += value
        } else {
          const neighbours =
            opts.adjacencyMode === 'connected'
              ? connectivity.connectedNeighbours[index]
              : NEIGHBOURS[index]
          for (const neighbour of neighbours) {
            if (board[neighbour]) tileScores[neighbour] += value
          }
          if (opts.adjacentAffectsSelf) tileScores[index] += value
        }
      }

      tileScores[index] += chart.importedValue * magnitude
    }

    let total = globalScore * placedCount
    for (let index = 0; index < 9; index++) {
      if (!board[index]) continue
      total +=
        tileScores[index] +
        borderValue[index] +
        borderPerConnectionValue[index] * connectivity.connectionCounts[index]
    }
    return total
  }
}

export function scoreBoard(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions = DEFAULT_SCORE_OPTS,
  connectivity?: ScoreConnectivity,
): ScoreBreakdown {
  // border meta-mods: % increased magnitude of the touched chart's own mods
  const tileMagnitude: number[] = Array(9).fill(0)
  borders.forEach((id, seg) => {
    if (!id || opts.disabledMods?.has(id)) return
    const mod = borderModById.get(id)
    if (mod?.magnitude) tileMagnitude[borderTouches(seg)] += mod.magnitude
  })

  // Reuse connector analysis from the solver when available. Standalone
  // scoring calls still compute the same data once through the shared helper.
  const connectorState = connectivity ?? analyzeConnectivity(board, charts, 'any')
  const connCount = connectorState.connectionCounts
  const connectedNeighbours = connectorState.connectedNeighbours

  // which neighbours does an Adjacent mod on tile i reach?
  const adjacentTargets = (i: number): number[] => {
    const base =
      opts.adjacencyMode === 'connected'
        ? connectedNeighbours[i]
        : NEIGHBOURS[i].filter((n) => board[n])
    return opts.adjacentAffectsSelf ? [...base, i] : base
  }

  // collect effects per tile, each tagged with its reward-type key
  const tileEffects: Tagged[][] = Array.from({ length: 9 }, () => [])
  const globalEffects: Tagged[] = []

  board.forEach((p, i) => {
    if (!p) return
    const chart = charts.get(p.chartUid)
    if (!chart) return
    const mag = 1 + tileMagnitude[i] / 100
    const hasImportedRewards = !!chart.rewards?.length
    for (const modId of chart.modIds) {
      if (opts.disabledMods?.has(modId)) continue
      const mod = voyageModById.get(modId)
      if (!mod) continue
      // Imported header rewards are the authoritative aggregate of a chart's
      // explicit modifiers. Self mod ids are only the manual-entry fallback.
      if (mod.scope === 'self' && hasImportedRewards) continue
      const reward = voyageRewardKey(mod)
      // Explicit magnitude applies only to self-scope chart modifiers.
      // Connection scaling remains independent because it may belong to an
      // adjacent or Voyage-wide implicit.
      let scale = mod.scope === 'self' ? mag : 1
      if (mod.scaling === 'connections') scale *= connCount[i]
      else if (mod.scaling === 'inverse-connections') scale *= 4 - connCount[i]
      const effects: Tagged[] = mod.effects.map((e) => ({
        ...e,
        percent: scale !== 1 ? e.percent * scale : e.percent,
        reward,
      }))
      if (mod.scope === 'self') tileEffects[i].push(...effects)
      else if (mod.scope === 'global') globalEffects.push(...effects)
      else for (const n of adjacentTargets(i)) tileEffects[n].push(...effects)
    }
    for (const effect of chart.rewards ?? []) {
      tileEffects[i].push({
        ...effect,
        percent: effect.percent * mag,
        reward: chartRewardKey(effect.stat),
      })
    }
  })

  borders.forEach((id, seg) => {
    if (!id || opts.disabledMods?.has(id)) return
    const mod = borderModById.get(id)
    if (!mod) return
    const tile = borderTouches(seg)
    if (!board[tile]) return
    const reward = borderRewardKey(mod)
    tileEffects[tile].push(...mod.effects.map((e) => ({ ...e, reward })))
    // per-connection border effects (e.g. "+50% rares per Chart connection")
    if (mod.perConnEffects && connCount[tile] > 0) {
      tileEffects[tile].push(
        ...mod.perConnEffects.map((e) => ({ ...e, percent: e.percent * connCount[tile], reward })),
      )
    }
  })

  // Additive stacking within an area (PoE "increased" convention). The score
  // total weights each reward type by the user's per-reward weight; perStat is
  // an unweighted by-stat aggregate kept for the rewards breakdown display.
  const perStat = Object.fromEntries(ALL_STATS.map((s) => [s, 0])) as Record<Stat, number>
  const perTile: number[] = Array(9).fill(0)
  let total = 0
  let placedCount = 0

  board.forEach((p, i) => {
    if (!p) return
    placedCount++
    const here = [...tileEffects[i], ...globalEffects]
    // weighted tile score: sum per reward type × that reward's weight
    const byReward = new Map<string, number>()
    for (const e of here) byReward.set(e.reward, (byReward.get(e.reward) ?? 0) + e.percent)
    let tileScore = 0
    for (const [reward, pct] of byReward) tileScore += (weights[reward] ?? 0) * (pct / 100)
    perTile[i] = tileScore
    total += tileScore
    // unweighted per-stat aggregate for the breakdown panel
    for (const stat of ALL_STATS) {
      let pct = 0
      for (const e of here) if (e.stat === stat) pct += e.percent
      if (pct !== 0) perStat[stat] += pct / 100
    }
  })

  // report per-stat bonuses as the average per placed area, not a 9x sum
  if (placedCount > 0) for (const s of ALL_STATS) perStat[s] /= placedCount

  return { total, perTile, perStat }
}
