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
  crossing: [true, true, true, true], // 4 connectors (+)
  crossroads: [true, true, true, true], // alias
  cross: [true, true, true, true], // alias
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

// Common filler words dropped when matching, so wording/pluralisation/number
// differences between the game text and our stored text don't block a match.
const STOP = new Set(
  (
    'a an the of in on to be by and or per this that all are is it as at with for ' +
    'additional adjacent area areas contain contains contained chance found more less ' +
    'increased reduced number numbers dropped drop drops gain gains will would have has ' +
    'natural inhabitants monster monsters players player instead'
  ).split(/\s+/),
)
const stem = (w: string): string => w.replace(/(es|s)$/, '')

/** distinctive keywords of a mod line (lowercase, stemmed, filler removed) */
function sigWords(s: string): string[] {
  const out = new Set<string>()
  for (const w of s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop "(8-10)" value ranges
    .replace(/[^a-z ]+/g, ' ')
    .split(/\s+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(stem(w))
  }
  return [...out]
}

/** Match a revealed implicit line against the adjacent/voyage mod pool by
 *  keyword overlap, tie-broken by specificity then closest tier value. */
function matchImplicit(line: string): string | null {
  const lineWords = new Set(sigWords(line))
  if (lineWords.size === 0) return null
  const lineNum = parseFloat(line.replace(/\([^)]*\)/g, ' ').match(/\d+/)?.[0] ?? '')
  const scored = VOYAGE_MODS.filter((m) => m.scope !== 'self')
    .map((m) => {
      const mw = sigWords(m.text)
      const covered = mw.filter((w) => lineWords.has(w)).length
      return { m, mwLen: mw.length, ratio: mw.length ? covered / mw.length : 0 }
    })
    .filter((x) => x.ratio >= 0.6)
  if (scored.length === 0) return null
  scored.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio
    if (b.mwLen !== a.mwLen) return b.mwLen - a.mwLen // prefer the more specific mod
    if (!isNaN(lineNum)) {
      const an = parseFloat(a.m.text.match(/\d+/)?.[0] ?? 'NaN')
      const bn = parseFloat(b.m.text.match(/\d+/)?.[0] ?? 'NaN')
      return (isNaN(an) ? 1e9 : Math.abs(an - lineNum)) - (isNaN(bn) ? 1e9 : Math.abs(bn - lineNum))
    }
    return 0
  })
  return scored[0].m.id
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
