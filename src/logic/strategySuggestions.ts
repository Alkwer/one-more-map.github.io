import { borderModById } from '../data/mods'
import { STRATEGIES, type StrategyDef } from '../data/strategies'
import type { Board, Borders, ChartData, Weights } from '../types'
import { borderTouches, emptyBorders } from '../types'
import { borderRewardKey } from './rewards'
import { scoreBoard, type ScoreOptions } from './scoring'

const EPSILON = 1e-9

export type SuggestionConfidence = 'low' | 'medium' | 'high'

export interface StrategyReadiness {
  ready: boolean
  have: number
  need: number
  ratio: number
  missing: string[]
}

export interface StrategySuggestion {
  strategy: StrategyDef
  rankScore: number
  confidence: SuggestionConfidence
  jackpot: boolean
  borderScore: number
  matchingBorders: number
  harmfulBorders: number
  enteredBorders: number
  readiness: StrategyReadiness
  reasons: string[]
}

export interface StrategySuggestionResult {
  suggestions: StrategySuggestion[]
  enteredBorders: number
  placedCharts: number
  hasEvidence: boolean
}

function countMatchingCharts(
  requirement: NonNullable<StrategyDef['requirements']>[number],
  pool: ChartData[],
): number {
  return pool.filter(
    (chart) =>
      (requirement.modIds &&
        chart.modIds.some((id) => requirement.modIds!.includes(id))) ||
      (requirement.nameMatch &&
        chart.name.toLowerCase().includes(requirement.nameMatch.toLowerCase())),
  ).length
}

function strategyReadiness(
  strategy: StrategyDef,
  pool: ChartData[],
  borders: Borders,
): StrategyReadiness {
  let have = 0
  let need = 0
  const missing: string[] = []

  for (const requirement of strategy.requirements ?? []) {
    const count = countMatchingCharts(requirement, pool)
    have += Math.min(count, requirement.count)
    need += requirement.count
    if (count < requirement.count) {
      missing.push(`${requirement.count - count}× ${requirement.label}`)
    }
  }

  if (strategy.requiresBorderId) {
    need += 1
    if (borders.includes(strategy.requiresBorderId.id)) have += 1
    else missing.push(strategy.requiresBorderId.label)
  }

  return {
    ready: missing.length === 0,
    have,
    need,
    ratio: need === 0 ? 1 : have / need,
    missing,
  }
}

function directBorderContribution(modId: string, weights: Weights): number {
  const mod = borderModById.get(modId)
  if (!mod) return 0
  const weight = weights[borderRewardKey(mod)] ?? 0
  return mod.effects.reduce((sum, effect) => sum + (effect.percent / 100) * weight, 0)
}

function borderContributions(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions,
): { segment: number; modId: string; contribution: number }[] {
  const noBorders = emptyBorders()
  const base = scoreBoard(board, noBorders, charts, weights, opts).total

  return borders.flatMap((modId, segment) => {
    if (!modId || opts.disabledMods?.has(modId)) return []

    // Once a chart is placed, use the full contextual score so magnitude and
    // per-connection modifiers are judged correctly. Before placement, direct
    // effects still provide an early strategy signal from the roll itself.
    let contribution = directBorderContribution(modId, weights)
    if (board[borderTouches(segment)]) {
      const isolated = emptyBorders()
      isolated[segment] = modId
      contribution = scoreBoard(board, isolated, charts, weights, opts).total - base
    }

    return [{ segment, modId, contribution }]
  })
}

function uniqueTopBorderLabels(
  contributions: { modId: string; contribution: number }[],
): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const entry of [...contributions].sort((a, b) => b.contribution - a.contribution)) {
    if (entry.contribution <= EPSILON) break
    const mod = borderModById.get(entry.modId)
    const label = mod?.short ?? mod?.text
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
    if (labels.length === 2) break
  }
  return labels
}

function confidenceFor(
  jackpot: boolean,
  matchingBorders: number,
  readiness: StrategyReadiness,
): SuggestionConfidence {
  if (jackpot) return 'high'
  if (matchingBorders >= 3 || (matchingBorders >= 1 && readiness.ready)) return 'medium'
  return 'low'
}

