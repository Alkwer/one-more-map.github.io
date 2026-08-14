import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Board, ChartData } from '../../types'
import { CopySequencePrompt, FinishVoyageConfirmationPrompt } from './VoyageWorkflowPrompts'

const chart: ChartData = {
  uid: 'chart-6',
  name: 'Test Chart',
  level: 83,
  edges: [true, false, true, false],
  modIds: ['self:quant'],
}

describe('CopySequencePrompt', () => {
  it('renders a recoverable manual-copy path after clipboard failure', () => {
    const board: Board = Array(9).fill(null)
    board[6] = { chartUid: chart.uid, rotation: 0 }
    const html = renderToStaticMarkup(
      <CopySequencePrompt
        sequence={{ order: [{ cell: 6, chartUid: chart.uid }], step: 0 }}
        board={board}
        chartMap={new Map([[chart.uid, chart]])}
        failure={{
          ok: false,
          next: { order: [{ cell: 6, chartUid: chart.uid }], step: 0 },
          reason: 'rejected',
          detail: 'Permission denied',
          manualText: 'test search',
        }}
        pending={false}
        onAdvance={() => {}}
        onManualAdvance={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(html).toContain('Nothing was copied, so this chart has not advanced.')
    expect(html).toContain('Permission denied')
    expect(html).toContain('value="test search"')
    expect(html).toContain('I copied it manually — next')
    expect(html).toContain('Retry clipboard copy')
  })
})

describe('FinishVoyageConfirmationPrompt', () => {
  it('states the exact destructive chart count and offers confirm and cancel actions', () => {
    const html = renderToStaticMarkup(
      <FinishVoyageConfirmationPrompt
        confirmation={{
          consumeCount: 9,
          snapshot: { boardUids: Array(9).fill('chart'), researchSequenceId: 'voyage-test' },
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(html).toContain('Finish Voyage and consume 9 charts?')
    expect(html).toContain('Finish and consume 9')
    expect(html).toContain('Cancel')
  })
})
