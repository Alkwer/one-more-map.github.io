import { describe, expect, it, vi } from 'vitest'
import { BORDER_MODS } from '../data/mods'
import type { Borders } from '../types'
import {
  addBorderRollSample,
  archiveBorderRollSequence,
  BORDER_ROLL_DATASET_SCHEMA,
  BORDER_ROLL_SAMPLE_SCHEMA,
  buildBorderRollSequenceSubmissionUrl,
  buildBorderRollSubmissionUrl,
  createBorderRollDataset,
  createBorderResearchStore,
  createBorderRollSample,
  getBorderRollSequence,
  isCompleteBorderRollSequence,
  loadBorderResearch,
  nextBorderRollIndex,
  removeBorderRollSample,
  restoreBorderRollSequence,
  serializeBorderRollDataset,
} from './borderRollResearch'

const completeBorders = (): Borders =>
  Array.from({ length: 12 }, (_, index) => BORDER_MODS[index % BORDER_MODS.length].id)

function sample(overrides: Partial<Parameters<typeof createBorderRollSample>[0]> = {}) {
  const result = createBorderRollSample({
    sequenceId: 'voyage-test',
    gamePatch: '3.29.0',
    rerollIndex: 0,
    displayedNextRerollCost: 3000,
    borders: completeBorders(),
    capturedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  })
  if (!result.ok) throw new Error(result.message)
  return result.sample
}

