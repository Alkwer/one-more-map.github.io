import { useState, type Dispatch } from 'react'
import type { AppStateAction } from '../state/appStateReducer'
import type { Board } from '../types'

export function useBoardSelection(board: Board, dispatch: Dispatch<AppStateAction>) {
  const [selectedChart, setSelectedChart] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<number | null>(null)

  const clear = () => {
    setSelectedChart(null)
    setSelectedCell(null)
  }
  const clearChart = () => setSelectedChart(null)
  const selectChart = (uid: string) => {
    setSelectedChart((current) => (current === uid ? null : uid))
    setSelectedCell(null)
  }
  const onCellClick = (cell: number) => {
    if (selectedChart) {
      dispatch({ type: 'board/place', cell, chartUid: selectedChart })
      clear()
      return
    }
    if (selectedCell === null) {
      if (board[cell]) setSelectedCell(cell)
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

  return { selectedChart, selectedCell, selectChart, onCellClick, applyBoard, clearChart }
}
