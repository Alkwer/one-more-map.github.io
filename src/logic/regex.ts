// Build a compact search string for the in-game chart inventory search box
// ("Type keywords here..."), to highlight exactly the charts a solved board
// uses. Uses shortest-unique-substring per chart name (poe.re style) so the
// string stays short.
// LAUNCH-DAY TODO: confirm what fields the in-game search matches (name, mod
// text, level?) and whether it supports regex alternation `|` — adjust here.

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
