import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import type { VoyageDecision } from '../logic/voyageDecision'
import { VoyageAdvisor } from './VoyageAdvisor'

const decision = (withForecast: boolean): VoyageDecision => ({
  kind: 'play',
  label: 'PLAY: Test Strategy',
  reason: 'The modeled roll is worth keeping.',
  strategyId: 'test',
  strategyName: 'Test Strategy',
  fit: 0.42,
  missing: [],
  action: null,
  rerollsUsed: 0,
  remainingRerolls: 5,
  spent: 0,
  nextCost: 3_000,
  keepFitLine: 0.6,
  keepModelPercentileLine: 0.6,
  decisionFitLine: 0.6,
  preserveRoll: false,
  rollForecast: withForecast
    ? {
        modelVersion: 1,
        modelProfile: 'paid-reroll',
        modelConfidence: 'low',
        sampleCount: 14,
        sequenceCount: 7,
        expectedScore: 10,
        expectedFit: 0.2,
        medianFit: 0.18,
        sixtiethPercentileFit: 0.22,
        currentPercentile: 0.8,
        chanceNextRollBeatsCurrent: 0.15,
      }
    : null,
})

describe('VoyageAdvisor', () => {
  it('renders the experimental model evidence next to the recommendation', () => {
    const markup = renderToStaticMarkup(
      <VoyageAdvisor
        decision={decision(true)}
        onChangeRerolls={() => undefined}
        onSelectStrategy={() => undefined}
      />,
    )

    assert.match(markup, /Experimental roll model v1/)
    assert.match(markup, /low confidence/)
    assert.match(markup, /Current roll percentile/)
    assert.match(markup, />80%?</)
    assert.match(markup, /Paid reroll scores higher/)
    assert.match(markup, />15%?</)
    assert.match(markup, /14 paid-reroll boards · 7 complete Voyage sequences/)
  })

  it('keeps a clear fallback when a layout has no modeled comparison', () => {
    const markup = renderToStaticMarkup(
      <VoyageAdvisor
        decision={decision(false)}
        onChangeRerolls={() => undefined}
        onSelectStrategy={() => undefined}
      />,
    )

    assert.doesNotMatch(markup, /Experimental roll model v1/)
    assert.match(markup, /A modeled comparison is unavailable for this layout/)
  })
})
