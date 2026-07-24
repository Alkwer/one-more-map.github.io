// ============================================================================
// 3.29 mod pools — from datamined mod lists (launch day, 2026-07-24).
// Reward stat mappings + heuristic values for count-based mods are ours;
// mod texts and numbers are the game's. Ranges use representative mid values.
// ============================================================================

import type { BorderModDef, VoyageModDef } from '../types'

// ---------------------------------------------------------------------------
// Chart map-mods (magic prefix/suffix): a reward line + downside line(s).
// Only the reward line carries scoring effects; downsides are kept in text.
// One entry per family tier (Low → VeryHigh) so values stay accurate.
// ---------------------------------------------------------------------------
const chartMapMods: VoyageModDef[] = [
  // Canonical reward lines (families share these; downside lines vary and are
  // kept as raw text on import). Tiers: quantity 20/28/32/45, sulphur 30/45,
  // rarity 12/18/20/30, pack 14/16/18, gold 50/70.
  { id: 'cm-quant-20', text: '20% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 20 }] },
  { id: 'cm-quant-28', text: '28% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 28 }] },
  { id: 'cm-quant-32', text: '32% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 32 }] },
  { id: 'cm-quant-45', text: '45% increased Quantity of Items found in this Area', scope: 'self', effects: [{ stat: 'quantity', percent: 45 }] },
  { id: 'cm-sulph-30', text: "30% increased Dead Man's Sulphur found in this Area", scope: 'self', effects: [{ stat: 'sulphur', percent: 30 }] },
  { id: 'cm-sulph-45', text: "45% increased Dead Man's Sulphur found in this Area", scope: 'self', effects: [{ stat: 'sulphur', percent: 45 }] },
  { id: 'cm-rarity-12', text: '12% increased Rarity of Items found in this Area', scope: 'self', effects: [{ stat: 'rarity', percent: 12 }] },
  { id: 'cm-rarity-18', text: '18% increased Rarity of Items found in this Area', scope: 'self', effects: [{ stat: 'rarity', percent: 18 }] },
  { id: 'cm-rarity-20', text: '20% increased Rarity of Items found in this Area', scope: 'self', effects: [{ stat: 'rarity', percent: 20 }] },
  { id: 'cm-rarity-30', text: '30% increased Rarity of Items found in this Area', scope: 'self', effects: [{ stat: 'rarity', percent: 30 }] },
  { id: 'cm-pack-14', text: '14% increased Pack size', scope: 'self', effects: [{ stat: 'packsize', percent: 14 }] },
  { id: 'cm-pack-16', text: '16% increased Pack size', scope: 'self', effects: [{ stat: 'packsize', percent: 16 }] },
  { id: 'cm-pack-18', text: '18% increased Pack size', scope: 'self', effects: [{ stat: 'packsize', percent: 18 }] },
  { id: 'cm-gold-50', text: '50% increased Gold found in this Area', scope: 'self', effects: [{ stat: 'gold', percent: 50 }] },
  { id: 'cm-gold-70', text: '70% increased Gold found in this Area', scope: 'self', effects: [{ stat: 'gold', percent: 70 }] },
]

// ---------------------------------------------------------------------------
// Chart implicits — Adjacent pool (revealed on charting)
// ---------------------------------------------------------------------------
const adjacentImplicits: VoyageModDef[] = [
  { id: 'adj-ess-1', text: 'Adjacent Areas contain 1-2 additional Imprisoned Monsters', scope: 'adjacent', effects: [{ stat: 'essences', percent: 75 }] },
  { id: 'adj-ess-2', text: 'Adjacent Areas contain 2-4 additional Imprisoned Monsters', scope: 'adjacent', effects: [{ stat: 'essences', percent: 150 }] },
  { id: 'adj-ess-3', text: 'Adjacent Areas contain 5 additional Imprisoned Monsters', scope: 'adjacent', effects: [{ stat: 'essences', percent: 250 }] },
  { id: 'adj-box-1', text: 'Adjacent Areas contain an additional Strongbox', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 50 }] },
  { id: 'adj-box-2', text: 'Adjacent Areas contain 2-4 additional Strongboxes', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 150 }] },
  { id: 'adj-box-3', text: 'Adjacent Areas contain 5 additional Strongboxes', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 250 }] },
  { id: 'adj-octo-1', text: 'Area contains 8-10 additional packs of Octopi', scope: 'self', effects: [{ stat: 'packsize', percent: 45 }] },
  { id: 'adj-octo-2', text: 'Area contains 11-14 additional packs of Octopi', scope: 'self', effects: [{ stat: 'packsize', percent: 62 }] },
  { id: 'adj-crab-1', text: 'Area contains 8-10 additional packs of Crabs', scope: 'self', effects: [{ stat: 'packsize', percent: 45 }] },
  { id: 'adj-crab-2', text: 'Area contains 11-14 additional packs of Crabs', scope: 'self', effects: [{ stat: 'packsize', percent: 62 }] },
  { id: 'adj-magic-1', text: '30% increased Magic Monsters', scope: 'adjacent', effects: [{ stat: 'magicmonsters', percent: 30 }] },
  { id: 'adj-magic-2', text: '60% increased Magic Monsters', scope: 'adjacent', effects: [{ stat: 'magicmonsters', percent: 60 }] },
  { id: 'adj-rare-1', text: '30% increased number of Rare Monsters', scope: 'adjacent', effects: [{ stat: 'rares', percent: 30 }] },
  { id: 'adj-rare-2', text: '60% increased number of Rare Monsters', scope: 'adjacent', effects: [{ stat: 'rares', percent: 60 }] },
  { id: 'adj-msg-1', text: 'Adjacent Areas contain an additional Message in a Bottle', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 40 }] },
  { id: 'adj-msg-2', text: 'Adjacent Areas contain 2 additional Messages in Bottles', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 80 }] },
  { id: 'adj-fish', text: 'Adjacent Areas contain highly prized and exotic Fish', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 60 }] },
  { id: 'adj-wisps-1', text: 'Monsters have a chance to be Empowered by 2000 Wildwood Wisps', scope: 'adjacent', effects: [{ stat: 'wisps', percent: 100 }] },
  { id: 'adj-wisps-2', text: 'Monsters have a chance to be Empowered by 4000 Wildwood Wisps', scope: 'adjacent', effects: [{ stat: 'wisps', percent: 200 }] },
  { id: 'adj-atziri', text: "Atziri's Influence", scope: 'adjacent', effects: [{ stat: 'treasure', percent: 100 }] },
  { id: 'adj-gold-1', text: '40% of Equipment dropped by Monsters in Area is converted to Gold', scope: 'self', effects: [{ stat: 'gold', percent: 40 }] },
  { id: 'adj-gold-2', text: '80% of Equipment dropped by Monsters in Area is converted to Gold', scope: 'self', effects: [{ stat: 'gold', percent: 80 }] },
  { id: 'adj-spirit-1', text: 'Adjacent Areas contain an additional cage of Tormented Spirits', scope: 'adjacent', effects: [{ stat: 'spirits', percent: 60 }] },
  { id: 'adj-spirit-2', text: 'Adjacent Areas contain 2 additional cages of Tormented Spirits', scope: 'adjacent', effects: [{ stat: 'spirits', percent: 120 }] },
  { id: 'adj-divbox-1', text: "Adjacent Areas contain 2 additional Diviner's Strongboxes", scope: 'adjacent', effects: [{ stat: 'divcards', percent: 100 }] },
  { id: 'adj-divbox-2', text: "Adjacent Areas contain 3 additional Diviner's Strongboxes", scope: 'adjacent', effects: [{ stat: 'divcards', percent: 150 }] },
  { id: 'adj-arcbox-1', text: "Adjacent Areas contain 2 additional Arcanist's Strongboxes", scope: 'adjacent', effects: [{ stat: 'currency', percent: 100 }] },
  { id: 'adj-arcbox-2', text: "Adjacent Areas contain 3 additional Arcanist's Strongboxes", scope: 'adjacent', effects: [{ stat: 'currency', percent: 150 }] },
  { id: 'adj-opbox-1', text: "Adjacent Areas contain 2 additional Operative's Strongboxes", scope: 'adjacent', effects: [{ stat: 'scarabs', percent: 100 }] },
  { id: 'adj-opbox-2', text: "Adjacent Areas contain 3 additional Operative's Strongboxes", scope: 'adjacent', effects: [{ stat: 'scarabs', percent: 150 }] },
  { id: 'adj-barrel-1', text: 'Area contains 12-15 additional Clusters of Mysterious Barrels', scope: 'self', effects: [{ stat: 'treasure', percent: 50 }] },
  { id: 'adj-barrel-2', text: 'Area contains 16-20 additional Clusters of Mysterious Barrels', scope: 'self', effects: [{ stat: 'treasure', percent: 70 }] },
  { id: 'adj-star-1', text: 'Adjacent Areas contains 4-5 additional Giant Starfish', scope: 'adjacent', effects: [{ stat: 'packsize', percent: 25 }] },
  { id: 'adj-star-2', text: 'Adjacent Areas contains 6-7 additional Giant Starfish', scope: 'adjacent', effects: [{ stat: 'packsize', percent: 35 }] },
  { id: 'adj-lantern', text: 'Adjacent Areas contain 4 additional Golden Lanterns', scope: 'adjacent', effects: [{ stat: 'treasure', percent: 60 }] },
  { id: 'adj-pantheon', text: 'Rare Monsters in adjacent Areas will have a Pantheon Modifier', scope: 'adjacent', effects: [{ stat: 'rares', percent: 50 }] },
  { id: 'adj-uring-1', text: 'Rings dropped in adjacent Areas have 10% chance to instead drop as a Unique Ring', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 50 }] },
  { id: 'adj-uring-2', text: 'Rings dropped in adjacent Areas have 20% chance to instead drop as a Unique Ring', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 100 }] },
  { id: 'adj-uamu-1', text: 'Amulets dropped in adjacent Areas have 10% chance to instead drop as a Unique Amulet', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 50 }] },
  { id: 'adj-uamu-2', text: 'Amulets dropped in adjacent Areas have 20% chance to instead drop as a Unique Amulet', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 100 }] },
  { id: 'adj-ubelt-1', text: 'Belts dropped in adjacent Areas have 10% chance to instead drop as a Unique Belt', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 50 }] },
  { id: 'adj-ubelt-2', text: 'Belts dropped in adjacent Areas have 20% chance to instead drop as a Unique Belt', scope: 'adjacent', effects: [{ stat: 'uniques', percent: 100 }] },
]

