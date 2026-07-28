import type { Board, Borders, ChartData, ConnectivityMode, Placement, Weights } from '../types'
import type { PositionRule } from '../data/strategies'
import { checkConnectivity } from './connectivity'
import { scoreBoard, type ScoreOptions } from './scoring'

export interface SolverOptions extends ScoreOptions {
  mode: ConnectivityMode
  allowRotation: boolean
  /** how many top results to return */
  topK: number
  /** build the LOWEST-value runnable board (for a throwaway "filler" voyage) */
  minimizeReward?: boolean
  /** active strategy position rules - bonuses that shape where charts land */
  strategyRules?: PositionRule[]
}

/** objective bonus from strategy position rules for this arrangement */
function strategyBonus(board: Board, charts: Map<string, ChartData>, rules: PositionRule[]): number {
  let bonus = 0
  for (const rule of rules) {
    for (const cell of rule.cells) {
      const p = board[cell]
      if (!p) continue
      const chart = charts.get(p.chartUid)
      if (!chart) continue
      if (rule.modIds && chart.modIds.some((id) => rule.modIds!.includes(id))) bonus += rule.bonus
      if (rule.rewardStat) {
        const r = chart.rewards?.find((e) => e.stat === rule.rewardStat!.stat)
        if (r) bonus += (r.percent / 100) * rule.rewardStat.per
      }
    }
  }
  return bonus
}

export interface SolverResult {
  board: Board
  /** internal ranking objective (reward ± connection bonus − penalties) */
  score: number
  /** the actual reward value of the board, for display */
  reward: number
  valid: boolean
}

const VIOLATION_PENALTY = 10_000
// small nudge so that among equally-rewarding runnable boards the solver prefers
// ones with more matched connections (a better-threaded voyage; some mods scale
// per connection). Kept low so it never outweighs real reward differences.
const CONNECTION_BONUS = 0.15

function evaluate(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: SolverOptions,
): { score: number; valid: boolean; reward: number } {
  const conn = checkConnectivity(board, charts, opts.mode)
  const s = scoreBoard(board, borders, charts, weights, opts)
  // filler mode wants the least valuable runnable board, so flip the reward term
  // while keeping the runnable requirements (connections good, violations bad)
  const rewardTerm = opts.minimizeReward ? -s.total : s.total
  const strat = opts.strategyRules ? strategyBonus(board, charts, opts.strategyRules) : 0
  const objective =
    rewardTerm + strat + conn.connections * CONNECTION_BONUS - conn.violations * VIOLATION_PENALTY
  return { score: objective, valid: conn.valid, reward: s.total }
}

function boardKey(board: Board): string {
  return board.map((p) => (p ? `${p.chartUid}:${p.rotation}` : '_')).join('|')
}

/**
 * Find high-scoring arrangements. Exact permutation search when the pool is
 * exactly 9 charts with rotation off; otherwise hill-climbing with random
 * restarts (fast and near-optimal at this tiny problem size).
 */
export function solve(
  pool: ChartData[],
  borders: Borders,
  weights: Weights,
  opts: SolverOptions,
): SolverResult[] {
  const charts = new Map(pool.map((c) => [c.uid, c]))
  if (pool.length === 0) return []

  const CAP = Math.max(opts.topK * 4, 20)
  let top: SolverResult[] = []
  const seen = new Set<string>()
  const record = (board: Board) => {
    const { score, valid, reward } = evaluate(board, borders, charts, weights, opts)
    if (top.length >= CAP && score <= top[top.length - 1].score) return
    const key = boardKey(board)
    if (seen.has(key)) return
    seen.add(key)
    top.push({ board: board.map((p) => (p ? { ...p } : null)), score, reward, valid })
    top.sort((a, b) => b.score - a.score)
    if (top.length > CAP) top = top.slice(0, CAP)
  }

  if (pool.length <= 9 && !opts.allowRotation) {
    exactSearch(pool, record)
  } else {
    hillClimb(pool, borders, charts, weights, opts, record)
  }

  return top.slice(0, opts.topK)
}

