import { useMemo, useState } from 'react'
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

const VESPER_UPGRADE_OPTIONS = [0, 1, 2, 3, 4, 5] as const

export function BorderRollResearch({ borders, controller }: Props) {
  const { store } = controller
  const [showArchived, setShowArchived] = useState(false)
  const missingBorders = useMemo(() => borders.filter((id) => id === null).length, [borders])
  const sequenceView = useMemo(() => {
    const archivedIds = new Set(store.archivedSequenceIds)
    const ids = [...new Set(store.samples.map((sample) => sample.sequenceId))]
    const sequences = ids
      .map((sequenceId) => getBorderRollSequence(store.samples, sequenceId))
      .reverse()
    let activeSampleCount = 0
    let archivedSampleCount = 0
    let archivedSequenceCount = 0
    for (const sequence of sequences) {
      if (archivedIds.has(sequence[0].sequenceId)) {
        archivedSampleCount += sequence.length
        archivedSequenceCount += 1
      } else {
        activeSampleCount += sequence.length
      }
    }
    return {
      archivedIds,
      activeSampleCount,
      archivedSampleCount,
      archivedSequenceCount,
      visibleSequences: showArchived
        ? sequences
        : sequences.filter((sequence) => !archivedIds.has(sequence[0].sequenceId)),
    }
  }, [showArchived, store.archivedSequenceIds, store.samples])

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
      <summary>
        📊 Contribute border-roll data ({sequenceView.activeSampleCount} active
        {sequenceView.archivedSampleCount > 0
          ? ` · ${sequenceView.archivedSampleCount} archived`
          : ''}
        )
      </summary>
      <p className="muted">
        Every complete 12/12 OCR scan is saved automatically. Scan the natural board and every paid
        reroll; Finish Voyage closes the sequence and can submit it automatically. Successfully sent
        sequences are archived locally and hidden from this list by default. Select your Superior
        Sovereign progress once so quest-gated border pools can be tested separately.
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
        <label>
          Vesper upgrades (Superior Sovereign)
          <select
            value={controller.vesperUpgradeCount ?? ''}
            onChange={(event) => {
              const value = event.target.value
              controller.setVesperUpgradeCount(value === '' ? null : Number(value))
            }}
          >
            <option value="" disabled>
              Select current progress
            </option>
            {VESPER_UPGRADE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}/5
              </option>
            ))}
          </select>
          <small className="field-hint">
            Check Challenges → Superior Sovereign. Legacy samples remain “unknown”.
          </small>
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
        <span
          className={controller.vesperUpgradeCount === null ? 'sample-incomplete' : 'sample-ready'}
        >
          Vesper{' '}
          {controller.vesperUpgradeCount === null
            ? 'progress unknown'
            : `${controller.vesperUpgradeCount}/5`}
        </span>
      </div>

      <div className="import-actions roll-research-actions">
        <button
          onClick={() => controller.recordCurrentRoll(borders)}
          disabled={missingBorders > 0 || controller.vesperUpgradeCount === null}
        >
          Save current roll
        </button>
        <button onClick={controller.startNextSequence}>Start next Voyage</button>
        <button onClick={exportSamples} disabled={store.samples.length === 0}>
          Export dataset
        </button>
        {sequenceView.archivedSequenceCount > 0 && (
          <button onClick={() => setShowArchived((current) => !current)}>
            {showArchived
              ? 'Hide archived'
              : `Show archived (${sequenceView.archivedSequenceCount})`}
          </button>
        )}
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
        The key is kept in memory for this tab only. Keys saved by older versions are erased on
        load; rotate a previously stored key before re-entering it.
      </div>
      <div className="roll-research-status">
        <span>
          {controller.endpointConfigured
            ? `${controller.submissionStore.queue.length} Voyage sequence${controller.submissionStore.queue.length === 1 ? '' : 's'} queued`
            : 'Automatic submission service is not configured in this build'}
        </span>
      </div>

      {sequenceView.visibleSequences.length > 0 ? (
        <ol className="roll-sample-list" aria-label="Locally saved Voyage sequences">
          {sequenceView.visibleSequences.map((sequence) => {
            const sequenceId = sequence[0].sequenceId
            const archived = sequenceView.archivedIds.has(sequenceId)
            return (
              <li
                className={`roll-sequence${archived ? ' roll-sequence-archived' : ''}`}
                key={sequenceId}
              >
                <div className="roll-sequence-header">
                  <span>
                    Voyage {sequenceId.slice(-8)} · {sequence.length}{' '}
                    {sequence.length === 1 ? 'roll' : 'rolls'} · {sequence[0].gamePatch} · Vesper{' '}
                    {sequence[0].vesperUpgradeCount === null
                      ? 'unknown'
                      : `${sequence[0].vesperUpgradeCount}/5`}
                  </span>
                  <div className="roll-sequence-actions">
                    {archived ? (
                      <>
                        <span className="sample-ready">Archived</span>
                        <button onClick={() => controller.restoreSequence(sequenceId)}>
                          Restore
                        </button>
                      </>
                    ) : (
                      <>
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
                        {sequenceId !== store.activeSequenceId && (
                          <button onClick={() => controller.archiveSequence(sequenceId)}>
                            Archive
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <ol aria-label={`Rolls in Voyage ${sequenceId.slice(-8)}`}>
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
            )
          })}
        </ol>
      ) : sequenceView.archivedSequenceCount > 0 ? (
        <p className="muted small">All submitted Voyage sequences are archived locally.</p>
      ) : null}

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
