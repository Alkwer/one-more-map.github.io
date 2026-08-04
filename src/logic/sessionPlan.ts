// Multi-voyage session planner: given the whole library, sequence the voyages
// worth running - juiced strategies first when their pieces are ready, then
// repeated Speedruns while centre charts last, then Alc & Go with the rest.
//
// The plan is advisory chart arithmetic, not a batch of solves: each entry
// allocates real charts out of the pool (so later entries only see what's
// left), and the user runs entries one at a time with the normal solve flow.

import {
  SPEEDRUN_CENTER_MODS,
  STRATEGIES,
  type StrategyDef,
  type StrategyReservationPreferences,
  defaultStrategyReservations,
} from '../data/strategies'
import { selectStrategySolvePool } from './solverPoolSelection'
import { allocateStrategyRequirements } from './strategyRequirements'
import { selectSolverEligibleCharts } from './chartShapes'
import type { Borders, ChartData, ConnectivityMode } from '../types'

export interface PlanEntry {
  strategyId: string
  name: string
  status: 'ready' | 'waiting'
  /** consecutive runs of this entry (Speedrun / Alc & Go repeat) */
  runs: number
  /** ready: what it uses; waiting: what's missing */
  note: string
}

export interface SessionPlan {
  entries: PlanEntry[]
  /** charts accepted by the same mode-aware predicate as the solver */
  eligible: number
  /** charts excluded because their shape is unresolved in strict mode */
  blocked: number
  /** charts allocated across all ready entries */
  allocated: number
  /** spare charts left over after the whole plan */
  leftover: number
}

/** the one-off juiced strategies, in the order they're worth running */
const JUICED_ORDER = ['divine-border-rares', 'cutedog-divine-boxes', 'milky-meatfish']

const byId = new Map(STRATEGIES.map((s) => [s.id, s]))

export function planSession(
  pool: ChartData[],
  borders: Borders,
  preferences: StrategyReservationPreferences = defaultStrategyReservations(),
  pieceKeeps: Record<string, number> = {},
  mode: ConnectivityMode = 'strict',
): SessionPlan {
  const eligiblePool = selectSolverEligibleCharts(pool, mode)
  const used = new Set<string>()
  const entries: PlanEntry[] = []
  const remaining = () => eligiblePool.filter((c) => !used.has(c.uid))

  // ---- juiced one-offs, best first ----
  for (const id of JUICED_ORDER) {
    const s = byId.get(id) as StrategyDef
    const borderMissing = s.requiresBorderId && !borders.includes(s.requiresBorderId.id)
    // the strategy may only spend what its own reservations allow
    const spendable = selectStrategySolvePool(
      remaining(),
      s,
      preferences,
      undefined,
      pieceKeeps,
    ).solvePool

    const allocation = allocateStrategyRequirements(s.requirements ?? [], spendable, borders)
    const missing = allocation.allocations
      .filter((entry) => entry.missing > 0)
      .map((entry) => `${entry.missing}× ${entry.requirement.label}`)
    const tentative = new Set(allocation.allocatedUids)
    if (borderMissing) missing.push(s.requiresBorderId!.label)

    if (missing.length > 0) {
      entries.push({
        strategyId: s.id,
        name: s.name,
        status: 'waiting',
        runs: 1,
        note: `missing ${missing.join(', ')}`,
      })
      continue
    }
    // top the board up to 9 from the strategy's own spendable charts
    const fillers = spendable
      .filter((c) => !tentative.has(c.uid))
      .slice(0, Math.max(0, 9 - tentative.size))
    if (tentative.size + fillers.length < 9) {
      entries.push({
        strategyId: s.id,
        name: s.name,
        status: 'waiting',
        runs: 1,
        note: `pieces ready but only ${tentative.size + fillers.length} usable charts - need 9 for a board`,
      })
      continue
    }
    fillers.forEach((c) => tentative.add(c.uid))
    tentative.forEach((uid) => used.add(uid))
    entries.push({
      strategyId: s.id,
      name: s.name,
      status: 'ready',
      runs: 1,
      note: 'pieces ready - run this board',
    })
  }

  // ---- Speedrun repeats: one centre chart + 8 spares each ----
  const speedrun = byId.get('milky-speedrun') as StrategyDef
  let speedrunRuns = 0
  for (;;) {
    const spendable = selectStrategySolvePool(
      remaining(),
      speedrun,
      preferences,
      undefined,
      pieceKeeps,
    ).solvePool
    const isCentre = (c: ChartData) => c.modIds.some((id) => SPEEDRUN_CENTER_MODS.includes(id))
    const centres = spendable.filter(isCentre)
    const centre = centres[0]
    if (!centre) break
    // sides never waste a spare centre chart - those seed the NEXT run
    const sides = [...spendable.filter((c) => !isCentre(c)), ...centres.slice(1)].slice(0, 8)
    if (sides.length < 8) break
    used.add(centre.uid)
    sides.forEach((c) => used.add(c.uid))
    speedrunRuns++
  }
  if (speedrunRuns > 0)
    entries.push({
      strategyId: 'milky-speedrun',
      name: speedrun.name,
      status: 'ready',
      runs: speedrunRuns,
      note: `${speedrunRuns} centre chart${speedrunRuns === 1 ? '' : 's'} + quantity sides`,
    })

  // ---- Alc & Go burns whatever nothing else wants ----
  const alcgo = byId.get('alc-and-go') as StrategyDef
  const alcSpendable = selectStrategySolvePool(
    remaining(),
    alcgo,
    preferences,
    undefined,
    pieceKeeps,
  ).solvePool
  const alcRuns = Math.floor(alcSpendable.length / 9)
  if (alcRuns > 0) {
    alcSpendable.slice(0, alcRuns * 9).forEach((c) => used.add(c.uid))
    entries.push({
      strategyId: 'alc-and-go',
      name: alcgo.name,
      status: 'ready',
      runs: alcRuns,
      note: 'spare charts nothing else wants',
    })
  }

  return {
    entries,
    eligible: eligiblePool.length,
    blocked: pool.length - eligiblePool.length,
    allocated: used.size,
    leftover: pool.length - used.size,
  }
}
