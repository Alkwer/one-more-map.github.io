import { useMemo } from 'react'
import {
  buildBorderRollSequenceSubmissionUrl,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  serializeBorderRollDataset,
} from '../logic/borderRollResearch'
import type { BorderRollResearchController } from '../hooks/useBorderRollResearch'
import type { Borders } from '../types'

interface Props {
  borders: Borders
  controller: BorderRollResearchController
}

export function BorderRollResearch({ borders, controller }: Props) {
  const { store } = controller
  const missingBorders = useMemo(() => borders.filter((id) => id === null).length, [borders])
  const sequences = useMemo(() => {
    const ids = [...new Set(store.samples.map((sample) => sample.sequenceId))]
    return ids.map((sequenceId) => getBorderRollSequence(store.samples, sequenceId)).reverse()
  }, [store.samples])

  const exportSamples = () => {
    const blob = new Blob([serializeBorderRollDataset(store.samples)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `allflame-border-rolls-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  return (
    <details className="ahk-help roll-research">
      <summary>📊 Contribute border-roll data ({store.samples.length} saved)</summary>
      <p className="muted">
        Every complete 12/12 OCR scan is saved automatically. Scan the natural board and every paid
        reroll; Finish Voyage closes the sequence and can submit it automatically.
      </p>

      <div className="roll-research-grid">
        <label>
          Game patch
          <input
            value={controller.gamePatch}
            maxLength={32}
            placeholder="3.29.0"
            onChange={(event) => controller.setGamePatch(event.target.value)}
          />
        </label>
      </div>

      <div className="roll-research-status">
        <span className={missingBorders === 0 ? 'sample-ready' : 'sample-incomplete'}>
          {missingBorders === 0
            ? '✓ All 12 borders ready'
            : `${missingBorders} borders still missing`}
        </span>
        <span>
          Next:{' '}
          {controller.nextRollIndex === 0
            ? 'natural board'
            : `paid reroll ${controller.nextRollIndex}`}
          {controller.displayedNextRerollCost === null
            ? ' · no known next cost'
            : ` · next cost ${controller.displayedNextRerollCost.toLocaleString('en-US')}`}
        </span>
        <span>Sequence {store.activeSequenceId.slice(-8)}</span>
      </div>

      <div className="import-actions roll-research-actions">
        <button onClick={() => controller.recordCurrentRoll(borders)} disabled={missingBorders > 0}>
          Save current roll
        </button>
        <button onClick={controller.startNextSequence}>Start next Voyage</button>
        <button onClick={exportSamples} disabled={store.samples.length === 0}>
          Export dataset
        </button>
      </div>

      <div className="roll-research-grid">
        <label className="roll-auto-submit">
          <input
            type="checkbox"
            checked={controller.submissionStore.settings.enabled}
            disabled={!controller.endpointConfigured}
            onChange={(event) => controller.setAutoSubmitEnabled(event.target.checked)}
          />
          <span>Automatic submission on Finish Voyage</span>
        </label>
        <label>
          Private submission key
          <input
            type="password"
            autoComplete="off"
            value={controller.submissionStore.settings.submissionKey}
            disabled={!controller.endpointConfigured}
            onChange={(event) => controller.setSubmissionKey(event.target.value)}
          />
        </label>
      </div>
      <div className="roll-research-status">
        <span>
          {controller.endpointConfigured
            ? `${controller.submissionStore.queue.length} Voyage sequence${controller.submissionStore.queue.length === 1 ? '' : 's'} queued`
            : 'Automatic submission service is not configured in this build'}
        </span>
      </div>

      {store.samples.length > 0 && (
        <ol className="roll-sample-list" aria-label="Locally saved Voyage sequences">
          {sequences.map((sequence) => (
            <li className="roll-sequence" key={sequence[0].sequenceId}>
              <div className="roll-sequence-header">
                <span>
                  Voyage {sequence[0].sequenceId.slice(-8)} · {sequence.length}{' '}
                  {sequence.length === 1 ? 'roll' : 'rolls'} · {sequence[0].gamePatch}
                </span>
                <button
                  disabled={!isCompleteBorderRollSequence(sequence)}
                  onClick={() =>
                    window.open(
                      buildBorderRollSequenceSubmissionUrl(sequence),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  Submit Voyage
                </button>
              </div>
              <ol aria-label={`Rolls in Voyage ${sequence[0].sequenceId.slice(-8)}`}>
                {sequence.map((sample) => (
                  <li key={sample.sampleId}>
                    <span>
                      {sample.generation === 'natural'
                        ? 'natural board'
                        : `paid reroll ${sample.rerollIndex}`}
                    </span>
                    <button
                      aria-label={`Remove ${sample.generation} sample captured ${sample.capturedAt}`}
                      onClick={() => {
                        controller.removeSample(sample.sampleId)
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {controller.message && (
        <div className="muted pad" role="status" aria-live="polite" aria-atomic="true">
          {controller.message}
        </div>
      )}
      <p className="muted small">
        Automatic submission is off by default. Without a private key, “Submit Voyage” still opens
        one pre-filled GitHub issue. A bot validates, labels, and closes accepted submissions.
      </p>
    </details>
  )
}
