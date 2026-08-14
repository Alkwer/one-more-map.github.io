import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateAssetBudgets } from './check-asset-sizes.mjs'

const assets = {
  'public/bg.webp': { maxBytes: 409_600 },
  'public/bg-mobile.webp': {
    maxBytes: 102_400,
    mustBeSmallerThan: 'public/bg.webp',
  },
}

test('accepts assets that stay within their budgets', () => {
  assert.deepEqual(
    evaluateAssetBudgets(assets, {
      'public/bg.webp': 128_426,
      'public/bg-mobile.webp': 61_714,
    }),
    [],
  )
})

test('reports missing, oversized, and incorrectly ordered responsive assets', () => {
  assert.deepEqual(
    evaluateAssetBudgets(assets, {
      'public/bg.webp': 100_000,
      'public/bg-mobile.webp': 110_000,
    }),
    [
      'public/bg-mobile.webp: 110000 B exceeds 102400 B',
      'public/bg-mobile.webp: 110000 B must be smaller than public/bg.webp (100000 B)',
    ],
  )

  assert.deepEqual(evaluateAssetBudgets(assets, { 'public/bg.webp': 100_000 }), [
    'public/bg-mobile.webp: file is missing',
  ])
})
