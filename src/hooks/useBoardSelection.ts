import { useCallback, useEffect, useMemo, useState, type Dispatch } from 'react'
import type { AppStateAction } from '../state/appStateReducer'
import type { Board, ChartData } from '../types'

export function useBoardSelection(
  board: Board,
  pool: ChartData[],
  dispatch: Dispatch<AppStateAction>,
) {
  const [selectedChart, setSelectedChart] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)
  const chartUids = useMemo(() => new Set(pool.map((chart) => chart.uid)), [pool])

  const clear = useCallback(() => {
    setSelectedChart(null)
    setSelectedCell(null)
  }, [])
  const clearChart = useCallback(
    (uid?: string) => setSelectedChart((current) => (!uid || current === uid ? null : current)),
    [],
  )
  const clearCell = useCallback(
    (cell?: number) =>
      setSelectedCell((current) => (cell === undefined || current === cell ? null : current)),
    [],
  )

  useEffect(() => {
    setSelectedChart((current) => (current && !chartUids.has(current) ? null : current))
  }, [chartUids])

  useEffect(() => {
    setSelectedCell((current) => (current !== null && !board[current] ? null : current))
  }, [board])

  const selectChart = (uid: string) => {
    setSelectedChart((current) => (current === uid ? null : uid))
    setSelectedCell(null)
  }
  const onCellClick = (cell: number) => {
    if (selectedChart) {
      if (!chartUids.has(selectedChart)) {
        setSelectedChart(null)
        return
      }
      dispatch({ type: 'board/place', cell, chartUid: selectedChart })
      clear()
      return
    }
    if (selectedCell === null) {
      if (board[cell]) setSelectedCell(cell)
      return
    }
    if (!board[selectedCell]) {
      setSelectedCell(board[cell] ? cell : null)
      return
    }
    if (selectedCell === cell) {
      setSelectedCell(null)
      return
    }
    dispatch({ type: 'board/swap', first: selectedCell, second: cell })
    setSelectedCell(null)
  }
  const applyBoard = (nextBoard: Board) => {
    dispatch({ type: 'board/apply', board: nextBoard })
    clear()
  }

  return {
    selectedChart,
    selectedCell,
    selectChart,
    onCellClick,
    applyBoard,
    clear,
    clearChart,
    clearCell,
  }
}
