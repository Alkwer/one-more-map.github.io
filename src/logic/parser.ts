// Chart item-text importer.
// ============================================================================
// LAUNCH-DAY TODO: the real Ctrl+C format for (Charted) Lost Charts is unknown
// pre-launch. This parser is written against the standard PoE item-text shape
// (sections separated by dash lines) and matches mod lines fuzzily against the
// known mod pool. Paste a real chart on day one and adjust.
// ============================================================================

import { VOYAGE_MODS } from '../data/mods'
import type { ChartData, Edges } from '../types'

let uidCounter = 0
export function newUid(): string {
  uidCounter += 1
  return `c${Date.now().toString(36)}-${uidCounter}`
}

const SECTION_SEP = /^-{4,}$/m

function normalise(s: string): string {
  return s.toLowerCase().replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim()
}

/** Match a mod line against the known pool, ignoring numeric values. */
function matchMod(line: string): string | null {
  const n = normalise(line.replace(/\s*\((implicit|enchant)\)\s*$/i, ''))
  for (const mod of VOYAGE_MODS) {
    if (normalise(mod.text) === n) return mod.id
  }
  return null
}

export interface ParseResult {
  charts: ChartData[]
  /** lines that looked like mods but matched nothing in the pool */
  unmatched: string[]
}

/**
 * Parse one or more items pasted from the game (items separated by blank
 * lines between full item blocks starting with "Item Class:").
 */
export function parseChartText(text: string): ParseResult {
  const items = text
    .split(/\n(?=Item Class:)/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const charts: ChartData[] = []
  const unmatched: string[] = []

  for (const item of items) {
    const sections = item.split(SECTION_SEP).map((s) => s.trim()).filter(Boolean)
    if (sections.length === 0) continue

    // header: Item Class / Rarity / name lines
    const headerLines = sections[0].split('\n').map((l) => l.trim())
    const nameLine =
      headerLines.filter((l) => !/^(item class|rarity):/i.test(l)).pop() ?? 'Unknown Chart'

    const levelMatch = item.match(/(?:chart\s+)?area level:\s*(\d+)/i) ?? item.match(/item level:\s*(\d+)/i)
    const level = levelMatch ? parseInt(levelMatch[1], 10) : 80

    const modIds: string[] = []
    const rawLines: string[] = []
    for (const section of sections.slice(1)) {
      for (const line of section.split('\n').map((l) => l.trim())) {
        if (!line || /:/.test(line.split(' ')[0])) continue
        if (/^(corrupted|unidentified|charted)$/i.test(line)) continue
        const id = matchMod(line)
        if (id) modIds.push(id)
        else if (/%|more|increased|chance|drop/i.test(line)) {
          rawLines.push(line)
          unmatched.push(line)
        }
      }
    }

    // Connector shape is (probably) not in item text — default to all edges
    // open; the user can toggle edges in the library. Revisit on launch day.
    const edges: Edges = [true, true, true, true]

    charts.push({
      uid: newUid(),
      name: nameLine,
      level,
      edges,
      modIds,
      rawText: rawLines.length ? rawLines.join('\n') : undefined,
    })
  }

  return { charts, unmatched }
}
