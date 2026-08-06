import { BORDER_MODS, borderModById } from '../data/mods'
import type { Board, Borders, ChartData, Stat, Weights } from '../types'
import { ALL_STATS, borderTouches, emptyBorders } from '../types'
import { scoreBoard, type ScoreOptions } from './scoring'
import {
  forecastBorderRoll,
  type BorderContributionTable,
  type BorderRollForecast,
  type BorderRollModel,
} from './borderRollModel'

const EPSILON = 1e-9

export const BORDER_SEGMENT_LABELS = [
  'Top-left',
  'Top',
  'Top-right',
  'Right-top',
  'Right',
  'Right-bottom',
  'Bottom-left',
  'Bottom',
  'Bottom-right',
  'Left-top',
  'Left',
  'Left-bottom',
] as const

export type BorderAppraisalStatus =
  'empty' | 'incomplete' | 'unscored' | 'weak' | 'mixed' | 'strong' | 'excellent'

export type BorderSegmentIssue =
  'empty-border' | 'empty-tile' | 'disabled' | 'unknown' | 'unscored' | 'harmful' | null

export interface BorderSegmentAppraisal {
  segment: number
  position: string
  tile: number
  chartName: string | null
  modId: string | null
  modLabel: string | null
  contribution: number
  bestContribution: number
  bestModId: string | null
  bestLabel: string | null
  /** Contextual value versus the best known mod for this exact touched tile. */
  fit: number | null
  active: boolean
  issue: BorderSegmentIssue
}

export interface BorderAppraisal {
  /** Marginal weighted score versus the same chart layout with no borders. */
  score: number
  /** Theoretical slot-by-slot ceiling; not an expected roll value. */
  ceiling: number
  fit: number | null
  status: BorderAppraisalStatus
  placedCharts: number
  enteredBorders: number
  relevantSegments: number
  activeSegments: number
  attentionSegments: number
  perStat: Record<Stat, number>
  segments: BorderSegmentAppraisal[]
  /** Experimental posterior-predictive comparison with a newly rolled board. */
  rollForecast: BorderRollForecast | null
}

interface BestSlot {
  contribution: number
  modId: string | null
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function statusFor(
  placedCharts: number,
  enteredBorders: number,
  ceiling: number,
  fit: number | null,
): BorderAppraisalStatus {
  if (placedCharts === 0 || enteredBorders === 0) return 'empty'
  if (placedCharts < 9 || enteredBorders < 12) return 'incomplete'
  if (ceiling <= EPSILON || fit === null) return 'unscored'
  if (fit >= 0.75) return 'excellent'
  if (fit >= 0.5) return 'strong'
  if (fit >= 0.25) return 'mixed'
  return 'weak'
}

/**
 * Appraise the current border set without assuming a roll distribution.
 *
 * The marginal score compares the current board with the same board and no
 * border modifiers. "Fit" compares each occupied segment with the strongest
 * known modifier for that exact touched chart under the current weights. It is
 * deliberately a contextual ceiling, not a percentile or keep/reroll EV.
 */
export function appraiseBorders(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: ScoreOptions,
  rollModel: BorderRollModel | null = null,
): BorderAppraisal {
  const noBorders = emptyBorders()
  const base = scoreBoard(board, noBorders, charts, weights, opts)
  const current = scoreBoard(board, borders, charts, weights, opts)
  const disabled = opts.disabledMods ?? new Set<string>()

  const placedCharts = board.filter(Boolean).length
  const enteredBorders = borders.filter(Boolean).length
  const relevant = Array.from({ length: 12 }, (_, segment) => segment).filter(
    (segment) => !!board[borderTouches(segment)],
  )

  // Both corner segments touch the same chart, so cache the best candidate by
  // tile rather than rescoring all 64 known modifiers for all 12 slots.
  const representativeSegment = new Map<number, number>()
  for (const segment of relevant) {
    const tile = borderTouches(segment)
    if (!representativeSegment.has(tile)) representativeSegment.set(tile, segment)
  }

  const bestByTile = new Map<number, BestSlot>()
  const contributionsByTile = new Map<number, BorderContributionTable>()
  for (const [tile, segment] of representativeSegment) {
    let best: BestSlot = { contribution: 0, modId: null }
    const contributions: Record<string, number> = {}
    for (const mod of BORDER_MODS) {
      if (disabled.has(mod.id)) continue
      const candidate = emptyBorders()
      candidate[segment] = mod.id
      const contribution = scoreBoard(board, candidate, charts, weights, opts).total - base.total
      contributions[mod.id] = contribution
      if (contribution > best.contribution + EPSILON) {
        best = { contribution, modId: mod.id }
      }
    }
    bestByTile.set(tile, best)
    contributionsByTile.set(tile, contributions)
  }

  const segments: BorderSegmentAppraisal[] = Array.from({ length: 12 }, (_, segment) => {
    const tile = borderTouches(segment)
    const placement = board[tile]
    const chart = placement ? (charts.get(placement.chartUid) ?? null) : null
    const modId = borders[segment]
    const mod = modId ? (borderModById.get(modId) ?? null) : null
    const candidate = emptyBorders()
    if (modId) candidate[segment] = modId
    const contribution = modId
      ? scoreBoard(board, candidate, charts, weights, opts).total - base.total
      : 0
    const best = bestByTile.get(tile) ?? { contribution: 0, modId: null }
    const active = !!placement && !!mod && !disabled.has(mod.id)

    let issue: BorderSegmentIssue = null
    if (!placement) issue = 'empty-tile'
    else if (!modId) issue = 'empty-border'
    else if (disabled.has(modId)) issue = 'disabled'
    else if (!mod) issue = 'unknown'
    else if (contribution < -EPSILON) issue = 'harmful'
    else if (Math.abs(contribution) <= EPSILON) issue = 'unscored'

    return {
      segment,
      position: BORDER_SEGMENT_LABELS[segment],
      tile,
      chartName: chart?.name ?? null,
      modId,
      modLabel: mod ? (mod.short ?? mod.text) : null,
      contribution,
      bestContribution: best.contribution,
      bestModId: best.modId,
      bestLabel: best.modId
        ? (borderModById.get(best.modId)?.short ?? borderModById.get(best.modId)?.text ?? null)
        : null,
      fit: best.contribution > EPSILON ? clamp01(contribution / best.contribution) : null,
      active,
      issue,
    }
  })

  const ceiling = relevant.reduce(
    (sum, segment) => sum + (bestByTile.get(borderTouches(segment))?.contribution ?? 0),
    0,
  )
  const score = current.total - base.total
  const fit = ceiling > EPSILON ? clamp01(score / ceiling) : null
  const perStat = Object.fromEntries(
    ALL_STATS.map((stat) => [stat, current.perStat[stat] - base.perStat[stat]]),
  ) as Record<Stat, number>
  const activeSegments = segments.filter((segment) => segment.active).length
  const attentionSegments = segments.filter(
    (segment) => segment.modId && segment.issue !== null && segment.issue !== 'empty-tile',
  ).length
  const rollForecast = rollModel
    ? forecastBorderRoll(
        rollModel,
        Array.from({ length: 12 }, (_, segment) =>
          relevant.includes(segment) ? (contributionsByTile.get(borderTouches(segment)) ?? {}) : {},
        ),
        score,
        ceiling,
      )
    : null

  return {
    score,
    ceiling,
    fit,
    status: statusFor(placedCharts, enteredBorders, ceiling, fit),
    placedCharts,
    enteredBorders,
    relevantSegments: relevant.length,
    activeSegments,
    attentionSegments,
    perStat,
    segments,
    rollForecast,
  }
}
