import type {
  Board,
  Borders,
  ChartData,
  ConnectivityMode,
  Edges,
  Placement,
  Weights,
} from '../types'
import type { PositionRule } from '../data/strategies'
import { selectSolverEligibleCharts } from './chartShapes'
import { analyzeConnectivity, rotateEdges, type ConnectivityResult } from './connectivity'
import { prepareScoreTotal, scoreBoard, type ScoreOptions } from './scoring'
import {
  assignStrategyRequirementsToCells,
  boardSatisfiesStrategyRequirements,
  chartMatchesStrategyMatcher,
  resolveStrategyPositionCells,
  type StrategyRequirement,
} from './strategyRequirements'

export interface SolverOptions extends ScoreOptions {
  mode: ConnectivityMode
  allowRotation: boolean
  /** how many top results to return */
  topK: number
  /** build the LOWEST-value runnable board (for a throwaway "filler" voyage) */
  minimizeReward?: boolean
  /** active strategy position rules - bonuses that shape where charts land */
  strategyRules?: PositionRule[]
  /** mandatory strategy pieces and their allowed cells */
  strategyRequirements?: StrategyRequirement[]
  /** exact connector layout the strategy wants (effective edges per cell) */
  strategyLayout?: Edges[]
  /** cells pinned by the user; locked charts stay exactly where they are */
  locked?: (Placement | null)[]
  /** per-cell cost of deviating from strategyLayout (default strict) */
  strategyLayoutPenalty?: number
  /** use the heuristic path even for pools that would normally be exhaustive */
  forceHeuristic?: boolean
  /** optional bounded search budget for lightweight background evaluations */
  searchRestarts?: number
  searchIterations?: number
  /** deterministic seed; omitted for the interactive solver's varied searches */
  seed?: number
}

/** heavy per-cell penalty: an exact-layout strategy treats deviation as broken */
const LAYOUT_PENALTY = 300

const edgesEqual = (a: Edges, b: Edges): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]

/** rotation making chart edges match the target, or null if its shape can't */
function rotationFor(edges: Edges, target: Edges, rotMax: number): number | null {
  for (let r = 0; r < rotMax; r++) if (edgesEqual(rotateEdges(edges, r), target)) return r
  return null
}

/** how many cells deviate from the strategy's exact layout */
function layoutMisses(board: Board, charts: Map<string, ChartData>, layout: Edges[]): number {
  let misses = 0
  for (let i = 0; i < 9; i++) {
    const target = layout[i]
    if (!target) continue
    const p = board[i]
    const c = p ? charts.get(p.chartUid) : null
    if (!p || !c || !edgesEqual(rotateEdges(c.edges, p.rotation), target)) misses++
  }
  return misses
}

/** the cells a rule targets - static, or resolved from the rolled borders */
function resolveRuleCells(rule: PositionRule, borders: Borders): number[] {
  return resolveStrategyPositionCells(rule, borders) ?? []
}

/** does this chart satisfy the rule's mod/name matcher? */
function chartMatchesRule(chart: ChartData, rule: PositionRule): boolean {
  return chartMatchesStrategyMatcher(chart, rule)
}

