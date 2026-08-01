import { describe, expect, it } from 'vitest'
import type { Board, ChartData, Edges } from '../../types'
import { edgeStatusForCell } from './boardEdges'

const chart = (uid: string, edges: Edges): ChartData => ({
  uid,
  name: uid,
  level: 83,
  edges,
  modIds: [],
  shapeResolved: true,
})

const boardWith = (...placements: Array<[number, string, number?]>): Board => {
  const board: Board = Array(9).fill(null)
  for (const [cell, chartUid, rotation = 0] of placements) {
    board[cell] = { chartUid, rotation }
  }
  return board
}

describe('board edge presentation', () => {
  it('returns no edges for an empty or unresolved placement', () => {
    expect(edgeStatusForCell(boardWith(), new Map(), 0, true)).toEqual([
      'none',
      'none',
      'none',
      'none',
    ])
    expect(edgeStatusForCell(boardWith([0, 'missing']), new Map(), 0, true)).toEqual([
      'none',
      'none',
      'none',
      'none',
    ])
  })

  it('marks matching rotated connectors as connected', () => {
    const charts = new Map([
      ['a', chart('a', [true, false, false, false])],
      ['b', chart('b', [false, false, false, true])],
    ])
    const board = boardWith([0, 'a', 1], [1, 'b'])

    expect(edgeStatusForCell(board, charts, 0, true)).toEqual(['none', 'connected', 'none', 'none'])
    expect(edgeStatusForCell(board, charts, 1, true)).toEqual(['none', 'none', 'none', 'connected'])
  })

  it('distinguishes strict mismatches from open experimental edges', () => {
    const charts = new Map([
      ['a', chart('a', [false, true, false, false])],
      ['b', chart('b', [false, false, false, false])],
    ])
    const board = boardWith([0, 'a'], [1, 'b'])

    expect(edgeStatusForCell(board, charts, 0, true)[1]).toBe('mismatch')
    expect(edgeStatusForCell(board, charts, 0, false)[1]).toBe('open')
  })

  it('keeps connectors at the board boundary open', () => {
    const charts = new Map([['a', chart('a', [true, false, false, false])]])

    expect(edgeStatusForCell(boardWith([0, 'a']), charts, 0, true)).toEqual([
      'open',
      'none',
      'none',
      'none',
    ])
  })
})
