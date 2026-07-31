import { useEffect, useMemo, useState } from 'react'
import { REROLL_COSTS } from '../logic/rerollAdvice'
import {
  addBorderRollSample,
  buildBorderRollSubmissionUrl,
  createBorderRollSample,
  loadBorderResearch,
  removeBorderRollSample,
  saveBorderResearch,
  serializeBorderRollDataset,
  startBorderRollSequence,
  type BorderResearchStore,
} from '../logic/borderRollResearch'
import type { Borders } from '../types'

interface Props {
  borders: Borders
  rerollsUsed: number
  suggestedLevel: number | null
}

const asOptionalInteger = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

export function BorderRollResearch({ borders, rerollsUsed, suggestedLevel }: Props) {
  const [store, setStore] = useState<BorderResearchStore>(loadBorderResearch)
  const [gamePatch, setGamePatch] = useState(
    () => store.samples[store.samples.length - 1]?.gamePatch ?? '3.29',
  )
  const [voyageLevel, setVoyageLevel] = useState(() => suggestedLevel?.toString() ?? '')
  const [rerollIndex, setRerollIndex] = useState(() => rerollsUsed.toString())
  const [displayedCost, setDisplayedCost] = useState(
    () => REROLL_COSTS[rerollsUsed]?.toString() ?? '',
  )
  const [message, setMessage] = useState('')

  const missingBorders = useMemo(() => borders.filter((id) => id === null).length, [borders])

  useEffect(() => {
    if (!voyageLevel && suggestedLevel) setVoyageLevel(suggestedLevel.toString())
  }, [suggestedLevel, voyageLevel])

  useEffect(() => {
    setRerollIndex(rerollsUsed.toString())
    setDisplayedCost(REROLL_COSTS[rerollsUsed]?.toString() ?? '')
  }, [rerollsUsed])

  const commitStore = (next: BorderResearchStore) => {
    setStore(next)
    saveBorderResearch(next)
  }

  const record = () => {
    const result = createBorderRollSample({
      sequenceId: store.activeSequenceId,
      gamePatch,
      voyageLevel: Number(voyageLevel),
      rerollIndex: rerollIndex.trim() ? Number(rerollIndex) : Number.NaN,
      displayedNextRerollCost: asOptionalInteger(displayedCost),
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
      setMessage(
        'That reroll number already has a different sample. Remove it to correct OCR, or start the next Voyage.',
      )
      return
    }
    commitStore(added.store)
    setMessage(`Saved complete roll: 12 modifiers, sample ${added.store.samples.length}.`)
  }

  const nextSequence = () => {
    commitStore(startBorderRollSequence(store))
    setRerollIndex('0')
    setDisplayedCost(REROLL_COSTS[0].toString())
    setMessage('Started a new Voyage sequence. Record its natural board as roll 0.')
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

  const latest = store.samples[store.samples.length - 1]
  const recentSamples = store.samples.slice(-3).reverse()

  return (
    <details className="ahk-help roll-research">
      <summary>📊 Contribute border-roll data ({store.samples.length} saved)</summary>
      <p className="muted">
        Record every complete 12-modifier board, including bad rolls. Samples stay in this browser
        until you explicitly export or submit one; no screenshots or account data are included.
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
        <label>
          Voyage level
          <input
            inputMode="numeric"
            min={1}
            max={100}
            type="number"
            value={voyageLevel}
            onChange={(event) => setVoyageLevel(event.target.value)}
          />
        </label>
        <label>
          Roll number
          <input
            aria-describedby="roll-number-hint"
            inputMode="numeric"
            min={0}
            max={20}
            type="number"
            value={rerollIndex}
            onChange={(event) => {
              const value = event.target.value
              setRerollIndex(value)
              const index = Number(value)
              setDisplayedCost(
                Number.isInteger(index) ? (REROLL_COSTS[index]?.toString() ?? '') : '',
              )
            }}
          />
          <span id="roll-number-hint" className="field-hint">
            0 = natural, 1+ = paid
          </span>
        </label>
        <label>
          Next cost shown
          <input
            inputMode="numeric"
            min={0}
            type="number"
            placeholder="blank at cap"
            value={displayedCost}
            onChange={(event) => setDisplayedCost(event.target.value)}
          />
        </label>
      </div>

      <div className="roll-research-status">
        <span className={missingBorders === 0 ? 'sample-ready' : 'sample-incomplete'}>
          {missingBorders === 0
            ? '✓ All 12 borders ready'
            : `${missingBorders} borders still missing`}
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
        <button
          disabled={!latest}
          onClick={() => {
            if (latest)
              window.open(buildBorderRollSubmissionUrl(latest), '_blank', 'noopener,noreferrer')
          }}
        >
          Submit latest
        </button>
      </div>

      {store.samples.length > 0 && (
        <ol className="roll-sample-list" aria-label="Locally saved border roll samples">
          {recentSamples.map((sample) => (
            <li key={sample.sampleId}>
              <span>
                L{sample.voyageLevel} ·{' '}
                {sample.generation === 'natural' ? 'natural' : `reroll ${sample.rerollIndex}`} ·{' '}
                {sample.gamePatch}
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
      )}

      {message && (
        <div className="muted pad" role="status" aria-live="polite" aria-atomic="true">
          {message}
        </div>
      )}
      <p className="muted small">
        “Submit latest” opens a pre-filled GitHub issue for review. Keep natural boards and every
        paid reroll in the same sequence so duplicate and independence rules can be tested. The
        sample has no account data, but your GitHub username will be visible on the issue.
      </p>
    </details>
  )
}
