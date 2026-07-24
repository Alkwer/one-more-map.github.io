// Build a compact search string for the in-game chart inventory search box
// ("Type keywords here..."), to highlight exactly the charts a solved board
// uses. Uses shortest-unique-substring per chart name (poe.re style) so the
// string stays short.
// LAUNCH-DAY TODO: confirm what fields the in-game search matches (name, mod
// text, level?) and whether it supports regex alternation `|` — adjust here.

import { VOYAGE_MODS } from '../data/mods'
import type { VoyageModDef, Weights } from '../types'

/**
 * Build a paste-into-game regex that highlights the BEST charts given the
 * user's reward weights — no import needed. Mods are ranked by weighted value
 * times scope reach (a global mod touches 9 areas, adjacent ~3, self 1), then
 * greedily added as shortest-unique text fragments until the length cap.
 * Fragments use letters/spaces only so rolled numeric values don't break them.
 */
export function buildBestModRegex(
  weights: Weights,
  cap = 50,
): { regex: string; included: VoyageModDef[] } {
  const reach = { self: 1, adjacent: 3, global: 9 } as const
  const scored = VOYAGE_MODS.map((m) => ({
    m,
    v: m.effects.reduce((s, e) => s + (weights[e.stat] ?? 0) * e.percent, 0) * reach[m.scope],
  }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)

  const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim()

  const token = (mod: VoyageModDef, others: VoyageModDef[]): string => {
    const text = lettersOnly(mod.text)
    const otherTexts = others.map((o) => lettersOnly(o.text))
    for (let len = 3; len <= text.length; len++) {
      for (let i = 0; i + len <= text.length; i++) {
        const sub = text.slice(i, i + len)
        if (sub !== sub.trim()) continue
        if (!otherTexts.some((t) => t.includes(sub))) return sub
      }
    }
    return text
  }

  const included: VoyageModDef[] = []
  const tokens: string[] = []
  for (const { m } of scored) {
    const others = VOYAGE_MODS.filter((o) => o !== m && !included.includes(o))
    const t = token(m, others)
    const candidate = [...tokens, t].join('|')
    if (candidate.length > cap) break
    tokens.push(t)
    included.push(m)
  }
  return { regex: tokens.join('|'), included }
}

export function buildChartSearch(targets: string[], otherPoolNames: string[]): string {
  const targetSet = new Set(targets.map((t) => t.toLowerCase()))
  const others = otherPoolNames.map((s) => s.toLowerCase()).filter((o) => !targetSet.has(o))

  const parts: string[] = []
  for (const name of targetSet) {
    let best: string | null = null
    for (let len = 3; len <= name.length && !best; len++) {
      for (let i = 0; i + len <= name.length; i++) {
        const sub = name.slice(i, i + len)
        if (sub !== sub.trim()) continue
        if (!others.some((o) => o.includes(sub))) {
          best = sub
          break
        }
      }
    }
    parts.push(best ?? name)
  }
  return [...new Set(parts)].join('|')
}
