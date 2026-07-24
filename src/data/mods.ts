// ============================================================================
// PLACEHOLDER DATA — built pre-launch from the 3.29 reveal stream coverage.
// LAUNCH-DAY TODO: replace with the real mod pools (poedb / poewiki / in-game
// Ctrl+C text) and real numeric values. Keep ids stable where possible so
// saved pools keep working.
// ============================================================================

import type { BorderModDef, VoyageModDef } from '../types'

export const VOYAGE_MODS: VoyageModDef[] = [
  // --- self scope ---
  { id: 'self-currency', text: '30% more Currency found in this Area', scope: 'self', effects: [{ stat: 'currency', percent: 30 }] },
  { id: 'self-scarabs', text: '40% more Scarabs found in this Area', scope: 'self', effects: [{ stat: 'scarabs', percent: 40 }] },
  { id: 'self-rares', text: '60% increased number of Rare Monsters in this Area', scope: 'self', effects: [{ stat: 'rares', percent: 60 }] },
  { id: 'self-pack', text: '25% increased Pack Size in this Area', scope: 'self', effects: [{ stat: 'packsize', percent: 25 }] },
  { id: 'self-sulphur', text: "Rare Monsters in this Area drop Dead Man's Sulphur", scope: 'self', effects: [{ stat: 'sulphur', percent: 100 }] },
  { id: 'self-quant', text: '20% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 20 }] },

  // --- adjacent scope ---
  { id: 'adj-currency', text: '20% more Currency found in adjacent Areas', scope: 'adjacent', effects: [{ stat: 'currency', percent: 20 }] },
  { id: 'adj-scarabs', text: '25% more Scarabs found in adjacent Areas', scope: 'adjacent', effects: [{ stat: 'scarabs', percent: 25 }] },
  { id: 'adj-rares', text: '50% increased number of Rare Monsters in adjacent Areas', scope: 'adjacent', effects: [{ stat: 'rares', percent: 50 }] },
  { id: 'adj-pack', text: '15% increased Pack Size in adjacent Areas', scope: 'adjacent', effects: [{ stat: 'packsize', percent: 15 }] },
  { id: 'adj-quant', text: '10% increased Quantity of Items found in adjacent Areas', scope: 'adjacent', effects: [{ stat: 'quantity', percent: 10 }] },

  // --- global scope ---
  { id: 'glob-currency', text: '10% more Currency found in this Voyage', scope: 'global', effects: [{ stat: 'currency', percent: 10 }] },
  { id: 'glob-quant', text: '15% increased Quantity of Items found in this Voyage', scope: 'global', effects: [{ stat: 'quantity', percent: 15 }] },
  { id: 'glob-preserve', text: '20% chance for Charts to not be consumed on Voyage completion', scope: 'global', effects: [{ stat: 'preserve', percent: 20 }] },
  { id: 'glob-sulphur', text: "15% more Dead Man's Sulphur found in this Voyage", scope: 'global', effects: [{ stat: 'sulphur', percent: 15 }] },
]

// Border mod examples were shown on the reveal stream (values approximate).
export const BORDER_MODS: BorderModDef[] = [
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