/** All placements of the pool over the 9 cells (pool ≤ 9, no rotation). */
function exactSearch(pool: ChartData[], record: (b: Board) => void) {
  const n = pool.length
  const board: Board = Array(9).fill(null)
  const used = Array(n).fill(false)

  // walk cells in order; each cell is either left empty or given an unused chart
  const place = (cell: number, placed: number) => {
    if (9 - cell < n - placed) return // not enough cells left for remaining charts
    if (cell === 9) {
      if (placed === n) record(board)
      return
    }
    place(cell + 1, placed) // leave empty
    for (let k = 0; k < n; k++) {
      if (used[k]) continue
      used[k] = true
      board[cell] = { chartUid: pool[k].uid, rotation: 0 }
      place(cell + 1, placed + 1)
      board[cell] = null
      used[k] = false
    }
  }
  place(0, 0)
}

function hillClimb(
  pool: ChartData[],
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: SolverOptions,
  record: (b: Board) => void,
) {
  const RESTARTS = 40
  const ITERS = 4000
  const rotMax = opts.allowRotation ? 4 : 1

  const evalScore = (b: Board) => evaluate(b, borders, charts, weights, opts).score

  for (let r = 0; r < RESTARTS; r++) {
    // random initial: shuffle pool, take up to 9
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const board: Board = Array(9).fill(null)

    // strategy-seeded restarts (every other one): pre-place a rule-matching
    // chart on its target cell so rare shapes (e.g. a single End-shaped box
    // chart that belongs in the centre) aren't left to random luck
    if (opts.strategyRules && r % 2 === 0) {
      for (const rule of opts.strategyRules) {
        if (!rule.modIds || rule.bonus <= 0) continue
        for (const cell of rule.cells) {
          if (board[cell]) continue
          const idx = shuffled.findIndex(
            (c) => !board.some((p) => p?.chartUid === c.uid) && c.modIds.some((id) => rule.modIds!.includes(id)),
          )
          if (idx < 0) break
          board[cell] = { chartUid: shuffled[idx].uid, rotation: Math.floor(Math.random() * rotMax) }
        }
      }
    }

    const remaining = shuffled.filter((c) => !board.some((p) => p?.chartUid === c.uid))
    let ri = 0
    for (let i = 0; i < 9 && ri < remaining.length; i++) {
      if (board[i]) continue
      board[i] = { chartUid: remaining[ri++].uid, rotation: Math.floor(Math.random() * rotMax) }
    }
    const unused = remaining.slice(ri)
    let score = evalScore(board)

    for (let it = 0; it < ITERS; it++) {
      const move = Math.random()
      let undo: (() => void) | null = null

      if (move < 0.5) {
        // swap two cells
        const a = Math.floor(Math.random() * 9)
        const b = Math.floor(Math.random() * 9)
        if (a === b) continue
        const pa = board[a]
        const pb = board[b]
        board[a] = pb
        board[b] = pa
        undo = () => {
          board[a] = pa
          board[b] = pb
        }
      } else if (move < 0.75 && unused.length > 0) {
        // replace a placed chart with an unused one
        const cell = Math.floor(Math.random() * 9)
        const ui = Math.floor(Math.random() * unused.length)
        const prev = board[cell]
        const incoming = unused[ui]
        board[cell] = { chartUid: incoming.uid, rotation: Math.floor(Math.random() * rotMax) }
        if (prev) unused[ui] = charts.get(prev.chartUid)!
        else unused.splice(ui, 1)
        undo = () => {
          if (prev) unused[ui] = incoming
          else unused.splice(ui, 0, incoming)
          board[cell] = prev
        }
      } else if (opts.allowRotation) {
        // rotate a placed chart
        const cell = Math.floor(Math.random() * 9)
        const p = board[cell]
        if (!p) continue
        const prevRot = p.rotation
        p.rotation = (p.rotation + 1 + Math.floor(Math.random() * 3)) % 4
        undo = () => {
          p.rotation = prevRot
        }
      } else {
        continue
      }

      const newScore = evalScore(board)
      if (newScore >= score) {
        score = newScore
      } else {
        undo?.()
      }
    }
    record(board)
  }
}
