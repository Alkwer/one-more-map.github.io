import { rotateEdges } from '../../logic/connectivity'
import type { Board, ChartData } from '../../types'

export type EdgeStatus = 'none' | 'connected' | 'open' | 'mismatch'

const DIRECTIONS = [
  { rowOffset: -1, columnOffset: 0, opposite: 2 }, // N
  { rowOffset: 0, columnOffset: 1, opposite: 3 }, // E
  { rowOffset: 1, columnOffset: 0, opposite: 0 }, // S
  { rowOffset: 0, columnOffset: -1, opposite: 1 }, // W
]

function edgesAt(board: Board, charts: ReadonlyMap<string, ChartData>, cell: number) {
  const placement = board[cell]
  if (!placement) return null
  const chart = charts.get(placement.chartUid)
  return chart ? rotateEdges(chart.edges, placement.rotation) : null
}

export function edgeStatusForCell(
  board: Board,
  charts: ReadonlyMap<string, ChartData>,
  cell: number,
  strictMode: boolean,
): EdgeStatus[] {
  const edges = edgesAt(board, charts, cell)
  if (!edges) return ['none', 'none', 'none', 'none']

  const row = Math.floor(cell / 3)
  const column = cell % 3
  return DIRECTIONS.map((direction, edge) => {
    if (!edges[edge]) return 'none'

    const neighbourRow = row + direction.rowOffset
    const neighbourColumn = column + direction.columnOffset
    if (neighbourRow < 0 || neighbourRow > 2 || neighbourColumn < 0 || neighbourColumn > 2) {
      return 'open'
    }

    const neighbourEdges = edgesAt(board, charts, neighbourRow * 3 + neighbourColumn)
    if (!neighbourEdges) return 'open'
    if (neighbourEdges[direction.opposite]) return 'connected'
    return strictMode ? 'mismatch' : 'open'
  })
}
