import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import type { Board, Borders, ChartData } from '../src/types'
import { StrategySuggestions } from '../src/components/StrategySuggestions'
import { BORDER_ROLL_MODEL, estimateModBoardChance } from '../src/logic/borderRollModel'
import {
  MIN_FALLBACK_RECOMMENDATION_PERCENTILE,
  rollAwareStrategyRecommendationPriority,
  strategyById,
} from '../src/data/strategies'
import {
  strategyReadiness,
  suggestStrategies,
  type StrategyEvaluationOptions,
} from '../src/logic/strategySuggestions'

const options = {
  adjacencyMode: 'physical',
  adjacentAffectsSelf: false,
  disabledMods: new Set(),
  mode: 'any',
  allowRotation: false,
} satisfies StrategyEvaluationOptions

const chart = (uid: string, modIds: string[] = [], name = `Chart ${uid}`): ChartData => ({
  uid,
  name,
  level: 83,
  edges: [false, false, false, false],
  modIds,
})

const emptyBoard = (): Board => Array(9).fill(null)
const emptyBorders = (): Borders => Array(12).fill(null)

describe('strategy suggestion regressions', () => {
  it('boosts Alc & Go only after it reaches the modeled fallback percentile', () => {
    const fallback = { recommendationTier: 'fallback' as const }
    const specialized = { recommendationTier: 'specialized' as const }

    assert.equal(MIN_FALLBACK_RECOMMENDATION_PERCENTILE, 0.5)
    assert.ok(
      rollAwareStrategyRecommendationPriority(specialized, false) >
        rollAwareStrategyRecommendationPriority(fallback, false),
    )
    assert.ok(
      rollAwareStrategyRecommendationPriority(fallback, true) >
        rollAwareStrategyRecommendationPriority(specialized, false),
    )
    assert.ok(
      rollAwareStrategyRecommendationPriority(specialized, true) >
        rollAwareStrategyRecommendationPriority(fallback, true),
    )
  })

  it('prioritizes the Divine border jackpot without a placed board', () => {
    // The Divine roll is an explicit jackpot and must outrank generic strategies
    // even before the player places charts on the board.
    const borders = emptyBorders()
    borders[0] = 'b-divine'
    const result = suggestStrategies(emptyBoard(), borders, new Map(), [], options)

    assert.equal(result.suggestions[0].strategy.id, 'divine-border-rares')
    assert.equal(result.suggestions[0].jackpot, true)
    assert.equal(result.suggestions[0].confidence, 'high')
    assert.equal(result.suggestions[0].matchingBorders, 1)
    assert.equal(result.suggestions[0].requiredBorderStatus, 'met')
  })

  it('does not rank Divine Border Rares first when a complete roll lacks Divine', () => {
    const pool = [
      chart('divine-pillar', [], 'Sea-Pillar Alpha'),
      ...Array.from({ length: 3 }, (_, index) => chart(`divine-box-${index}`, ['adj-box-3'])),
      ...Array.from({ length: 5 }, (_, index) => chart(`divine-rare-${index}`, ['adj-rare-2'])),
    ]
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = Array(12).fill('b-rare-3')
    const result = suggestStrategies(emptyBoard(), borders, charts, pool, options)
    const divine = result.evaluations.find((entry) => entry.strategy.id === 'divine-border-rares')!

    assert.equal(divine.requiredBorderStatus, 'missing')
    const divineEstimate = estimateModBoardChance(BORDER_ROLL_MODEL, 'b-divine')!
    assert.equal(divine.requiredBorderEvidence, divineEstimate.evidence)
    assert.equal(divine.requiredBorderObservations, divineEstimate.observations)
    assert.ok((divine.requiredBorderChance ?? 0) > 0)
    assert.notEqual(result.evaluations[0].strategy.id, 'divine-border-rares')
    assert.ok(divine.rankScore > result.evaluations[0].rankScore)
    assert.ok(divine.reasons.some((reason) => /requires a border reroll/.test(reason)))
    assert.ok(
      divine.reasons.some((reason) =>
        divineEstimate.evidence === 'prior-only'
          ? /0 observed paid-reroll hits.*only through the prior/.test(reason)
          : new RegExp(`${divineEstimate.observations} observed paid-reroll hits`).test(reason),
      ),
    )
    if (divineEstimate.evidence === 'prior-only') {
      assert.ok(divine.reasons.every((reason) => !/model estimates a \d+% chance/.test(reason)))
    }

    const priorOnlyDivine = {
      ...divine,
      requiredBorderEvidence: 'prior-only' as const,
      requiredBorderObservations: 0,
    }
    const markup = renderToStaticMarkup(
      createElement(StrategySuggestions, {
        result: { ...result, suggestions: [priorOnlyDivine] },
        activeId: null,
        onSelect: () => undefined,
      }),
    )
    assert.match(markup, /Required border/)
    assert.match(markup, /Required border<strong>Unknown<\/strong>/)
    assert.match(markup, /prior-only · 0 observed/)
  })

  it('uses the Meatfish library jackpot without a border roll', () => {
    // "Cannot drop Equipment" is the Meatfish library jackpot and remains useful
    // evidence even when no border roll has been entered yet.
    const keeper = chart('keeper', ['voy-noequip'])
    const result = suggestStrategies(
      emptyBoard(),
      emptyBorders(),
      new Map([[keeper.uid, keeper]]),
      [keeper],
      options,
    )

    assert.equal(result.hasEvidence, true)
    assert.equal(result.suggestions[0].strategy.id, 'milky-meatfish')
    assert.equal(result.suggestions[0].jackpot, true)
    assert.ok(result.suggestions[0].reasons.some((reason) => /cannot drop Equipment/.test(reason)))
  })

  it('does not invent evidence for an empty state', () => {
    const result = suggestStrategies(emptyBoard(), emptyBorders(), new Map(), [], options)
    assert.equal(result.hasEvidence, false)
  })

  it('adds modeled fresh-roll compatibility to strategy evidence', () => {
    const pool = [
      chart('modeled-star-1', ['adj-star-1']),
      chart('modeled-star-2', ['adj-star-2']),
      chart('modeled-pantheon', ['adj-pantheon']),
      chart('modeled-pillar-1', [], 'Sea-Pillar Model A'),
      chart('modeled-pillar-2', [], 'Sea-Pillar Model B'),
      chart('modeled-lantern-1', ['adj-lantern']),
      chart('modeled-lantern-2', ['adj-lantern']),
      chart('modeled-possess', ['voy-possess']),
      chart('modeled-no-equipment', ['voy-noequip']),
    ]
    const result = suggestStrategies(
      emptyBoard(),
      emptyBorders(),
      new Map(pool.map((entry) => [entry.uid, entry])),
      pool,
      options,
    )
    const suggestion = result.evaluations.find(
      (evaluation) => evaluation.strategy.id === 'milky-meatfish',
    )!

    assert.ok(suggestion.modeledBorderFit !== null)
    assert.ok(suggestion.modeledBorderFit! >= 0)
    assert.ok(
      suggestion.reasons.some((reason) =>
        /paid reroll's mean contribution is .* theoretical per-slot ceiling/.test(reason),
      ),
    )
  })

  it('does not promote an incomplete recipe over a runnable strategy', () => {
    const pool = Array.from({ length: 9 }, (_, index) => chart(`ready-filler-${index}`))
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = Array(12).fill('b-rare-3')
    const result = suggestStrategies(emptyBoard(), borders, charts, pool, options)

    assert.equal(result.suggestions[0].strategy.id, 'alc-and-go')
    assert.equal(result.suggestions[0].readiness.ready, true)
    const meatfish = result.evaluations.find((entry) => entry.strategy.id === 'milky-meatfish')
    assert.ok(meatfish)
    assert.equal(meatfish.readiness.ready, false)
  })

  it('keeps Alc & Go behind a runnable specialized strategy despite a higher raw rank', () => {
    const premiumCenter = {
      ...chart('fallback-operative', ['adj-opbox-1']),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }
    const quantityFillers = Array.from({ length: 9 }, (_, index) => ({
      ...chart(`fallback-quantity-${index}`),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }))
    const pool = [premiumCenter, ...quantityFillers]
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = [...Array(8).fill('b-mag-3'), ...Array(4).fill('b-quantconn-2')] as Borders
    const result = suggestStrategies(emptyBoard(), borders, charts, pool, options)
    const alc = result.evaluations.find((entry) => entry.strategy.id === 'alc-and-go')!
    const speedrun = result.evaluations.find((entry) => entry.strategy.id === 'milky-speedrun')!

    assert.equal(alc.readiness.ready, true)
    assert.equal(speedrun.readiness.ready, true)
    assert.ok(alc.rankScore > speedrun.rankScore)
    assert.equal(result.suggestions[0].strategy.id, 'milky-speedrun')
  })

  it('labels a policy-selected fallback and its runnable specialized alternative clearly', () => {
    const premiumCenter = {
      ...chart('fallback-operative', ['adj-opbox-1']),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }
    const quantityFillers = Array.from({ length: 9 }, (_, index) => ({
      ...chart(`fallback-quantity-${index}`),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }))
    const pool = [premiumCenter, ...quantityFillers]
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = Array(12).fill('b-rare-3') as Borders
    const result = suggestStrategies(emptyBoard(), borders, charts, pool, options)
    const alc = result.evaluations.find((entry) => entry.strategy.id === 'alc-and-go')!
    const speedrun = result.evaluations.find((entry) => entry.strategy.id === 'milky-speedrun')!
    const markup = renderToStaticMarkup(
      createElement(StrategySuggestions, {
        result: { ...result, suggestions: [alc, speedrun] },
        activeId: 'alc-and-go',
        onSelect: () => undefined,
      }),
    )

    assert.match(markup, /Recommended fallback/)
    assert.match(markup, /Best ready specialized alternative/)
    assert.match(markup, /Runnable alternative — select it to build this specialized layout/)
    assert.match(markup, /Combined fit/)
    assert.doesNotMatch(markup, /Best charts \+ border strategy/)
  })

  it('accepts 4k Wisps, but not 2k Wisps, as the Meatfish Pantheon substitute', () => {
    const meatfish = strategyById.get('milky-meatfish')!
    const otherPieces = [
      chart('wisp-star-1', ['adj-star-1']),
      chart('wisp-star-2', ['adj-star-2']),
      chart('wisp-pillar-1', [], 'Sea-Pillar Wisp A'),
      chart('wisp-pillar-2', [], 'Sea-Pillar Wisp B'),
      chart('wisp-lantern-1', ['adj-lantern']),
      chart('wisp-lantern-2', ['adj-lantern']),
      chart('wisp-possess', ['voy-possess']),
      chart('wisp-no-equipment', ['voy-noequip']),
    ]

    const withFourThousand = strategyReadiness(
      meatfish,
      [...otherPieces, chart('wisp-4000', ['adj-wisps-2'])],
      emptyBorders(),
      'any',
    )
    const withTwoThousand = strategyReadiness(
      meatfish,
      [...otherPieces, chart('wisp-2000', ['adj-wisps-1'])],
      emptyBorders(),
      'any',
    )

    assert.equal(withFourThousand.ready, true)
    assert.equal(withTwoThousand.ready, false)
    assert.ok(withTwoThousand.missing.some((entry) => /Pantheon \(or 4k Wisp\)/.test(entry)))
  })

  it('ranks from the full imported library instead of the manual board', () => {
    // Strategy discovery must use every imported chart, not only charts already
    // arranged on the manual board. Replacing the whole board with junk changes
    // only current-board diagnostics, never the library ranking or best-found fit.
    const pieces = [
      // Include a manual explicit so magnitude borders create a legitimate
      // current-board diagnostic difference without amplifying the implicit.
      chart('star-1', ['cm-quant-20', 'adj-star-1']),
      chart('star-2', ['adj-star-2']),
      chart('pantheon', ['adj-pantheon']),
      chart('pillar-1', [], 'Sea-Pillar Alpha'),
      chart('pillar-2', [], 'Sea-Pillar Beta'),
      chart('lantern-1', ['adj-lantern']),
      chart('lantern-2', ['adj-lantern']),
      chart('possess', ['voy-possess']),
      chart('no-equipment', ['voy-noequip']),
    ]
    const junk = Array.from({ length: 9 }, (_, index) => chart(`junk-${index}`))
    const pool = [...pieces, ...junk]
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const borders = Array(12).fill('b-mag-3')
    const pieceBoard = pieces.map((entry) => ({
      chartUid: entry.uid,
      rotation: 0,
    }))
    const junkBoard = junk.map((entry) => ({
      chartUid: entry.uid,
      rotation: 0,
    }))

    const withPiecesPlaced = suggestStrategies(pieceBoard, borders, charts, pool, options)
    const withPiecesUnplaced = suggestStrategies(junkBoard, borders, charts, pool, options)

    // Both candidates are below the absolute fit line. The complete Meatfish
    // recipe stays ahead instead of granting a contextual boost to weak Alc & Go.
    assert.equal(withPiecesUnplaced.suggestions[0].strategy.id, 'milky-meatfish')
    const weakMeatfish = withPiecesUnplaced.evaluations.find(
      (entry) => entry.strategy.id === 'milky-meatfish',
    )!
    const weakFallback = withPiecesUnplaced.evaluations.find(
      (entry) => entry.strategy.id === 'alc-and-go',
    )!
    assert.ok(weakMeatfish.fit !== null && weakMeatfish.fit < 0.5)
    assert.ok(weakFallback.fit === null || weakFallback.fit < 0.5)
    assert.deepEqual(
      withPiecesPlaced.evaluations.map((entry) => entry.strategy.id),
      withPiecesUnplaced.evaluations.map((entry) => entry.strategy.id),
    )
    assert.deepEqual(
      withPiecesPlaced.evaluations.map((entry) => entry.rankScore),
      withPiecesUnplaced.evaluations.map((entry) => entry.rankScore),
    )
    assert.deepEqual(
      withPiecesPlaced.evaluations.map((entry) => entry.fit),
      withPiecesUnplaced.evaluations.map((entry) => entry.fit),
    )
    assert.deepEqual(
      withPiecesPlaced.evaluations.map((entry) => entry.potentialBoard),
      withPiecesUnplaced.evaluations.map((entry) => entry.potentialBoard),
    )
    assert.notEqual(
      withPiecesPlaced.suggestions[0].currentFit,
      withPiecesUnplaced.suggestions[0].currentFit,
    )
  })

  it('lets the border roll change the winner between runnable strategies', () => {
    // With the same complete chart library, the border roll must be able to change
    // the winner between runnable strategies. Rare-monster borders favor Meatfish,
    // while quantity-per-connection borders favor Speedrun Strongboxes.
    const meatfishPieces = [
      chart('border-star-1', ['adj-star-1']),
      chart('border-star-2', ['adj-star-2']),
      chart('border-pantheon', ['adj-pantheon']),
      chart('border-pillar-1', [], 'Sea-Pillar Gamma'),
      chart('border-pillar-2', [], 'Sea-Pillar Delta'),
      chart('border-lantern-1', ['adj-lantern']),
      chart('border-lantern-2', ['adj-lantern']),
      chart('border-possess', ['voy-possess']),
      chart('border-no-equipment', ['voy-noequip']),
    ]
    const speedrunCenter = {
      ...chart('border-divbox', ['adj-divbox-1']),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }
    const filler = Array.from({ length: 9 }, (_, index) => ({
      ...chart(`border-filler-${index}`),
      rewards: [{ stat: 'quantity' as const, percent: 110 }],
    }))
    const pool = [...meatfishPieces, speedrunCenter, ...filler]
    const charts = new Map(pool.map((entry) => [entry.uid, entry]))
    const rareRoll = Array(12).fill('b-rare-3')
    const quantityRoll = Array(12).fill('b-quantconn-2')

    const rareResult = suggestStrategies(emptyBoard(), rareRoll, charts, pool, options)
    const quantityResult = suggestStrategies(emptyBoard(), quantityRoll, charts, pool, options)

    assert.equal(rareResult.suggestions[0].strategy.id, 'milky-meatfish')
    assert.equal(quantityResult.suggestions[0].strategy.id, 'milky-speedrun')
    assert.notEqual(
      rareResult.suggestions[0].strategy.id,
      quantityResult.suggestions[0].strategy.id,
    )
  })
})
