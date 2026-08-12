import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import type { BorderRollResearchController } from '../hooks/useBorderRollResearch'
import { createBorderResearchStore, createBorderRollSample } from '../logic/borderRollResearch'
import { createBorderSubmissionStore } from '../logic/borderRollSubmission'
import type { Borders } from '../types'
import { BorderRollResearch } from './BorderRollResearch'

const borders = Array(12).fill('b-divine') as Borders

interface ControllerOptions {
  samplingReason: 'gameplay' | 'randomized-research'
  includeNaturalSample?: boolean
  vesperUpgradeCount?: number | null
  storageUnavailable?: boolean
}

function researchController({
  samplingReason,
  includeNaturalSample = true,
  vesperUpgradeCount = 5,
  storageUnavailable = false,
}: ControllerOptions): BorderRollResearchController {
  const baseStore = createBorderResearchStore()
  const samples = []
  if (includeNaturalSample) {
    const created = createBorderRollSample({
      sequenceId: baseStore.activeSequenceId,
      gamePatch: '3.29.2',
      vesperUpgradeCount,
      samplingReason,
      rerollIndex: 0,
      displayedNextRerollCost: 3_000,
      borders,
    })
    if (!created.ok) throw new Error(created.message)
    samples.push(created.sample)
  }

  const store = {
    ...baseStore,
    vesperUpgradeCount,
    randomizedResearchEnabled: samplingReason === 'randomized-research',
    activeSequenceSamplingReason: samplingReason,
    samples,
    ...(storageUnavailable
      ? {
          recovery: {
            code: 'unavailable' as const,
            message: 'Border research storage is unavailable.',
            raw: null,
            backupKey: null,
          },
        }
      : {}),
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
    vesperUpgradeCount,
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
    finishVoyage: () => ({ ok: true, summary: '' }),
  }
}

describe('BorderRollResearch jackpot protection', () => {
  it('waives an assigned research reroll when the saved natural board must be preserved', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({ samplingReason: 'randomized-research' })}
        protectedRoll={{ strategy: 'Divine Border Rares', borders }}
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

  it('protects a complete current jackpot when unknown Vesper progress prevents capture', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({
          samplingReason: 'randomized-research',
          includeNaturalSample: false,
          vesperUpgradeCount: null,
        })}
        protectedRoll={{ strategy: 'Divine Border Rares', borders }}
      />,
    )

    assert.match(markup, /Jackpot protected — keep this natural board/)
    assert.match(markup, /does not depend on research storage or a saved natural sample/)
    assert.match(markup, /Vesper progress unknown/)
    assert.doesNotMatch(markup, /record exactly one paid reroll even when/)
  })

  it('keeps jackpot protection active when research storage is unavailable', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({
          samplingReason: 'randomized-research',
          includeNaturalSample: false,
          storageUnavailable: true,
        })}
        protectedRoll={{ strategy: 'Divine Border Rares', borders }}
      />,
    )

    assert.match(markup, /Jackpot protected — keep this natural board/)
    assert.match(markup, /Border research storage is unavailable/)
    assert.doesNotMatch(markup, /record exactly one paid reroll even when/)
  })

  it('keeps jackpot protection after the matching natural sample is removed', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({
          samplingReason: 'randomized-research',
          includeNaturalSample: false,
        })}
        protectedRoll={{ strategy: 'Divine Border Rares', borders }}
      />,
    )

    assert.match(markup, /Jackpot protected — keep this natural board/)
    assert.doesNotMatch(markup, /record exactly one paid reroll even when/)
  })

  it('does not apply stale protection to unrelated displayed borders', () => {
    const staleBorders = Array(12).fill('b-chaos') as Borders
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({
          samplingReason: 'randomized-research',
          includeNaturalSample: false,
        })}
        protectedRoll={{ strategy: 'Stale Jackpot', borders: staleBorders }}
      />,
    )

    assert.doesNotMatch(markup, /Jackpot protected — keep this natural board/)
    assert.match(markup, /record exactly one paid reroll even when/)
  })

  it('does not label an ordinary gameplay Voyage as a waived research assignment', () => {
    const markup = renderToStaticMarkup(
      <BorderRollResearch
        borders={borders}
        controller={researchController({ samplingReason: 'gameplay' })}
        protectedRoll={{ strategy: 'Divine Border Rares', borders }}
      />,
    )

    assert.doesNotMatch(markup, /Jackpot protected — keep this natural board/)
    assert.doesNotMatch(markup, /research reroll waived/)
    assert.match(markup, /Next: paid reroll 1 · next cost 3,000/)
    assert.match(markup, /Sampling: normal gameplay/)
  })
})
