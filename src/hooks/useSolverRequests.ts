import { useEffect, useMemo, useRef, useState } from 'react'
import type { StrategyDef } from '../data/strategies'
import type { SolverResult } from '../logic/solver'
import { createSolverStateKey } from '../logic/solverRequestKeys'
import { isWorkerRequestCancelled, SolverWorkerClient } from '../logic/solverWorkerClient'
import type { AppState } from '../logic/storage'
import type { ChartData, Weights } from '../types'
import {
  KEEP_BEST_CHARTS,
  selectFillerPool,
  selectStrategySolvePool,
} from '../logic/solverPoolSelection'

interface KeyedResults {
  key: string
  results: SolverResult[]
}

interface KeyedNote {
  key: string
  text: string
}

interface BusyRequest {
  key: string
  requestId: number
}

interface Options {
  state: AppState
  activeStrategy: StrategyDef | null
  weights: Weights
  eligiblePool: ChartData[]
}

export function useSolverRequests({ state, activeStrategy, weights, eligiblePool }: Options) {
  const [busyRequest, setBusyRequest] = useState<BusyRequest | null>(null)
  const [resultState, setResultState] = useState<KeyedResults>({
    key: '',
    results: [],
  })
  const [noteState, setNoteState] = useState<KeyedNote>({
    key: '',
    text: '',
  })
  const clientRef = useRef<SolverWorkerClient | null>(null)
  const nextRequestId = useRef(1)
  const latestRequestId = useRef(0)
  if (clientRef.current === null) clientRef.current = new SolverWorkerClient()
  const locked = useMemo(() => {
    const eligibleByUid = new Map(eligiblePool.map((chart) => [chart.uid, chart]))
    return state.board.map((placement) => {
      if (!placement || !eligibleByUid.get(placement.chartUid)?.preserved) return null
      return { ...placement }
    })
  }, [eligiblePool, state.board])
  const lockedUids = useMemo(
    () => new Set(locked.filter(Boolean).map((placement) => placement!.chartUid)),
    [locked],
  )

  const solveKey = useMemo(
    () =>
      createSolverStateKey(
        {
          pool: eligiblePool,
          board: state.board,
          borders: state.borders,
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: state.disabledMods,
          strategyReservations: state.strategyReservations,
          pieceKeeps: state.pieceKeeps,
        },
        weights,
        activeStrategy?.id ?? null,
      ),
    [
      eligiblePool,
      state.board,
      state.borders,
      state.mode,
      state.allowRotation,
      state.adjacencyMode,
      state.adjacentAffectsSelf,
      state.disabledMods,
      state.strategyReservations,
      state.pieceKeeps,
      weights,
      activeStrategy?.id,
    ],
  )
  const latestSolveKey = useRef(solveKey)
  latestSolveKey.current = solveKey
  const busy = busyRequest?.key === solveKey
  const results = resultState.key === solveKey ? resultState.results : []
  const solveNote = noteState.key === solveKey ? noteState.text : ''

  useEffect(
    () => () => {
      clientRef.current?.cancel()
    },
    [solveKey],
  )

  const run = () => {
    const requestKey = solveKey
    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ key: requestKey, requestId })
    setResultState({ key: requestKey, results: [] })
    setNoteState({ key: requestKey, text: '' })
    const { solvePool, heldBack, heldBackFor } = selectStrategySolvePool(
      eligiblePool,
      activeStrategy,
      state.strategyReservations,
      lockedUids,
      state.pieceKeeps,
    )

    clientRef
      .current!.solve({
        pool: solvePool,
        borders: state.borders,
        weights,
        options: {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: [...state.disabledMods],
          topK: 5,
          strategyRules: activeStrategy?.rules,
          strategyRequirements: activeStrategy?.requirements,
          strategyLayout: activeStrategy?.layout,
          strategyLayoutPenalty: activeStrategy?.layoutPenalty,
          locked,
        },
      })
      .then((response) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (latestSolveKey.current !== requestKey || latestRequestId.current !== requestId) return
        setResultState({ key: requestKey, results: response })
        const notes: string[] = []
        if (lockedUids.size > 0) {
          notes.push(
            `${lockedUids.size} locked chart${lockedUids.size === 1 ? '' : 's'} kept in place.`,
          )
        }
        if (heldBack > 0)
          notes.push(
            `${heldBack} chart${heldBack === 1 ? '' : 's'} held back for ${heldBackFor.join(
              ', ',
            )}. Change protections above to include them.`,
          )
        if (solvePool.length < 9)
          notes.push(`Only ${solvePool.length} spare charts - not enough for a full board.`)
        else if (activeStrategy?.requirements?.length && response.length === 0)
          notes.push(
            'No board can satisfy every mandatory strategy piece in its allowed position with the available and locked charts.',
          )
        else if (response.length && !response[0].valid)
          notes.push('No fully reachable layout from these charts - best partial shown.')
        setNoteState({ key: requestKey, text: notes.join(' ') })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (
          isWorkerRequestCancelled(error) ||
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          key: requestKey,
          text: `Solver failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      })
  }

  const runFiller = () => {
    const requestKey = solveKey
    setNoteState({ key: requestKey, text: '' })
    const disabledMods = new Set(state.disabledMods)
    const fillerPool = selectFillerPool(
      eligiblePool,
      weights,
      disabledMods,
      activeStrategy,
      state.strategyReservations,
      state.pieceKeeps,
    )
    if (fillerPool.length < 9) {
      setResultState({ key: requestKey, results: [] })
      setNoteState({
        key: requestKey,
        text: `Only ${fillerPool.length} spare chart${fillerPool.length === 1 ? '' : 's'} - need 9 outside your best ${KEEP_BEST_CHARTS}, strategy-protected, and locked charts to build a filler voyage.`,
      })
      return
    }

    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ key: requestKey, requestId })
    setResultState({ key: requestKey, results: [] })
    clientRef
      .current!.solve({
        pool: fillerPool,
        borders: state.borders,
        weights,
        options: {
          mode: state.mode,
          allowRotation: state.allowRotation,
          adjacencyMode: state.adjacencyMode,
          adjacentAffectsSelf: state.adjacentAffectsSelf,
          disabledMods: [...disabledMods],
          topK: 5,
          minimizeReward: true,
        },
      })
      .then((response) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (latestSolveKey.current !== requestKey || latestRequestId.current !== requestId) return
        setResultState({ key: requestKey, results: response })
        setNoteState({
          key: requestKey,
          text: response[0]?.valid
            ? 'Filler voyage: lowest-value fully reachable board from your spare charts (your best, strategy-protected & locked charts untouched).'
            : 'No fully reachable filler layout from your spare charts.',
        })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (
          isWorkerRequestCancelled(error) ||
          latestSolveKey.current !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          key: requestKey,
          text: `Solver failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      })
  }

  return { busy, results, solveNote, run, runFiller }
}