/**
 * Rank curated strategies against the currently entered border roll, placed
 * chart layout, and declared library requirements.
 *
 * This is a deterministic compatibility ranking, not a reroll EV calculation:
 * no border-roll probabilities are known yet.
 */
export function suggestStrategies(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  pool: ChartData[],
  opts: ScoreOptions,
  limit = 3,
): StrategySuggestionResult {
  const enteredBorders = borders.filter(Boolean).length
  const placedCharts = board.filter(Boolean).length
  const hasNoEquipment = pool.some((chart) => chart.modIds.includes('voy-noequip'))
  const hasDivineBorder = borders.includes('b-divine')

  const suggestions = STRATEGIES.map((strategy) => {
    const readiness = strategyReadiness(strategy, pool, borders)
    const contributions = borderContributions(
      board,
      borders,
      charts,
      strategy.weights,
      opts,
    )
    const borderScore = contributions.reduce((sum, entry) => sum + entry.contribution, 0)
    const matchingBorders = contributions.filter(
      (entry) => entry.contribution > EPSILON,
    ).length
    const harmfulBorders = contributions.filter(
      (entry) => entry.contribution < -EPSILON,
    ).length
    const weightScale = Math.max(
      1,
      Object.values(strategy.weights).reduce((sum, weight) => sum + Math.max(0, weight), 0),
    )
    const boardScore = scoreBoard(
      board,
      emptyBorders(),
      charts,
      strategy.weights,
      opts,
    ).total
    const coverage = enteredBorders > 0 ? matchingBorders / enteredBorders : 0
    const rollAffinity = Math.max(0, borderScore) / weightScale
    const boardAffinity = Math.max(0, boardScore) / weightScale
    const divineJackpot = hasDivineBorder && strategy.id === 'divine-border-rares'
    const equipmentJackpot = hasNoEquipment && strategy.id === 'milky-meatfish'
    const jackpot = divineJackpot || equipmentJackpot
    const jackpotBoost = divineJackpot ? 2_000 : equipmentJackpot ? 1_000 : 0
    const evidence =
      rollAffinity * 30 +
      coverage * 12 +
      boardAffinity * 2 -
      harmfulBorders * 0.5
    const rankScore =
      jackpotBoost +
      evidence * (0.65 + readiness.ratio * 0.35) +
      (readiness.ready ? 1 : 0)

    const reasons: string[] = []
    if (divineJackpot) {
      reasons.push(
        'Divine-drop border detected — this build is designed to feed rare monsters into it.',
      )
    }
    if (equipmentJackpot) {
      reasons.push(
        'Your library contains a “Monsters cannot drop Equipment” chart, the key Meatfish multiplier.',
      )
    }

    const borderLabels = uniqueTopBorderLabels(contributions)
    if (borderLabels.length > 0) {
      reasons.push(
        `${matchingBorders}/${enteredBorders} entered borders support it, led by ${borderLabels.join(' and ')}.`,
      )
    } else if (enteredBorders > 0) {
      reasons.push('The current border roll has little direct support for this strategy.')
    }

    if (readiness.need === 0) {
      reasons.push('No special chart pieces are required.')
    } else if (readiness.ready) {
      reasons.push(`All ${readiness.need} declared chart/border requirements are available.`)
    } else {
      reasons.push(
        `Library readiness: ${readiness.have}/${readiness.need}; still missing ${readiness.missing
          .slice(0, 2)
          .join(', ')}${readiness.missing.length > 2 ? ', …' : ''}.`,
      )
    }

    return {
      strategy,
      rankScore,
      confidence: confidenceFor(jackpot, matchingBorders, readiness),
      jackpot,
      borderScore,
      matchingBorders,
      harmfulBorders,
      enteredBorders,
      readiness,
      reasons,
    }
  })

  suggestions.sort((a, b) => b.rankScore - a.rankScore)

  return {
    suggestions: suggestions.slice(0, Math.max(0, limit)),
    enteredBorders,
    placedCharts,
    hasEvidence: enteredBorders > 0 || placedCharts > 0 || hasNoEquipment,
  }
}
