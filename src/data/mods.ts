// ============================================================================
// Mod pools — updated 2026-07-24 (launch day) from poewiki.net/wiki/Voyage.
// Wiki is still marked incomplete; numeric values in parentheses were partly
// ranges. Effects use representative values; count-based mods ("+2 strongboxes")
// use heuristic percent values for scoring. Verify against in-game text and
// extend as the community datamines the full pools.
// ============================================================================

import type { BorderModDef, VoyageModDef } from '../types'

export const VOYAGE_MODS: VoyageModDef[] = [
  // --- self scope: chart area mods (wiki "voyage modifiers" list) ---
  { id: 'self-sulphur', text: "15% increased Dead Man's Sulphur found in this Area", scope: 'self', effects: [{ stat: 'sulphur', percent: 15 }] },
  { id: 'self-quant', text: '10% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 10 }] },
  { id: 'self-rarity', text: '7% increased Rarity of Items found in this Area', scope: 'self', effects: [{ stat: 'rarity', percent: 7 }] },
  { id: 'self-magic', text: '20% increased Magic Monsters', scope: 'self', effects: [{ stat: 'magicmonsters', percent: 20 }] },
  { id: 'self-jelly', text: 'Area contains Friendly Jellyfish', scope: 'self', effects: [] },

  // --- adjacent scope: chart implicits (wiki "adjacent modifiers" list) ---
  { id: 'adj-gold', text: '40% of Equipment dropped by monsters in adjacent Areas is converted to Gold', scope: 'adjacent', effects: [{ stat: 'gold', percent: 40 }] },
  { id: 'adj-wisps', text: 'Monsters have a chance to be Empowered by Wildwood Wisps', scope: 'adjacent', effects: [{ stat: 'wisps', percent: 100 }] },
  { id: 'adj-essences', text: 'Adjacent Areas contain 3 additional Imprisoned Monsters', scope: 'adjacent', effects: [{ stat: 'essences', percent: 150 }] },
  { id: 'adj-divboxes', text: "Adjacent Areas contain 2 additional Diviner's Strongboxes", scope: 'adjacent', effects: [{ stat: 'divcards', percent: 100 }] },
  { id: 'adj-opboxes', text: "Adjacent Areas contain 2 additional Operative's Strongboxes", scope: 'adjacent', effects: [{ stat: 'scarabs', percent: 100 }] },
  { id: 'adj-spirits', text: 'Adjacent Areas contain 2 additional cages of Tormented Spirits', scope: 'adjacent', effects: [{ stat: 'spirits', percent: 100 }] },

  // --- global scope: voyage-wide implicits (examples from reveal coverage; real pool TBC) ---
  { id: 'glob-currency', text: '10% more Currency found in this Voyage', scope: 'global', effects: [{ stat: 'currency', percent: 10 }] },
  { id: 'glob-quant', text: '15% increased Quantity of Items found in this Voyage', scope: 'global', effects: [{ stat: 'quantity', percent: 15 }] },
  { id: 'glob-preserve', text: '20% chance for Charts to not be consumed on Voyage completion', scope: 'global', effects: [{ stat: 'preserve', percent: 20 }] },
  { id: 'glob-sulphur', text: "15% more Dead Man's Sulphur found in this Voyage", scope: 'global', effects: [{ stat: 'sulphur', percent: 15 }] },
]

// Border segments ("Corruption Currents", rerolled each Voyage). The wiki says
// they draw from the adjacent-modifier pool; reveal-stream examples kept too.
export const BORDER_MODS: BorderModDef[] = [
  // meta-mod seen in ZiggyD's hands-on: multiplies the touched chart's own mods
  { id: 'b-magnitude', text: 'Adjacent Areas have 60% increased explicit Modifier magnitude', effects: [], magnitude: 60 },
  { id: 'b-gold', text: '40% of Equipment dropped by monsters in adjacent Areas is converted to Gold', effects: [{ stat: 'gold', percent: 40 }] },
  { id: 'b-wisps', text: 'Monsters have a chance to be Empowered by Wildwood Wisps', effects: [{ stat: 'wisps', percent: 100 }] },
  { id: 'b-essences', text: 'Adjacent Areas contain 3 additional Imprisoned Monsters', effects: [{ stat: 'essences', percent: 150 }] },
  { id: 'b-divboxes', text: "Adjacent Areas contain 2 additional Diviner's Strongboxes", effects: [{ stat: 'divcards', percent: 100 }] },
  { id: 'b-opboxes', text: "Adjacent Areas contain 2 additional Operative's Strongboxes", effects: [{ stat: 'scarabs', percent: 100 }] },
  { id: 'b-spirits', text: 'Adjacent Areas contain 2 additional cages of Tormented Spirits', effects: [{ stat: 'spirits', percent: 100 }] },
  // reveal-stream examples (values approximate)
  { id: 'b-currency', text: '50% more Currency found in adjacent Areas', effects: [{ stat: 'currency', percent: 50 }] },
  { id: 'b-rares', text: '100% increased number of Rare Monsters in adjacent Areas', effects: [{ stat: 'rares', percent: 100 }] },
  { id: 'b-scarabs', text: '75% more Scarabs found in adjacent Areas', effects: [{ stat: 'scarabs', percent: 75 }] },
  { id: 'b-preserve', text: '30% chance Charts in adjacent Areas are not consumed', effects: [{ stat: 'preserve', percent: 30 }] },
  { id: 'b-sulphur', text: "Rare Monsters in adjacent Areas drop Dead Man's Sulphur", effects: [{ stat: 'sulphur', percent: 100 }] },
  { id: 'b-pack', text: '40% increased Pack Size in adjacent Areas', effects: [{ stat: 'packsize', percent: 40 }] },
  { id: 'b-quant', text: '25% increased Quantity of Items in adjacent Areas', effects: [{ stat: 'quantity', percent: 25 }] },
]

export const voyageModById = new Map(VOYAGE_MODS.map((m) => [m.id, m]))
export const borderModById = new Map(BORDER_MODS.map((m) => [m.id, m]))