/** objective bonus from strategy position rules for this arrangement */
function strategyBonus(
  board: Board,
  charts: Map<string, ChartData>,
  rules: PositionRule[],
  borders: Borders,
): number {
  let bonus = 0
  for (const rule of rules) {
    for (const cell of resolveRuleCells(rule, borders)) {
      const p = board[cell]
      if (!p) continue
      const chart = charts.get(p.chartUid)
      if (!chart) continue
      if (chartMatchesRule(chart, rule)) bonus += rule.bonus
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
  /** whether the selected connector mode accepts this result */
  valid: boolean
  /** whether the game allows the Voyage to start */
  launchable: boolean
  /** whether all nine charts are reachable from the start */
  fullyReachable: boolean
  /** exhaustive searches prove their negative result; heuristic searches do not */
  searchMethod: 'exhaustive' | 'heuristic'
  /** true only when every arrangement in the supported search space was checked */
  searchComplete: boolean
}

/**
 * Feasibility is a hard constraint, not a score component. Keep accepted
 * boards ahead of diagnostics even when persisted reward values are large
 * enough to outweigh the objective's search-guidance penalty.
 */
function compareSolverResults(a: SolverResult, b: SolverResult): number {
  if (a.valid !== b.valid) return a.valid ? -1 : 1
  return b.score - a.score
}

const VIOLATION_PENALTY = 10_000
// small nudge so that among equally-rewarding runnable boards the solver prefers
// ones with more matched connections (a better-threaded voyage; some mods scale
// per connection). Kept low so it never outweighs real reward differences.
const CONNECTION_BONUS = 0.15

function objectiveScore(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  opts: SolverOptions,
  reward: number,
  connectivity: ConnectivityResult,
): number {
  // filler mode wants the least valuable runnable board, so flip the reward term
  // while keeping the runnable requirements (connections good, violations bad)
  const rewardTerm = opts.minimizeReward ? -reward : reward
  const strat = opts.strategyRules ? strategyBonus(board, charts, opts.strategyRules, borders) : 0
  const layoutPen = opts.strategyLayout
    ? layoutMisses(board, charts, opts.strategyLayout) *
      (opts.strategyLayoutPenalty ?? LAYOUT_PENALTY)
    : 0
  return (
    rewardTerm +
    strat +
    connectivity.connections * CONNECTION_BONUS -
    layoutPen -
    connectivity.violations * VIOLATION_PENALTY
  )
}

function evaluate(
  board: Board,
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: SolverOptions,
): {
  score: number
  valid: boolean
  launchable: boolean
  fullyReachable: boolean
  reward: number
} {
  const analysis = analyzeConnectivity(board, charts, opts.mode)
  const conn = analysis.result
  const s = scoreBoard(board, borders, charts, weights, opts, analysis)
  const objective = objectiveScore(board, borders, charts, opts, s.total, conn)
  return {
    score: objective,
    valid: conn.valid,
    launchable: conn.launchable,
    fullyReachable: conn.fullyReachable,
    reward: s.total,
  }
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
  const eligiblePool = selectSolverEligibleCharts(pool, opts.mode)
  const charts = new Map(eligiblePool.map((c) => [c.uid, c]))
  if (eligiblePool.length === 0) return []
  const requirements = opts.strategyRequirements ?? []
  const requirementsSatisfied =
    requirements.length === 0
      ? () => true
      : (board: Board) => boardSatisfiesStrategyRequirements(requirements, board, charts, borders)
  const locked: (Placement | null)[] =
    opts.locked && opts.locked.length === 9 ? opts.locked : Array(9).fill(null)
  if (
    requirements.length > 0 &&
    !assignStrategyRequirementsToCells(requirements, eligiblePool, borders, locked)
  ) {
    return []
  }

  const CAP = Math.max(opts.topK * 4, 20)
  const searchMethod =
    eligiblePool.length <= 9 && !opts.allowRotation && !opts.forceHeuristic
      ? 'exhaustive'
      : 'heuristic'
  const searchComplete = searchMethod === 'exhaustive'
  let top: SolverResult[] = []
  const seen = new Set<string>()
  const record = (board: Board) => {
    if (!requirementsSatisfied(board)) return
    const { score, valid, launchable, fullyReachable, reward } = evaluate(
      board,
      borders,
      charts,
      weights,
      opts,
    )
    const key = boardKey(board)
    if (seen.has(key)) return
    seen.add(key)
    const candidate: SolverResult = {
      board: board.map((p) => (p ? { ...p } : null)),
      score,
      reward,
      valid,
      launchable,
      fullyReachable,
      searchMethod,
      searchComplete,
    }
    if (top.length >= CAP && compareSolverResults(candidate, top[top.length - 1]) >= 0) return
    top.push(candidate)
    top.sort(compareSolverResults)
    if (top.length > CAP) top = top.slice(0, CAP)
  }

  if (searchComplete) {
    exactSearch(eligiblePool, locked, record)
  } else {
    hillClimb(eligiblePool, borders, charts, weights, opts, locked, requirementsSatisfied, record)
  }

  return top.slice(0, opts.topK)
}

/** All placements of the pool over the 9 cells (pool ≤ 9, no rotation). */
function exactSearch(pool: ChartData[], locked: (Placement | null)[], record: (b: Board) => void) {
  const lockedUids = new Set(locked.filter(Boolean).map((placement) => placement!.chartUid))
  const free = pool.filter((chart) => !lockedUids.has(chart.uid))
  const n = free.length
  const board: Board = locked.map((placement) => (placement ? { ...placement } : null))
  const used = Array(n).fill(false)
  const freeCells = board.filter((placement) => !placement).length

  // walk cells in order; each cell is either left empty or given an unused chart
  const place = (cell: number, placed: number, cellsLeft: number) => {
    if (cellsLeft < n - placed) return
    if (cell === 9) {
      if (placed === n) record(board)
      return
    }
    if (locked[cell]) {
      place(cell + 1, placed, cellsLeft)
      return
    }
    place(cell + 1, placed, cellsLeft - 1)
    for (let k = 0; k < n; k++) {
      if (used[k]) continue
      used[k] = true
      board[cell] = { chartUid: free[k].uid, rotation: 0 }
      place(cell + 1, placed + 1, cellsLeft - 1)
      board[cell] = null
      used[k] = false
    }
  }
  place(0, 0, freeCells)
}

function hillClimb(
  pool: ChartData[],
  borders: Borders,
  charts: Map<string, ChartData>,
  weights: Weights,
  opts: SolverOptions,
  locked: (Placement | null)[],
  requirementsSatisfied: (board: Board) => boolean,
  record: (b: Board) => void,
) {
  // strategies need more exploration: seeded restarts vary piece rotations,
  // and the climb has to reshape the board around the lucky combinations
  const hasStrategy = !!(
    opts.strategyRules ||
    opts.strategyLayout ||
    opts.strategyRequirements?.length
  )
  const RESTARTS = opts.searchRestarts ?? (hasStrategy ? 60 : 40)
  const ITERS = opts.searchIterations ?? (hasStrategy ? 5000 : 4000)
  const rotMax = opts.allowRotation ? 4 : 1
  const random =
    opts.seed === undefined
      ? Math.random
      : (() => {
          let state = opts.seed! >>> 0
          return () => {
            state += 0x6d2b79f5
            let value = state
            value = Math.imul(value ^ (value >>> 15), value | 1)
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
            return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
          }
        })()

  const scoreTotal = prepareScoreTotal(borders, charts, weights, opts)
  const evalScore = (b: Board) => {
    const connectivity = analyzeConnectivity(b, charts, opts.mode)
    const reward = scoreTotal(b, connectivity)
    return objectiveScore(b, borders, charts, opts, reward, connectivity.result)
  }

  for (let r = 0; r < RESTARTS; r++) {
    // random initial: shuffle pool, take up to 9
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const board: Board = locked.map((placement) => (placement ? { ...placement } : null))

    if (opts.strategyRequirements?.length) {
      const requiredPlacements = assignStrategyRequirementsToCells(
        opts.strategyRequirements,
        shuffled,
        borders,
        locked,
      )
      if (!requiredPlacements) continue
      for (const placement of requiredPlacements) {
        if (board[placement.cell]) continue
        const chart = charts.get(placement.chartUid)!
        const target = opts.strategyLayout?.[placement.cell]
        const shapedRotation = target ? rotationFor(chart.edges, target, rotMax) : null
        board[placement.cell] = {
          chartUid: chart.uid,
          rotation: shapedRotation ?? Math.floor(random() * rotMax),
        }
      }
    }

    // strategy-seeded restarts (every other one): pre-place matching charts on
    // their target cells so rare shapes/pieces aren't left to random luck
    if (r % 2 === 0 && (opts.strategyRules || opts.strategyLayout)) {
      const taken = () => new Set(board.filter(Boolean).map((p) => p!.chartUid))
      // 1) positive rule cells first: the designated piece goes there in ANY
      //    shape (location beats lines); use the layout rotation if it happens
      //    to fit, random otherwise
      if (opts.strategyRules) {
        for (const rule of opts.strategyRules) {
          if (rule.bonus <= 0 || (!rule.modIds && !rule.nameMatch)) continue
          for (const cell of resolveRuleCells(rule, borders)) {
            if (board[cell]) continue
            const used = taken()
            const cands = shuffled.filter((c) => !used.has(c.uid) && chartMatchesRule(c, rule))
            if (cands.length === 0) continue
            const target = opts.strategyLayout?.[cell]
            const shaped = target
              ? cands.find((c) => rotationFor(c.edges, target, rotMax) !== null)
              : undefined
            const pick = shaped ?? cands[0]
            // exact-shape pieces take the layout rotation; others get a RANDOM
            // rotation so different restarts explore different orientations
            // (the climb then reshapes the board around the lucky ones)
            const rot =
              shaped && target
                ? rotationFor(pick.edges, target, rotMax)!
                : Math.floor(random() * rotMax)
            board[cell] = { chartUid: pick.uid, rotation: rot }
          }
        }
      }
      // 2) remaining layout cells: shape-matching charts, avoiding banned mods
      if (opts.strategyLayout) {
        for (let cell = 0; cell < 9; cell++) {
          const target = opts.strategyLayout[cell]
          if (!target || board[cell]) continue
          const used = taken()
          const bannedRules = opts.strategyRules?.filter(
            (ru) => ru.bonus < 0 && resolveRuleCells(ru, borders).includes(cell),
          )
          const pick = shuffled.find(
            (c) =>
              !used.has(c.uid) &&
              rotationFor(c.edges, target, rotMax) !== null &&
              !bannedRules?.some((ru) => chartMatchesRule(c, ru)),
          )
          if (pick)
            board[cell] = { chartUid: pick.uid, rotation: rotationFor(pick.edges, target, rotMax)! }
        }
      }
    }

    const remaining = shuffled.filter((c) => !board.some((p) => p?.chartUid === c.uid))
    let ri = 0
    for (let i = 0; i < 9 && ri < remaining.length; i++) {
      if (board[i]) continue
      board[i] = { chartUid: remaining[ri++].uid, rotation: Math.floor(random() * rotMax) }
    }
    const unused = remaining.slice(ri)
    if (!requirementsSatisfied(board)) continue
    let score = evalScore(board)

    for (let it = 0; it < ITERS; it++) {
      const move = random()
      let undo: () => void

      if (move < 0.5) {
        // swap two cells
        const a = Math.floor(random() * 9)
        const b = Math.floor(random() * 9)
        if (a === b || locked[a] || locked[b]) continue
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
        const cell = Math.floor(random() * 9)
        const ui = Math.floor(random() * unused.length)
        if (locked[cell]) continue
        const prev = board[cell]
        const incoming = unused[ui]
        board[cell] = { chartUid: incoming.uid, rotation: Math.floor(random() * rotMax) }
        if (prev) unused[ui] = charts.get(prev.chartUid)!
        else unused.splice(ui, 1)
        undo = () => {
          if (prev) unused[ui] = incoming
          else unused.splice(ui, 0, incoming)
          board[cell] = prev
        }
      } else if (opts.allowRotation) {
        // rotate a placed chart
        const cell = Math.floor(random() * 9)
        const p = board[cell]
        if (!p || locked[cell]) continue
        const prevRot = p.rotation
        p.rotation = (p.rotation + 1 + Math.floor(random() * 3)) % 4
        undo = () => {
          p.rotation = prevRot
        }
      } else {
        continue
      }

      if (!requirementsSatisfied(board)) {
        undo()
        continue
      }
      const newScore = evalScore(board)
      if (newScore >= score) {
        score = newScore
      } else {
        undo()
      }
    }
    record(board)
  }
}
