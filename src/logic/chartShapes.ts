import type { ChartData, ChartShape, Edges } from '../types'

export const CHART_SHAPES: readonly ChartShape[] = [
  'End',
  'Corner',
  'Straight',
  'Junction',
  'Crossing',
]

const SHAPE_EDGES: Record<ChartShape, Edges> = {
  End: [true, false, false, false],
  Corner: [true, true, false, false],
  Straight: [true, false, true, false],
  Junction: [true, true, true, false],
  Crossing: [true, true, true, true],
}

export function edgesForChartShape(shape: ChartShape): Edges {
  return [...SHAPE_EDGES[shape]] as Edges
}

/** Infer the rotation-independent canonical shape represented by connector edges. */
export function chartShapeForEdges(edges: unknown): ChartShape | undefined {
  if (
    !Array.isArray(edges) ||
    edges.length !== 4 ||
    edges.some((edge) => typeof edge !== 'boolean')
  )
    return undefined

  const count = edges.filter(Boolean).length
  if (count === 1) return 'End'
  if (count === 3) return 'Junction'
  if (count === 4) return 'Crossing'
  if (count !== 2) return undefined
  return (edges[0] && edges[2]) || (edges[1] && edges[3]) ? 'Straight' : 'Corner'
}

/**
 * Older saved/manual charts predate shapeResolved. They remain eligible when
 * their edge tuple describes a real shape; only an explicit false or malformed
 * connector data keeps a chart out of solving.
 */
export function isChartShapeResolved(chart: ChartData): boolean {
  return chart.shapeResolved !== false && chartShapeForEdges(chart.edges) !== undefined
}
