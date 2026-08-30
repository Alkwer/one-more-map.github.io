import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveStrategyLayout, type StrategyDef } from '../data/strategies'
import { hasOptimalityGuarantee, type SolverResult } from '../logic/solver'
import { createSolverStateKey } from '../logic/solverRequestKeys'
import { isWorkerRequestCancelled, SolverWorkerClient } from '../logic/solverWorkerClient'
import type { AppState } from '../state/appState'
import type { ChartData, Weights } from '../types'
import {
  KEEP_BEST_CHARTS,
  selectFillerPool,
  selectStrategySolvePool,
} from '../logic/solverPoolSelection'

type RequestKind = 'solve' | 'filler'

interface KeyedResults {
  kind: RequestKind
  key: string
  results: SolverResult[]
}

interface KeyedNote {
  kind: RequestKind
  key: string
  text: string
}

interface BusyRequest {
  kind: RequestKind
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
    kind: 'solve',
    key: '',
    results: [],
  })
  const [noteState, setNoteState] = useState<KeyedNote>({
    kind: 'solve',
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
  const strategyLayout = activeStrategy
    ? resolveStrategyLayout(activeStrategy, state.layoutChoice)
    : undefined

  const requestKeys = useMemo(() => {
    const inputs = {
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
      layoutChoice: state.layoutChoice,
    }
    return {
      solve: createSolverStateKey(inputs, weights, activeStrategy?.id ?? null),
      filler: createSolverStateKey(inputs, weights, activeStrategy?.id ?? null, 'filler'),
    }
  }, [
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
    state.layoutChoice,
    weights,
    activeStrategy?.id,
  ])
  const latestRequestKeys = useRef(requestKeys)
  latestRequestKeys.current = requestKeys
  const busy = !!busyRequest && busyRequest.key === requestKeys[busyRequest.kind]
  const results = resultState.key === requestKeys[resultState.kind] ? resultState.results : []
  const solveNote = noteState.key === requestKeys[noteState.kind] ? noteState.text : ''

  useEffect(() => {
    if (busyRequest && busyRequest.key !== requestKeys[busyRequest.kind]) {
      clientRef.current?.cancel()
    }
  }, [busyRequest, requestKeys])

  useEffect(
    () => () => {
      clientRef.current?.cancel()
    },
    [],
  )

  const run = () => {
    const kind: RequestKind = 'solve'
    const requestKey = requestKeys[kind]
    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ kind, key: requestKey, requestId })
    setResultState({ kind, key: requestKey, results: [] })
    setNoteState({ kind, key: requestKey, text: '' })
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
          strategyLayout,
          strategyLayoutPenalty: activeStrategy?.layoutPenalty,
          locked,
        },
      })
      .then((response) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (latestRequestKeys.current[kind] !== requestKey || latestRequestId.current !== requestId)
          return
        setResultState({ kind, key: requestKey, results: response })
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
            state.allowRotation || solvePool.length > 9
              ? 'The bounded solver did not find a board satisfying every mandatory strategy position. Try again or change the search inputs.'
              : 'No board can satisfy every mandatory strategy piece in its allowed position with the available and locked charts.',
          )
        else if (response.length && !response[0].valid)
          notes.push(
            hasOptimalityGuarantee(response[0])
              ? 'No fully reachable layout exists for these charts - best partial shown.'
              : 'The bounded solver did not find a fully reachable layout - best partial shown. Try again to explore another search path.',
          )
        setNoteState({ kind, key: requestKey, text: notes.join(' ') })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (
          isWorkerRequestCancelled(error) ||
          latestRequestKeys.current[kind] !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          kind,
          key: requestKey,
          text: `Solver failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      })
  }

  const runFiller = () => {
    const kind: RequestKind = 'filler'
    const requestKey = requestKeys[kind]
    setNoteState({ kind, key: requestKey, text: '' })
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
      setResultState({ kind, key: requestKey, results: [] })
      setNoteState({
        kind,
        key: requestKey,
        text: `Only ${fillerPool.length} spare chart${fillerPool.length === 1 ? '' : 's'} - need 9 outside your best ${KEEP_BEST_CHARTS}, strategy-protected, and locked charts to build a filler voyage.`,
      })
      return
    }

    const requestId = nextRequestId.current++
    latestRequestId.current = requestId
    setBusyRequest({ kind, key: requestKey, requestId })
    setResultState({ kind, key: requestKey, results: [] })
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
        if (latestRequestKeys.current[kind] !== requestKey || latestRequestId.current !== requestId)
          return
        setResultState({ kind, key: requestKey, results: response })
        setNoteState({
          kind,
          key: requestKey,
          text: response[0]?.valid
            ? 'Filler voyage: lowest-value fully reachable board from your spare charts (your best, strategy-protected & locked charts untouched).'
            : response[0] && hasOptimalityGuarantee(response[0])
              ? 'No fully reachable filler layout exists for your spare charts.'
              : 'The bounded solver did not find a fully reachable filler layout. Try again to explore another search path.',
        })
      })
      .catch((error: unknown) => {
        setBusyRequest((current) => (current?.requestId === requestId ? null : current))
        if (
          isWorkerRequestCancelled(error) ||
          latestRequestKeys.current[kind] !== requestKey ||
          latestRequestId.current !== requestId
        )
          return
        setNoteState({
          kind,
          key: requestKey,
          text: `Solver failed: ${error instanceof Error ? error.message : String(error)}`,
        })
      })
  }

  return { busy, results, solveNote, run, runFiller }
}
