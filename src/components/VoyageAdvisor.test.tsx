import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import type { VoyageDecision } from '../logic/voyageDecision'
import { VoyageAdvisor } from './VoyageAdvisor'

const decision = (withForecast: boolean): VoyageDecision => ({
  kind: 'play',
  decisionBasis: 'modeled-percentile',
  label: 'PLAY: Test Strategy',
  reason: 'The modeled roll is worth keeping.',
  strategyId: 'test',
  strategyName: 'Test Strategy',
  recommendationTier: 'specialized',
  fit: 0.42,
  missing: [],
  action: null,
  rerollsUsed: 0,
  remainingRerolls: 5,
  spent: 0,
  nextCost: 3_000,
  keepModelPercentileLine: 0.6,
  preserveRoll: false,
  rollForecast: withForecast
    ? {
        modelVersion: 3,
        modelProfile: 'paid-reroll',
        modelConfidence: 'low',
        modelStructure: 'slot-aware',
        sampleCount: 14,
        sequenceCount: 7,
        expectedScore: 10,
        expectedFit: 0.2,
        medianFit: 0.18,
        sixtiethPercentileFit: 0.22,
        currentPercentile: 0.8,
        currentPercentileRange: [0.74, 0.83],
        chanceNextRollBeatsCurrent: 0.15,
        chanceNextRollBeatsCurrentRange: [0.12, 0.2],
        priorSensitivity: [0.25, 2],
        borrowedNaturalBoardCount: 27,
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

    assert.match(markup, /Paid-reroll slot model v3/)
    assert.match(markup, /low confidence/)
    assert.match(markup, /Achievable-roll percentile/)
    assert.match(markup, />80% \(74–83%\)</)
    assert.match(markup, /Keep percentile/)
    assert.match(markup, />60%?</)
    assert.match(markup, /15%.*of modeled paid rerolls score higher than this roll/)
    assert.match(markup, /Secondary ceiling diagnostic/)
    assert.match(markup, /Theoretical ceiling ratio/)
    assert.match(markup, /has no decision line, and cannot trigger KEEP or REROLL/)
    assert.doesNotMatch(markup, /Best-found roll fit/)
    assert.doesNotMatch(markup, />Decision line</)
    assert.match(markup, /14 paid-reroll boards · 7 paid Voyage sequences · 27 natural boards/)
    assert.match(markup, /Decision basis: modeled-percentile/)
    assert.match(markup, /prior-only estimates are not observed drops/)
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
    assert.match(markup, /Theoretical ceiling ratio/)
    assert.match(markup, /No keep\/reroll threshold is applied to this scale/)
    assert.match(markup, /app preserves the board instead of using the theoretical ceiling ratio/)
  })

  it('describes fallback decisions without presenting them as the only strategy', () => {
    const fallbackDecision: VoyageDecision = {
      ...decision(true),
      label: 'PLAY FALLBACK: Alc & Go',
      strategyId: 'alc-and-go',
      strategyName: 'Alc & Go',
      recommendationTier: 'fallback',
      reason: 'Alc & Go is the recommended fallback; it is not the only runnable strategy.',
    }
    const markup = renderToStaticMarkup(
      <VoyageAdvisor
        decision={fallbackDecision}
        onChangeRerolls={() => undefined}
        onSelectStrategy={() => undefined}
      />,
    )

    assert.match(markup, /PLAY FALLBACK: Alc &amp; Go/)
    assert.match(markup, /Recommended fallback for charts \+ border roll/)
    assert.doesNotMatch(markup, /Best strategy for charts \+ border roll/)
  })
})
