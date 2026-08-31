import {
  loadBorderResearch,
  resetBorderResearch,
  saveBorderResearch,
  createBorderResearchStore,
} from './borderRollResearch'
import {
  BORDER_ROLL_INTAKE_URL,
  loadBorderSubmissionStore,
  resetBorderSubmissionStore,
  saveBorderSubmissionStore,
  sendQueuedBorderSubmission,
} from './borderRollSubmission'
import { createBorderResearchService } from './borderResearchService'

/** Browser adapters retain migration, quarantine and credential-scrubbing behavior. */
export function createBrowserBorderResearchService() {
  return createBorderResearchService({
    research: { load: loadBorderResearch, save: saveBorderResearch, reset: resetBorderResearch },
    submissions: {
      load: loadBorderSubmissionStore,
      save: saveBorderSubmissionStore,
      reset: resetBorderSubmissionStore,
    },
    transport: { send: sendQueuedBorderSubmission },
    endpoint: BORDER_ROLL_INTAKE_URL,
    newSequence: () => ({
      sequenceId: createBorderResearchStore().activeSequenceId,
      randomValue: Math.random(),
    }),
    random: Math.random,
    now: () => new Date().toISOString(),
  })
}
