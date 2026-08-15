export interface CursedDucat {
  name: string
  effects: readonly string[]
}

export const CURSED_DUCAT_IMPLICIT =
  'Monsters in Area have increased Toughness and Reward — Unscalable Value'

export const CURSED_DUCATS: readonly CursedDucat[] = [
  {
    name: "Ducat of Tsoatha's Gift",
    effects: ['50% increased Monster Damage'],
  },
  {
    name: 'Ducat of the Undead Sea',
    effects: ['Monster Damage Penetrates 10% Elemental Resistances'],
  },
  {
    name: 'Ducat of the Fallen Stars',
    effects: ['Monsters gain 100% of their Physical Damage as Extra Damage of a random Element'],
  },
  {
    name: 'Ducat of the Grasping Deep',
    effects: [
      'Monsters have 40% increased Area of Effect',
      'Monsters fire 2 additional Projectiles',
    ],
  },
  {
    name: 'Ducat of the Foul Kin',
    effects: ['Monsters have 50% increased Attack, Cast and Movement Speed'],
  },
  {
    name: 'Ducat of the Eucarid Isle',
    effects: [
      'Monsters have 500% increased Critical Strike Chance',
      '+50% to Monster Critical Strike Multiplier',
    ],
  },
]
