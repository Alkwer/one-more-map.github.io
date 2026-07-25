// Chart item-text importer, built against the real PoE 3.29 chart format.
//
// Real format (uncharted example):
//   Item Class: Chart
//   Rarity: Magic
//   Armoured Coral Reef Chart of Ice        <- name
//   --------
//   Seafloor Ridges                          <- deepwater area type
//   Area Level: 63
//   Item Quantity: +20% (augmented)          <- header reward stats (aggregated)
//   Gold Found: +50% (augmented)
//   --------
//   Item Level: 63
//   --------
//   { Implicit Modifier }
//   Voyage Modifier will be revealed once Charted   <- hidden until Charted
//   --------
//   Chart Shape: Straight                    <- connector shape
//   --------
//   { Prefix Modifier "Armoured" ... }
//   +8% Monster Physical Damage Reduction    <- explicit downsides
//   --------
//   Take this item to Valerie ...
//
// Charts must be Charted (implicit revealed) to be useful, so uncharted charts
// are rejected on import.

import { VOYAGE_MODS } from '../data/mods'
import type { ChartData, Edges, ModEffect, Stat } from '../types'

let uidCounter = 0
export function newUid(): string {
  uidCounter += 1
  return `c${Date.now().toString(36)}-${uidCounter}`
}

/** Chart Shape name -> connector edges [N,E,S,W]. Orientation is arbitrary
 *  (the solver can rotate); only the count/arrangement matters. */
const SHAPE_EDGES: Record<string, Edges> = {
  end: [true, false, false, false], // 1 connector
  corner: [true, true, false, false], // 2 adjacent (L)
  straight: [true, false, true, false], // 2 opposite (line)
  junction: [true, true, true, false], // 3 connectors (T)
  crossroads: [true, true, true, true], // 4 connectors (+)
  cross: [true, true, true, true],
}

/** header "quality" reward stats -> our Stat, matched by their labels */
const HEADER_STATS: { re: RegExp; stat: Stat }[] = [
  { re: /Item Quantity:\s*\+?(\d+)%/i, stat: 'quantity' },
  { re: /Item Rarity:\s*\+?(\d+)%/i, stat: 'rarity' },
  { re: /Gold Found:\s*\+?(\d+)%/i, stat: 'gold' },
  { re: /Dead Man's Sulphur:\s*\+?(\d+)%/i, stat: 'sulphur' },
  { re: /Pack Size:\s*\+?(\d+)%/i, stat: 'packsize' },
  { re: /Scarabs Found:\s*\+?(\d+)%/i, stat: 'scarabs' },
  { re: /Currency Found:\s*\+?(\d+)%/i, stat: 'currency' },
]

function normalise(s: string): string {
  return s.toLowerCase().replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim()
}

/** Match a revealed implicit line against the adjacent/voyage mod pool. */
function matchImplicit(line: string): string | null {
  const n = normalise(line)
  const pool = VOYAGE_MODS.filter((m) => m.scope !== 'self')
  const cands = pool.filter((m) => normalise(m.text) === n)
  if (cands.length === 0) return null
  if (cands.length === 1) return cands[0].id
  const num = parseFloat(line.match(/\d+/)?.[0] ?? '')
  if (isNaN(num)) return cands[0].id
  return cands.reduce((best, c) => {
    const cn = parseFloat(c.text.match(/\d+/)?.[0] ?? '')
    const bn = parseFloat(best.text.match(/\d+/)?.[0] ?? '')
    return Math.abs(cn - num) < Math.abs(bn - num) ? c : best
  }).id
}

export interface ParseResult {
  charts: ChartData[]
  /** uncharted / unrecognised items skipped, with a reason */
  rejected: { name: string; reason: string }[]
}

export function parseChartText(text: string): ParseResult {
  const items = text
    .split(/\n(?=Item Class:)/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const charts: ChartData[] = []
  const rejected: { name: string; reason: string }[] = []

  for (const item of items) {
    const lines = item.split('\n').map((l) => l.trim())
    const nameIdx = lines.findIndex((l) => /^Rarity:/i.test(l))
    const name = nameIdx >= 0 ? (lines[nameIdx + 1] ?? 'Unknown Chart') : 'Unknown Chart'

    if (!/Item Class:\s*Chart/i.test(item)) {
      rejected.push({ name, reason: 'not a Chart item' })
      continue
    }

    // uncharted: implicit not yet revealed -> reject
    if (/Voyage Modifier will be revealed once Charted/i.test(item)) {
      rejected.push({ name, reason: 'not charted yet (run it first to reveal its modifier)' })
      continue
    }

    const level = parseInt(item.match(/Area Level:\s*(\d+)/i)?.[1] ?? '80', 10)

    // header reward stats (aggregated totals shown as "Stat: +N%")
    const rewards: ModEffect[] = []
    for (const { re, stat } of HEADER_STATS) {
      const m = item.match(re)
      if (m) rewards.push({ stat, percent: parseInt(m[1], 10) })
    }

    // connector shape
    const shapeName = item.match(/Chart Shape:\s*([A-Za-z]+)/i)?.[1] ?? ''
    const edges: Edges = SHAPE_EDGES[shapeName.toLowerCase()] ?? [true, true, true, true]

    // revealed implicit: the line under "{ Implicit Modifier }"
    const modIds: string[] = []
    const implicitIdx = lines.findIndex((l) => /\{\s*Implicit Modifier\s*\}/i.test(l))
    if (implicitIdx >= 0) {
      const implicitLine = lines[implicitIdx + 1] ?? ''
      const id = matchImplicit(implicitLine)
      if (id) modIds.push(id)
    }

    // keep explicit downside lines as raw text (their reward part is already in
    // the header aggregate, so we do not score them again). Structural filter:
    // anything that is not a section marker, header field, {modifier header},
    // parenthetical note, header reward stat, or a "found in this Area" reward.
    const structural =
      /^(-{3,}|Item Class:|Rarity:|Area Level:|Item Level:|Requires|Chart Shape:|Take this item|Seafloor|Abyssal|Undersea|Anchorfield|Kishara)/i
    const rawLines = lines.filter(
      (l, idx) =>
        l &&
        idx !== nameIdx + 1 && // not the name line
        idx !== implicitIdx + 1 && // not the implicit line (already parsed)
        !structural.test(l) &&
        !/^\{.*\}$/.test(l) && // not a { modifier } header
        !l.startsWith('(') && // not a parenthetical explanation
        !/:\s*\+?\d+%/.test(l) && // not a header reward stat
        !/found in this Area/i.test(l) && // reward rider already in header
        !/Voyage Modifier will be revealed/i.test(l),
    )

    charts.push({
      uid: newUid(),
      name,
      level,
      edges,
      modIds,
      rewards: rewards.length ? rewards : undefined,
      shape: shapeName || undefined,
      rawText: rawLines.length ? rawLines.join('\n') : undefined,
    })
  }

  return { charts, rejected }
}