describe('border roll research samples', () => {
  it('records a complete ordered natural roll', () => {
    const result = sample()

    expect(result).toMatchObject({
      schema: BORDER_ROLL_SAMPLE_SCHEMA,
      sequenceId: 'voyage-test',
      generation: 'natural',
      rerollIndex: 0,
      displayedNextRerollCost: 3000,
    })
    expect(result.borderModIds).toHaveLength(12)
  })

  it('rejects incomplete boards', () => {
    const incomplete = completeBorders()
    incomplete[4] = null

    expect(
      createBorderRollSample({
        sequenceId: 'voyage-test',
        gamePatch: '3.29',
        rerollIndex: 0,
        displayedNextRerollCost: 3000,
        borders: incomplete,
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('all 12') })
  })

  it('migrates stored v1 samples without the post-roll Voyage level', () => {
    const current = sample()
    const legacySample = {
      ...current,
      schema: 'allflame-border-roll/v1',
      voyageLevel: 83,
    }
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() =>
        JSON.stringify({
          version: 1,
          activeSequenceId: 'voyage-test',
          samples: [legacySample],
        }),
      ),
      setItem,
    })

    try {
      const migrated = loadBorderResearch()
      expect(migrated.version).toBe(3)
      expect(migrated.archivedSequenceIds).toEqual([])
      expect(migrated.samples[0]).not.toHaveProperty('voyageLevel')
      expect(migrated.samples[0].schema).toBe(BORDER_ROLL_SAMPLE_SCHEMA)
      expect(JSON.parse(setItem.mock.calls[0][1]).samples[0]).not.toHaveProperty('voyageLevel')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('migrates stored v2 research without losing samples', () => {
    const current = sample()
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() =>
        JSON.stringify({
          version: 2,
          activeSequenceId: 'voyage-test',
          samples: [current],
        }),
      ),
      setItem,
    })

    try {
      const migrated = loadBorderResearch()
      expect(migrated).toMatchObject({
        version: 3,
        activeSequenceId: 'voyage-test',
        samples: [{ sampleId: current.sampleId }],
        archivedSequenceIds: [],
      })
      expect(JSON.parse(setItem.mock.calls[0][1])).toMatchObject({
        version: 3,
        archivedSequenceIds: [],
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('archives historical sequences without deleting their samples and can restore them', () => {
    const current = sample()
    const store = {
      ...createBorderResearchStore(),
      activeSequenceId: 'voyage-next',
      samples: [current],
    }

    const archived = archiveBorderRollSequence(store, 'voyage-test')
    expect(archived.samples).toEqual([current])
    expect(archived.archivedSequenceIds).toEqual(['voyage-test'])
    expect(archiveBorderRollSequence(archived, 'voyage-test')).toBe(archived)

    const restored = restoreBorderRollSequence(archived, 'voyage-test')
    expect(restored.archivedSequenceIds).toEqual([])
  })

  it('does not archive the active sequence and removes stale archive markers', () => {
    const current = sample()
    const store = {
      ...createBorderResearchStore(),
      activeSequenceId: 'voyage-test',
      samples: [current],
    }

    expect(archiveBorderRollSequence(store, 'voyage-test')).toBe(store)
    const historical = archiveBorderRollSequence(
      { ...store, activeSequenceId: 'voyage-next' },
      'voyage-test',
    )
    expect(removeBorderRollSample(historical, current.sampleId).archivedSequenceIds).toEqual([])
  })

  it('keeps one observation per roll index in a Voyage sequence', () => {
    const store = { ...createBorderResearchStore(), activeSequenceId: 'voyage-test' }
    const first = sample()
    const added = addBorderRollSample(store, first)
    expect(added.status).toBe('added')

    expect(addBorderRollSample(added.store, sample()).status).toBe('duplicate')
    const changedBorders = completeBorders()
    changedBorders[0] = BORDER_MODS[BORDER_MODS.length - 1].id
    expect(addBorderRollSample(added.store, sample({ borders: changedBorders })).status).toBe(
      'conflict',
    )
  })

  it('orders a complete sequence and derives its next missing roll number', () => {
    const natural = sample()
    const reroll = sample({ rerollIndex: 1, displayedNextRerollCost: 6000 })
    const sequence = getBorderRollSequence([reroll, natural], 'voyage-test')

    expect(sequence.map(({ rerollIndex }) => rerollIndex)).toEqual([0, 1])
    expect(nextBorderRollIndex(sequence)).toBe(2)
    expect(nextBorderRollIndex([reroll])).toBe(0)
    expect(isCompleteBorderRollSequence(sequence)).toBe(true)
    expect(isCompleteBorderRollSequence([reroll])).toBe(false)
  })

  it('exports a versioned dataset and a pre-filled submission link', () => {
    const roll = sample({ rerollIndex: 1, displayedNextRerollCost: 6000 })
    const dataset = JSON.parse(serializeBorderRollDataset([roll], '2026-07-31T13:00:00.000Z'))

    expect(dataset).toMatchObject({
      schema: BORDER_ROLL_DATASET_SCHEMA,
      sampleCount: 1,
      samples: [{ generation: 'paid-reroll', rerollIndex: 1 }],
    })
    const url = new URL(buildBorderRollSubmissionUrl(roll))
    expect(url.hostname).toBe('github.com')
    expect(url.pathname).toBe('/Alkwer/one-more-map.github.io/issues/new')
    expect(url.searchParams.get('body')).toContain(roll.sampleId)
  })

  it('creates a dataset object for queued automatic delivery', () => {
    expect(createBorderRollDataset([sample()], '2026-08-01T13:00:00.000Z')).toMatchObject({
      schema: BORDER_ROLL_DATASET_SCHEMA,
      exportedAt: '2026-08-01T13:00:00.000Z',
      sampleCount: 1,
      samples: [{ sequenceId: 'voyage-test' }],
    })
  })

  it('submits one complete Voyage sequence as a dataset', () => {
    const natural = sample()
    const reroll = sample({ rerollIndex: 1, displayedNextRerollCost: 6000 })
    const url = new URL(buildBorderRollSequenceSubmissionUrl([reroll, natural]))
    const body = url.searchParams.get('body') ?? ''
    const payload = JSON.parse(body.match(/```json\n([\s\S]+)\n```/)?.[1] ?? '{}')

    expect(url.pathname).toBe('/Alkwer/one-more-map.github.io/issues/new')
    expect(url.searchParams.get('title')).toBe('[data] Border roll sequence 3.29.0')
    expect(payload).toMatchObject({
      schema: BORDER_ROLL_DATASET_SCHEMA,
      sampleCount: 2,
      samples: [{ rerollIndex: 0 }, { rerollIndex: 1 }],
    })
  })
})
