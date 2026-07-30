import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { parseBorderOcrPayload } from '../src/logic/borderOcr'

const CURRENT_BORDER_TOOLTIPS = [
  ['b-pack-1', '16% increased Pack Size in adjacent Areas'],
  ['b-pack-2', '24% increased Pack Size in adjacent Areas'],
  ['b-pack-3', '32% increased Pack Size in adjacent Areas'],
  ['b-minmagic', 'Monsters in adjacent Areas are at least Magic'],
  ['b-rare-1', '50% increased number of Rare Monsters in adjacent Areas'],
  ['b-rare-2', '75% increased number of Rare Monsters in adjacent Areas'],
  ['b-rare-3', '100% increased number of Rare Monsters in adjacent Areas'],
  ['b-beasts-1', 'Adjacent Areas contain 8 additional packs of Sea Beasts'],
  ['b-beasts-2', 'Adjacent Areas contain 12 additional packs of Sea Beasts'],
  ['b-beasts-3', 'Adjacent Areas contain 16 additional packs of Sea Beasts'],
  ['b-crabs-1', 'Adjacent Areas contain 8 additional packs of Crabs'],
  ['b-crabs-2', 'Adjacent Areas contain 12 additional packs of Crabs'],
  ['b-crabs-3', 'Adjacent Areas contain 16 additional packs of Crabs'],
  ['b-drowned-1', 'Adjacent Areas contain 8 additional packs of the Drowned'],
  ['b-drowned-2', 'Adjacent Areas contain 12 additional packs of the Drowned'],
  ['b-drowned-3', 'Adjacent Areas contain 16 additional packs of the Drowned'],
  ['b-mag-1', 'Adjacent Areas have 40% increased explicit modifier magnitudes'],
  ['b-mag-2', 'Adjacent Areas have 60% increased explicit modifier magnitudes'],
  ['b-mag-3', 'Adjacent Areas have 80% increased explicit modifier magnitudes'],
  [
    'b-keep-1',
    'Adjacent Charts have 30% chance to not be consumed when beginning a Voyage',
  ],
  [
    'b-keep-2',
    'Adjacent Charts have 50% chance to not be consumed when beginning a Voyage',
  ],
  ['b-octoboss', 'Adjacent Areas contain Filthscrabble'],
  [
    'b-lanterns',
    'Placing Lanterns does not reduce your Lantern count in adjacent Areas',
  ],
  [
    'b-ancient',
    'Rare Monsters in adjacent Areas drop 1 additional Ancient Orbs',
  ],
  ['b-divine', 'Rare Monsters adjacent in Areas drop 1 additional Divine Orbs'],
  [
    'b-exalt',
    'Rare Monsters in adjacent Areas drop 1 additional Exalted Orbs',
  ],
  [
    'b-annul',
    'Rare Monsters in adjacent Areas drop 1 additional Orbs of Annulment',
  ],
  ['b-chaos', 'Rare Monsters in adjacent Areas drop 1 additional Chaos Orbs'],
  ['b-vaal', 'Rare Monsters in adjacent Areas drop an additional Vaal Orb'],
  [
    'b-gcp',
    "Rare Monsters in adjacent Areas drop 1 additional Gemcutter's Prisms",
  ],
  [
    'b-chrome',
    'Rare Monsters in adjacent Areas drop 1 additional Chromatic Orbs',
  ],
  [
    'b-regret',
    'Rare Monsters in adjacent Areas drop 1 additional Orbs of Regret',
  ],
  [
    'b-blessed',
    'Rare Monsters in adjacent Areas drop 1 additional Blessed Orbs',
  ],
  ['b-regal', 'Rare Monsters in adjacent Areas drop 1 additional Regal Orbs'],
  [
    'b-support',
    'Rare Monsters in adjacent Areas have 20% chance to drop a Support Gem',
  ],
  ['b-locker', "Adjacent Areas contain a lost Pirate's Locker"],
  ['b-pirates', 'Adjacent Areas contain a Brinerot raiding party'],
  [
    'b-rareconn-1',
    '50% increased number of Rare monsters in adjacent Areas per connection',
  ],
  [
    'b-rareconn-2',
    '75% increased number of Rare monsters in adjacent Areas per connection',
  ],
  [
    'b-quantconn-1',
    '50% reduced quantity of items found in adjacent Areas per connection\n120% increased Quantity of Items found in adjacent Areas',
  ],
  [
    'b-quantconn-2',
    '50% reduced quantity of items found in adjacent Areas per connection\n180% increased Quantity of Items found in adjacent Areas',
  ],
  [
    'b-gold-1',
    '25% of Equipment dropped by monsters in adjacent Areas is converted to Gold',
  ],
  [
    'b-gold-2',
    '50% of Equipment dropped by monsters in adjacent Areas is converted to Gold',
  ],
  [
    'b-decks',
    'Basic Currency items dropped by Monsters in adjacent Areas will instead drop as Stacked Decks',
  ],
  [
    'b-scarabdrop',
    'Rare Monsters in adjacent Areas drop 1 additional Scarabs',
  ],
  ['b-curr-1', '50% more Currency found in adjacent Areas'],
  ['b-curr-2', '75% more Currency found in adjacent Areas'],
  ['b-curr-3', '100% more Currency found in adjacent Areas'],
  ['b-scarab-1', '50% more Scarabs found in adjacent Areas'],
  ['b-scarab-2', '75% more Scarabs found in adjacent Areas'],
  ['b-scarab-3', '100% more Scarabs found in adjacent Areas'],
  ['b-rarity-1', '50% more Rarity of Items found in adjacent Areas'],
  ['b-rarity-2', '75% more Rarity of Items found in adjacent Areas'],
  ['b-rarity-3', '100% more Rarity of Items found in adjacent Areas'],
  ['b-crabboss', 'Adjacent Areas contain Captainsbane'],
  ['b-exp-1', 'Players in adjacent Areas gain 100% increased Experience'],
  ['b-exp-2', 'Players in adjacent Areas gain 150% increased Experience'],
  ['b-exp-3', 'Players in adjacent Areas gain 200% increased Experience'],
  [
    'b-magicmods',
    'Magic Monsters in adjacent Areas have an additional modifier',
  ],
  ['b-anchor-1', 'Adjacent Areas contain 2 additional Treasure Anchors'],
  ['b-anchor-2', 'Adjacent Areas contain 4 additional Treasure Anchors'],
  [
    'b-sulphdrop',
    "Rare Monsters in adjacent Areas drop Dead Man's Sulphur",
  ],
  ['b-goldlantern', 'Adjacent Areas contain 4 additional Golden Lanterns'],
  ['b-izaro', 'Adjacent Areas contain 2 Altars to the Goddess'],
]

