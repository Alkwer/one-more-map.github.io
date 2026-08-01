import { useMemo, useState } from 'react'
import { REROLL_COSTS } from '../logic/rerollAdvice'
import {
  addBorderRollSample,
  buildBorderRollSequenceSubmissionUrl,
  createBorderRollSample,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  loadBorderResearch,
  nextBorderRollIndex,
  removeBorderRollSample,
  saveBorderResearch,
  serializeBorderRollDataset,
  startBorderRollSequence,
  type BorderResearchStore,
} from '../logic/borderRollResearch'
import type { Borders } from '../types'

interface Props {
  borders: Borders
}

export function BorderRollResearch({ borders }: Props) {
  const [store, setStore] = useState<BorderResearchStore>(loadBorderResearch)
  const [gamePatch, setGamePatch] = useState(
    () => store.samples[store.samples.length - 1]?.gamePatch ?? '3.29',
  )
  const [message, setMessage] = useState('')

  const missingBorders = useMemo(() => borders.filter((id) => id === null).length, [borders])
  const activeSamples = useMemo(
    () => getBorderRollSequence(store.samples, store.activeSequenceId),
    [store.activeSequenceId, store.samples],
  )
  const nextRollIndex = nextBorderRollIndex(activeSamples)
  const displayedNextRerollCost = REROLL_COSTS[nextRollIndex] ?? null
  const sequences = useMemo(() => {
    const ids = [...new Set(store.samples.map((sample) => sample.sequenceId))]
    return ids.map((sequenceId) => getBorderRollSequence(store.samples, sequenceId)).reverse()
  }, [store.samples])

  const commitStore = (next: BorderResearchStore) => {
    setStore(next)
    saveBorderResearch(next)
  }

  const record = () => {
    const result = createBorderRollSample({
      sequenceId: store.activeSequenceId,
      gamePatch,
      rerollIndex: nextRollIndex,
      displayedNextRerollCost,
      borders,
    })
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    const added = addBorderRollSample(store, result.sample)
    if (added.status === 'duplicate') {
      setMessage('This roll is already saved in the current Voyage sequence.')
      return
    }
    if (added.status === 'conflict') {
      setMessage('Remove the conflicting saved roll before recording its correction.')
      return
    }
    commitStore(added.store)
    setMessage(
      `Saved ${nextRollIndex === 0 ? 'natural board' : `paid reroll ${nextRollIndex}`}: 12 modifiers.`,
    )
  }

  const nextSequence = () => {
    commitStore(startBorderRollSequence(store))
    setMessage('Started a new Voyage sequence. Record its natural board first.')
  }

  const exportSamples = () => {
    const blob = new Blob([serializeBorderRollDataset(store.samples)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `allflame-border-rolls-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    setMessage(`Exported ${store.samples.length} complete roll samples.`)
  }

  return (
    <details className="ahk-help roll-research">
      <summary>📊 Contribute border-roll data ({store.samples.length} saved)</summary>
      <p className="muted">
        Start with the natural board, then save every paid reroll in order, including bad results.
        The app assigns roll numbers and known next costs automatically.
      </p>

      <div className="roll-research-grid">
        <label>
          Game patch
          <input
            value={gamePatch}
            maxLength={32}
            placeholder="3.29.0"
            onChange={(event) => setGamePatch(event.target.value)}
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
          Next: {nextRollIndex === 0 ? 'natural board' : `paid reroll ${nextRollIndex}`}
          {displayedNextRerollCost === null
            ? ' · no known next cost'
            : ` · next cost ${displayedNextRerollCost.toLocaleString('en-US')}`}
        </span>
        <span>Sequence {store.activeSequenceId.slice(-8)}</span>
      </div>

      <div className="import-actions roll-research-actions">
        <button onClick={record} disabled={missingBorders > 0}>
          Save current roll
        </button>
        <button onClick={nextSequence}>Start next Voyage</button>
        <button onClick={exportSamples} disabled={store.samples.length === 0}>
          Export dataset
        </button>
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
                        commitStore(removeBorderRollSample(store, sample.sampleId))
                        setMessage('Removed the local sample.')
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

      {message && (
        <div className="muted pad" role="status" aria-live="polite" aria-atomic="true">
          {message}
        </div>
      )}
      <p className="muted small">
        “Submit Voyage” opens one pre-filled GitHub issue containing the complete sequence. A bot
        validates, labels, and closes accepted submissions. The data has no account fields, but your
        GitHub username remains visible on the issue.
      </p>
    </details>
  )
}
