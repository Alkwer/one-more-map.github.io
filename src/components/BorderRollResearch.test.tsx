import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import type { BorderRollResearchController } from '../hooks/useBorderRollResearch'
import { createBorderResearchStore, createBorderRollSample } from '../logic/borderRollResearch'
import { createBorderSubmissionStore } from '../logic/borderRollSubmission'
import type { Borders } from '../types'
import { BorderRollResearch } from './BorderRollResearch'

const borders = Array(12).fill('b-divine') as Borders

function researchController(
  samplingReason: 'gameplay' | 'randomized-research',
): BorderRollResearchController {
  const baseStore = createBorderResearchStore()
  const created = createBorderRollSample({
    sequenceId: baseStore.activeSequenceId,
    gamePatch: '3.29.2',
    vesperUpgradeCount: 5,
    samplingReason,
    rerollIndex: 0,
    displayedNextRerollCost: 3_000,
    borders,
  })
  if (!created.ok) throw new Error(created.message)

  const store = {
    ...baseStore,
    vesperUpgradeCount: 5,
    randomizedResearchEnabled: samplingReason === 'randomized-research',
    activeSequenceSamplingReason: samplingReason,
    samples: [created.sample],
  }

  return {
    store,
    submissionStore: createBorderSubmissionStore(),
    gamePatch: '3.29.2',
    message: '',
    endpointConfigured: false,
    activeSamples: store.samples,
    nextRollIndex: 1,
    displayedNextRerollCost: 3_000,
    vesperUpgradeCount: 5,
    setGamePatch: () => undefined,
    setVesperUpgradeCount: () => undefined,
    setRandomizedResearchEnabled: () => undefined,
    setAutoSubmitEnabled: () => undefined,
    setSubmissionKey: () => undefined,
    submitQueuedSequences: () => undefined,
    recordCurrentRoll: () => '',
    captureImportedRoll: () => '',
    startNextSequence: () => undefined,
    removeSample: () => undefined,
    archiveSequence: () => undefined,
    restoreSequence: () => undefined,
    cancelQueuedSequence: () => undefined,
    retryQueuedSequence: () => undefined,
    retryResearchRecovery: () => undefined,
    resetResearchStore: () => undefined,
    retrySubmissionRecovery: () => undefined,
    resetSubmissionStore: () => undefined,
    finishVoyage: () => '',
  }
}

describe('BorderRollResearch jackpot protection', () => {
  it('waives an assigned research reroll when the saved natural board must be preserved', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController('randomized-research')}
        protectedRollStrategy="Divine Border Rares"
      />,
    )

    assert.match(markup, /jackpot \/ preserve recommendations are always exempt/)
    assert.match(markup, /Jackpot protected — keep this natural board/)
    assert.match(markup, /Divine Border Rares triggered the preserve safeguard/)
    assert.match(markup, /Do not reroll this board/)
    assert.match(markup, /Next: keep natural board · research reroll waived/)
    assert.match(markup, /randomized research · jackpot exemption/)
    assert.doesNotMatch(markup, /record exactly one paid reroll even when/)
  })

  it('does not label an ordinary gameplay Voyage as a waived research assignment', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController('gameplay')}
        protectedRollStrategy="Divine Border Rares"
      />,
    )

    assert.doesNotMatch(markup, /Jackpot protected — keep this natural board/)
    assert.doesNotMatch(markup, /research reroll waived/)
    assert.match(markup, /Next: paid reroll 1 · next cost 3,000/)
    assert.match(markup, /Sampling: normal gameplay/)
  })
})