// ---------------------------------------------------------------------------
// Chart implicits — Voyage (global) pool
// ---------------------------------------------------------------------------
const voyageImplicits: VoyageModDef[] = [
  { id: 'voy-soul', text: 'Players in Area have Soul Eater', scope: 'global', effects: [] },
  { id: 'voy-pack-1', text: '5% increased Pack size', scope: 'global', effects: [{ stat: 'packsize', percent: 5 }] },
  { id: 'voy-pack-2', text: '7% increased Pack size', scope: 'global', effects: [{ stat: 'packsize', percent: 7 }] },
  { id: 'voy-quant-1', text: '8% increased Quantity of Items found in this Area', scope: 'global', effects: [{ stat: 'quantity', percent: 8 }] },
  { id: 'voy-quant-2', text: '10% increased Quantity of Items found in this Area', scope: 'global', effects: [{ stat: 'quantity', percent: 10 }] },
  { id: 'voy-rarity-1', text: '7% increased Rarity of Items found in this Area', scope: 'global', effects: [{ stat: 'rarity', percent: 7 }] },
  { id: 'voy-rarity-2', text: '9% increased Rarity of Items found in this Area', scope: 'global', effects: [{ stat: 'rarity', percent: 9 }] },
  { id: 'voy-jelly', text: 'Area contains Friendly Jellyfish — all Voyage Areas contain Friendly Jellyfish', scope: 'global', effects: [] },
  { id: 'voy-sulph-1', text: "15% increased Dead Man's Sulphur found in this Area", scope: 'global', effects: [{ stat: 'sulphur', percent: 15 }] },
  { id: 'voy-sulph-2', text: "20% increased Dead Man's Sulphur found in this Area", scope: 'global', effects: [{ stat: 'sulphur', percent: 20 }] },
  { id: 'voy-sulph-3', text: "25% increased Dead Man's Sulphur found in this Area", scope: 'global', effects: [{ stat: 'sulphur', percent: 25 }] },
  { id: 'voy-rare', text: '25% increased number of Rare Monsters', scope: 'global', effects: [{ stat: 'rares', percent: 25 }] },
  { id: 'voy-magic', text: '25% increased Magic Monsters', scope: 'global', effects: [{ stat: 'magicmonsters', percent: 25 }] },
  { id: 'voy-noequip', text: 'Monsters in all Voyage Areas cannot drop Equipment, Flasks or Tinctures', scope: 'global', effects: [] },
  { id: 'voy-minmagic', text: 'Monsters in Area are at least Magic', scope: 'global', effects: [{ stat: 'magicmonsters', percent: 60 }] },
  { id: 'voy-possess', text: '100% chance for Rare Monsters in Area to be Possessed', scope: 'global', effects: [{ stat: 'spirits', percent: 100 }] },
  { id: 'voy-essence', text: 'Rare monsters that are natural inhabitants are imprisoned by Essences', scope: 'global', effects: [{ stat: 'essences', percent: 100 }] },
  { id: 'voy-fracture', text: '50% chance for Rare Monsters to Fracture on death', scope: 'global', effects: [{ stat: 'rares', percent: 50 }] },
  { id: 'voy-flask', text: 'Flasks found in all Voyage Areas have 100% chance to have 20% Quality', scope: 'global', effects: [] },
]

