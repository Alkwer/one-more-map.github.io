import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SolverResult } from '../../logic/solver'
import { SolverActions } from './SolverActions'
import { SolverResults } from './SolverResults'

const result = (
  searchMethod: SolverResult['searchMethod'],
  searchComplete: boolean,
): SolverResult => ({
  board: Array(9).fill(null),
  score: 12,
  reward: 10,
  valid: true,
  launchable: true,
  fullyReachable: true,
  searchMethod,
  searchComplete,
})

const actionMarkup = (eligibleChartCount: number, allowRotation: boolean) =>
  renderToStaticMarkup(
    <SolverActions
      busy={false}
      resultCount={0}
      solveNote=""
      eligibleChartCount={eligibleChartCount}
      unresolvedShapeCount={0}
      allowRotation={allowRotation}
      onSolve={() => {}}
      onFiller={() => {}}
    />,
  )

describe('solver search guarantees', () => {
  it('labels a complete exhaustive result as optimal within its supported space', () => {
    const results = renderToStaticMarkup(
      <SolverResults results={[result('exhaustive', true)]} onApply={() => {}} />,
    )
    const actions = actionMarkup(9, false)

    expect(results).toContain('Search method: <strong>Exhaustive</strong>')
    expect(results).toContain('Guarantee: #1 is optimal within the supported search space.')
    expect(actions).toContain('exhaustive search (#1 is optimal within the supported search space)')
  })

  it('labels a bounded heuristic result as best found without an optimality guarantee', () => {
    const results = renderToStaticMarkup(
      <SolverResults results={[result('heuristic', false)]} onApply={() => {}} />,
    )
    const largePoolActions = actionMarkup(10, false)
    const rotationActions = actionMarkup(9, true)

    expect(results).toContain('Search method: <strong>Heuristic</strong>')
    expect(results).toContain('Guarantee: Best found; global optimum not proven.')
    expect(largePoolActions).toContain('bounded heuristic search')
    expect(largePoolActions).toContain('results are best found; no global optimality guarantee')
    expect(rotationActions).toContain('bounded heuristic search')
    expect(results).not.toContain('#1 is optimal')
  })
})