const block = (text: string, index = 0) =>
  `=== VOYAGE BORDER ${index} ===\n${text}\n=== END VOYAGE BORDER ===`

describe('border OCR regressions', () => {
  it('matches every current canonical tooltip', () => {
    assert.equal(CURRENT_BORDER_TOOLTIPS.length, 64)

    for (const [expectedId, tooltip] of CURRENT_BORDER_TOOLTIPS) {
      const result = parseBorderOcrPayload(block(tooltip))
      assert.equal(
        result.matches[0]?.id,
        expectedId,
        `${expectedId} was parsed as ${result.matches[0]?.id ?? 'MISS'}: ${tooltip}`,
      )
    }
  })

  it('handles unknown, noisy, and per-connection tooltips', () => {
    const unknown = parseBorderOcrPayload(block('Adjacent Areas contain TotallyUnknownBoss'))
    assert.equal(unknown.matches.length, 0)
    assert.equal(unknown.misses.length, 1)

    const noisyFilthscrabble = parseBorderOcrPayload(
      block('Adjacent Areas contain Filthscrabblc'),
    )
    assert.equal(noisyFilthscrabble.matches[0]?.id, 'b-octoboss')

    const baseRare = parseBorderOcrPayload(
      block('50% increased number of Rare Monsters in adjacent Areas', 0),
    )
    const rarePerConnection = parseBorderOcrPayload(
      block(
        '50% increased number of Rare monsters in adjacent Areas per connection',
        1,
      ),
    )
    assert.equal(baseRare.matches[0]?.id, 'b-rare-1')
    assert.equal(rarePerConnection.matches[0]?.id, 'b-rareconn-1')

    const noisyRarePerConnection = parseBorderOcrPayload(
      block(
        '50% increased number of Rare monsters in adjacent Areas per connectlon',
        2,
      ),
    )
    assert.equal(noisyRarePerConnection.matches[0]?.id, 'b-rareconn-1')
  })

  it('keeps the Windows importer language fallback and border-only refresh', () => {
    // Windows installations often only have their display-language OCR pack.
    // Keep the importer from regressing to a hard dependency on en-US.
    const ahkImporter = readFileSync(
      new URL('../public/voyage-import.ahk', import.meta.url),
      'utf8',
    )
    assert.match(ahkImporter, /TryCreateFromUserProfileLanguages/)
    assert.match(ahkImporter, /AvailableRecognizerLanguages/)
    assert.match(ahkImporter, /Invoke-OcrFile \$Path \$engine/)
    assert.match(
      ahkImporter,
      /Windows OCR returned no text after filtered and unfiltered scans/,
    )
    assert.match(ahkImporter, /BorderOcrAttempts := 2/)
    assert.match(ahkImporter, /Retrying empty OCR scan/)
    const borderRefreshStart = ahkImporter.indexOf('^F9:: {')
    const fullImportMarker = ahkImporter.indexOf('\nF9:: {', borderRefreshStart + 1)
    const fullImportStart = fullImportMarker >= 0 ? fullImportMarker + 1 : -1
    assert.ok(borderRefreshStart >= 0, 'Ctrl+F9 border-only refresh hotkey is missing')
    assert.ok(fullImportStart > borderRefreshStart, 'full F9 import hotkey is missing')
    const borderRefreshHotkey = ahkImporter.slice(borderRefreshStart, fullImportStart)
    assert.match(borderRefreshHotkey, /borderBlob := ScanBorders\(\)/)
    assert.match(borderRefreshHotkey, /PasteIntoSolver\(\s*borderBlob/)
    assert.doesNotMatch(borderRefreshHotkey, /CellPos|GridRows|GridCols|Send "\^c"/)
    assert.doesNotMatch(
      ahkImporter,
      /throw 'Windows OCR is unavailable for English \(United States\)\.'/,
    )
  })
})