export const VOYAGE_MODS: VoyageModDef[] = [...chartMapMods, ...adjacentImplicits, ...voyageImplicits]

// ---------------------------------------------------------------------------
// Border pool ("Corruption Currents") — applies to the touched Area
// ---------------------------------------------------------------------------
export const BORDER_MODS: BorderModDef[] = [
  { id: 'b-pack-1', text: '16% increased Pack size', effects: [{ stat: 'packsize', percent: 16 }] },
  { id: 'b-pack-2', text: '24% increased Pack size', effects: [{ stat: 'packsize', percent: 24 }] },
  { id: 'b-pack-3', text: '32% increased Pack size', effects: [{ stat: 'packsize', percent: 32 }] },
  { id: 'b-minmagic', text: 'Monsters in Area are at least Magic', effects: [{ stat: 'magicmonsters', percent: 60 }] },
  { id: 'b-rare-1', text: '50% increased number of Rare Monsters', effects: [{ stat: 'rares', percent: 50 }] },
  { id: 'b-rare-2', text: '75% increased number of Rare Monsters', effects: [{ stat: 'rares', percent: 75 }] },
  { id: 'b-rare-3', text: '100% increased number of Rare Monsters', effects: [{ stat: 'rares', percent: 100 }] },
  { id: 'b-beasts-1', text: 'Area contains 8 additional packs of Sea Beasts', effects: [{ stat: 'packsize', percent: 40 }] },
  { id: 'b-beasts-2', text: 'Area contains 12 additional packs of Sea Beasts', effects: [{ stat: 'packsize', percent: 60 }] },
  { id: 'b-beasts-3', text: 'Area contains 16 additional packs of Sea Beasts', effects: [{ stat: 'packsize', percent: 80 }] },
  { id: 'b-crabs-1', text: 'Area contains 8 additional packs of Crabs', effects: [{ stat: 'packsize', percent: 40 }] },
  { id: 'b-crabs-2', text: 'Area contains 12 additional packs of Crabs', effects: [{ stat: 'packsize', percent: 60 }] },
  { id: 'b-crabs-3', text: 'Area contains 16 additional packs of Crabs', effects: [{ stat: 'packsize', percent: 80 }] },
  { id: 'b-drowned-1', text: 'Area contains 8 additional packs of Drowned', effects: [{ stat: 'packsize', percent: 40 }] },
  { id: 'b-drowned-2', text: 'Area contains 12 additional packs of Drowned', effects: [{ stat: 'packsize', percent: 60 }] },
  { id: 'b-drowned-3', text: 'Area contains 16 additional packs of Drowned', effects: [{ stat: 'packsize', percent: 80 }] },
  { id: 'b-mag-1', text: 'Adjacent Areas have 40% increased explicit modifier magnitudes', effects: [], magnitude: 40 },
  { id: 'b-mag-2', text: 'Adjacent Areas have 60% increased explicit modifier magnitudes', effects: [], magnitude: 60 },
  { id: 'b-mag-3', text: 'Adjacent Areas have 80% increased explicit modifier magnitudes', effects: [], magnitude: 80 },
  { id: 'b-keep-1', text: 'Adjacent Charts have 30% chance to not be consumed when beginning a Voyage', effects: [{ stat: 'preserve', percent: 30 }] },
  { id: 'b-keep-2', text: 'Adjacent Charts have 50% chance to not be consumed when beginning a Voyage', effects: [{ stat: 'preserve', percent: 50 }] },
  { id: 'b-octoboss', text: 'Area contains Filthscrabble', effects: [{ stat: 'treasure', percent: 60 }] },
  { id: 'b-lanterns', text: 'Placing Lanterns does not reduce your Lantern count in adjacent Areas', effects: [{ stat: 'sulphur', percent: 40 }] },
  { id: 'b-ancient', text: 'Rare Monsters in Area drop an additional Ancient Orb', effects: [{ stat: 'currency', percent: 120 }] },
  { id: 'b-divine', text: 'Rare Monsters in Area drop an additional Divine Orb', effects: [{ stat: 'currency', percent: 300 }] },
  { id: 'b-exalt', text: 'Rare Monsters in Area drop an additional Exalted Orb', effects: [{ stat: 'currency', percent: 150 }] },
  { id: 'b-annul', text: 'Rare Monsters in Area drop an additional Annulment Orb', effects: [{ stat: 'currency', percent: 80 }] },
  { id: 'b-chaos', text: 'Rare Monsters in Area drop an additional Chaos Orb', effects: [{ stat: 'currency', percent: 60 }] },
  { id: 'b-vaal', text: 'Rare Monsters in Area drop an additional Vaal Orb', effects: [{ stat: 'currency', percent: 40 }] },
  { id: 'b-gcp', text: "Rare Monsters in Area drop an additional Gemcutter's Prism", effects: [{ stat: 'currency', percent: 35 }] },
  { id: 'b-chrome', text: 'Rare Monsters in Area drop an additional Chromatic Orb', effects: [{ stat: 'currency', percent: 10 }] },
  { id: 'b-regret', text: 'Rare Monsters in Area drop an additional Orb of Regret', effects: [{ stat: 'currency', percent: 35 }] },
  { id: 'b-blessed', text: 'Rare Monsters in Area drop an additional Blessed Orb', effects: [{ stat: 'currency', percent: 15 }] },
  { id: 'b-regal', text: 'Rare Monsters in Area drop an additional Regal Orb', effects: [{ stat: 'currency', percent: 25 }] },
  { id: 'b-support', text: 'Rare Monsters in Area have 20% chance to drop a Support Gem', effects: [{ stat: 'currency', percent: 30 }] },
  { id: 'b-locker', text: "Area contains an additional Pirate's Locker", effects: [{ stat: 'treasure', percent: 80 }] },
  { id: 'b-pirates', text: 'Area contains a Brinerot Raiding Party', effects: [{ stat: 'packsize', percent: 30 }] },
  { id: 'b-rareconn-1', text: '50% increased number of Rare monsters in Area per Chart connection', effects: [], perConnEffects: [{ stat: 'rares', percent: 50 }] },
  { id: 'b-rareconn-2', text: '75% increased number of Rare monsters in Area per Chart connection', effects: [], perConnEffects: [{ stat: 'rares', percent: 75 }] },
  { id: 'b-quantconn-1', text: '120% increased Quantity of Items, 50% reduced per Chart connection', effects: [{ stat: 'quantity', percent: 120 }], perConnEffects: [{ stat: 'quantity', percent: -50 }] },
  { id: 'b-quantconn-2', text: '180% increased Quantity of Items, 50% reduced per Chart connection', effects: [{ stat: 'quantity', percent: 180 }], perConnEffects: [{ stat: 'quantity', percent: -50 }] },
  { id: 'b-gold-1', text: '25% of Equipment dropped by Monsters in Area is converted to Gold', effects: [{ stat: 'gold', percent: 25 }] },
  { id: 'b-gold-2', text: '50% of Equipment dropped by Monsters in Area is converted to Gold', effects: [{ stat: 'gold', percent: 50 }] },
  { id: 'b-decks', text: 'Basic Currency items dropped by Monsters in Area will instead drop as Stacked Decks', effects: [{ stat: 'divcards', percent: 150 }] },
  { id: 'b-scarabdrop', text: 'Rare Monsters in Area drop an additional Scarab', effects: [{ stat: 'scarabs', percent: 80 }] },
  { id: 'b-curr-1', text: '50% more Currency found in Area', effects: [{ stat: 'currency', percent: 50 }] },
  { id: 'b-curr-2', text: '75% more Currency found in Area', effects: [{ stat: 'currency', percent: 75 }] },
  { id: 'b-curr-3', text: '100% more Currency found in Area', effects: [{ stat: 'currency', percent: 100 }] },
  { id: 'b-scarab-1', text: '50% more Scarabs found in Area', effects: [{ stat: 'scarabs', percent: 50 }] },
  { id: 'b-scarab-2', text: '75% more Scarabs found in Area', effects: [{ stat: 'scarabs', percent: 75 }] },
  { id: 'b-scarab-3', text: '100% more Scarabs found in Area', effects: [{ stat: 'scarabs', percent: 100 }] },
  { id: 'b-rarity-1', text: '50% more Rarity of Items found in Area', effects: [{ stat: 'rarity', percent: 50 }] },
  { id: 'b-rarity-2', text: '75% more Rarity of Items found in Area', effects: [{ stat: 'rarity', percent: 75 }] },
  { id: 'b-rarity-3', text: '100% more Rarity of Items found in Area', effects: [{ stat: 'rarity', percent: 100 }] },
  { id: 'b-crabboss', text: 'Adjacent Areas contain Captainsbane', effects: [{ stat: 'treasure', percent: 60 }] },
  { id: 'b-exp-1', text: '100% increased Experience gain', effects: [{ stat: 'exp', percent: 100 }] },
  { id: 'b-exp-2', text: '150% increased Experience gain', effects: [{ stat: 'exp', percent: 150 }] },
  { id: 'b-exp-3', text: '200% increased Experience gain', effects: [{ stat: 'exp', percent: 200 }] },
  { id: 'b-magicmods', text: 'Magic Monsters in adjacent Areas have an additional modifier', effects: [{ stat: 'magicmonsters', percent: 40 }] },
  { id: 'b-anchor-1', text: 'Adjacent Areas contain 2 additional Treasure Anchors', effects: [{ stat: 'treasure', percent: 100 }] },
  { id: 'b-anchor-2', text: 'Adjacent Areas contain 4 additional Treasure Anchors', effects: [{ stat: 'treasure', percent: 200 }] },
  { id: 'b-sulphdrop', text: "Rare Monsters in adjacent Areas drop Dead Man's Sulphur", effects: [{ stat: 'sulphur', percent: 100 }] },
  { id: 'b-goldlantern', text: 'Adjacent Areas contain 4 additional Golden Lanterns', effects: [{ stat: 'treasure', percent: 60 }] },
  { id: 'b-izaro', text: 'Adjacent Areas contain 2 Altars to the Goddess', effects: [{ stat: 'treasure', percent: 60 }] },
]

export const voyageModById = new Map(VOYAGE_MODS.map((m) => [m.id, m]))
export const borderModById = new Map(BORDER_MODS.map((m) => [m.id, m]))
