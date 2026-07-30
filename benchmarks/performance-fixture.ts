import type { ChartData, Edges } from '../src/types'

const MOD_SETS = [
  ['cm-quant-20', 'adj-star-1'],
  ['cm-sulph-30', 'adj-star-2'],
  ['cm-rarity-18', 'adj-pantheon'],
  ['cm-pack-16', 'adj-lantern'],
  ['cm-gold-50', 'voy-possess'],
  ['cm-quant-28', 'adj-box-2'],
  ['cm-rarity-30', 'adj-ess-2'],
  ['cm-pack-18', 'voy-quant-1'],
]

const EDGES: Edges[] = [
  [true, true, true, true],
  [true, false, true, false],
  [false, true, false, true],
  [true, true, false, false],
  [false, true, true, false],
  [true, true, true, false],
]

export function createPerformanceFixture(count = 25): ChartData[] {
  return Array.from({ length: count }, (_, index) => ({
    uid: `performance-chart-${index + 1}`,
    name:
      index === 8 || index === 17
        ? `Sea-Pillar Performance ${index + 1}`
        : `Performance Chart ${index + 1}`,
    level: 83,
    edges: [...EDGES[index % EDGES.length]] as Edges,
    modIds: [...MOD_SETS[index % MOD_SETS.length]],
  }))
}
