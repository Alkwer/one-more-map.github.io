import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { chartValue } from '../../logic/chartRanking'
import { chartRewardKey } from '../../logic/rewards'
import { scoreBoard } from '../../logic/scoring'
import { solve } from '../../logic/solver'
import { decodeStateJson, defaultState, serializeState } from '../../logic/storage'
import type { ChartData } from '../../types'
import { emptyBoard, emptyBorders } from '../../types'
import { ChartEditor } from './ChartEditor'
import { updateImportedReward } from './chartEditorRewards'

const importedChart = (): ChartData => ({
  uid: 'imported-chart',
  name: 'Imported Chart',
  level: 83,
  edges: [true, true, true, true],
  modIds: ['cm-quant-20', 'adj-ess-1'],
  rewards: [
    { stat: 'quantity', percent: 20 },
    { stat: 'rarity', percent: 12 },
  ],
  shape: 'Crossing',
  shapeResolved: true,
})

describe('ChartEditor imported rewards', () => {
  it('offers the 3.29.2 Rarity tiers instead of obsolete Chart Gold modifiers', () => {
    const chart = { ...importedChart(), modIds: ['cm-rarity-50'], rewards: undefined }
    const html = renderToStaticMarkup(<ChartEditor chart={chart} onUpdate={() => undefined} />)

    expect(html).toContain('50% increased Rarity of Items found in this Area')
    expect(html).toContain('70% increased Rarity of Items found in this Area')
    expect(html).not.toContain('increased Gold found in this Area')
  })

  it('shows authoritative imported values instead of ignored manual self modifiers', () => {
    const html = renderToStaticMarkup(
      <ChartEditor chart={importedChart()} onUpdate={() => undefined} />,
    )

    expect(html).toContain('Imported area rewards')
    expect(html).toContain('Header values used directly by ranking and the solver')
    expect(html).toContain('aria-label="Imported Item Quantity reward"')
    expect(html).not.toContain('aria-label="Area modifier 1"')
    expect(html).toContain('aria-label="Implicit modifier"')
  })

  it('round-trips an edited imported reward through saved state', () => {
    const edited = updateImportedReward(importedChart(), 0, 45)
    const decoded = decodeStateJson(serializeState({ ...defaultState(), pool: [edited] }))

    expect(decoded).toMatchObject({
      ok: true,
      state: {
        pool: [
          {
            rewards: [
              { stat: 'quantity', percent: 45 },
              { stat: 'rarity', percent: 12 },
            ],
          },
        ],
      },
    })
  })

  it('uses an edited imported value in scoring, ranking, and solver selection', () => {
    const original = { ...importedChart(), modIds: [] }
    const edited = updateImportedReward(original, 0, 45)
    const board = emptyBoard()
    board[0] = { chartUid: original.uid, rotation: 0 }
    const weights = { [chartRewardKey('quantity')]: 5 }
    const options = { adjacencyMode: 'physical' as const, adjacentAffectsSelf: false }

    const originalScore = scoreBoard(
      board,
      emptyBorders(),
      new Map([[original.uid, original]]),
      weights,
      options,
    )
    const editedScore = scoreBoard(
      board,
      emptyBorders(),
      new Map([[edited.uid, edited]]),
      weights,
      options,
    )

    expect(originalScore.total).toBe(1)
    expect(editedScore.total).toBe(2.25)
    expect(chartValue(edited, weights, new Set())).toBeGreaterThan(
      chartValue(original, weights, new Set()),
    )

    const competitor: ChartData = {
      ...original,
      uid: 'competitor',
      rewards: [{ stat: 'quantity', percent: 30 }],
    }
    const fillers = Array.from({ length: 8 }, (_, index): ChartData => ({
      ...original,
      uid: `filler-${index}`,
      rewards: [{ stat: 'quantity', percent: 100 }],
    }))
    const solveOptions = {
      mode: 'strict' as const,
      allowRotation: false,
      adjacencyMode: 'physical' as const,
      adjacentAffectsSelf: false,
      topK: 1,
    }
    const beforeUids = new Set(
      solve([original, competitor, ...fillers], emptyBorders(), weights, solveOptions)[0]
        .board.filter((placement) => placement !== null)
        .map((placement) => placement.chartUid),
    )
    const afterUids = new Set(
      solve([edited, competitor, ...fillers], emptyBorders(), weights, solveOptions)[0]
        .board.filter((placement) => placement !== null)
        .map((placement) => placement.chartUid),
    )

    expect(beforeUids.has(original.uid)).toBe(false)
    expect(beforeUids.has(competitor.uid)).toBe(true)
    expect(afterUids.has(edited.uid)).toBe(true)
    expect(afterUids.has(competitor.uid)).toBe(false)
  })
})
