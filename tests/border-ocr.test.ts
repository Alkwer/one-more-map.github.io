import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { BORDER_SOURCE_SNAPSHOT } from '../src/data/borderSourceRecords'
import { BORDER_MODS, borderModById } from '../src/data/mods'
import { normalizeBorderOcrText, parseBorderOcrPayload } from '../src/logic/borderOcr'

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
  ['b-keep-1', 'Adjacent Charts have 30% chance to not be consumed when beginning a Voyage'],
  ['b-keep-2', 'Adjacent Charts have 50% chance to not be consumed when beginning a Voyage'],
  ['b-octoboss', 'Adjacent Areas contain Filthscrabble'],
  ['b-lanterns', 'Placing Lanterns does not reduce your Lantern count in adjacent Areas'],
  ['b-ancient', 'Rare Monsters in adjacent Areas drop an additional Ancient Orb'],
  ['b-divine', 'Rare Monsters in adjacent Areas drop an additional Divine Orb'],
  ['b-exalt', 'Rare Monsters in adjacent Areas drop an additional Exalted Orb'],
  ['b-annul', 'Rare Monsters in adjacent Areas drop an additional Orb of Annulment'],
  ['b-chaos', 'Rare Monsters in adjacent Areas drop an additional Chaos Orb'],
  ['b-vaal', 'Rare Monsters in adjacent Areas drop an additional Vaal Orb'],
  ['b-gcp', "Rare Monsters in adjacent Areas drop an additional Gemcutter's Prism"],
  ['b-chrome', 'Rare Monsters in adjacent Areas drop an additional Chromatic Orb'],
  ['b-regret', 'Rare Monsters in adjacent Areas drop an additional Orb of Regret'],
  ['b-blessed', 'Rare Monsters in adjacent Areas drop an additional Blessed Orb'],
  ['b-regal', 'Rare Monsters in adjacent Areas drop an additional Regal Orb'],
  ['b-support', 'Rare Monsters in adjacent Areas have 20% chance to drop a Support Gem'],
  ['b-locker', "Adjacent Areas contain a lost Pirate's Locker"],
  ['b-pirates', 'Adjacent Areas contain a Brinerot raiding party'],
  ['b-rareconn-1', '50% increased number of Rare monsters in adjacent Areas per connection'],
  ['b-rareconn-2', '75% increased number of Rare monsters in adjacent Areas per connection'],
  [
    'b-quantconn-1',
    '50% reduced quantity of items found in adjacent Areas per connection\n120% increased Quantity of Items found in adjacent Areas',
  ],
  [
    'b-quantconn-2',
    '50% reduced quantity of items found in adjacent Areas per connection\n180% increased Quantity of Items found in adjacent Areas',
  ],
  ['b-gold-1', '25% of Equipment dropped by monsters in adjacent Areas is converted to Gold'],
  ['b-gold-2', '50% of Equipment dropped by monsters in adjacent Areas is converted to Gold'],
  [
    'b-decks',
    'Basic Currency items dropped by Monsters in adjacent Areas will instead drop as Stacked Decks',
  ],
  ['b-scarabdrop', 'Rare Monsters in adjacent Areas drop an additional Scarab'],
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
  ['b-magicmods', 'Magic Monsters in adjacent Areas have an additional modifier'],
  ['b-anchor-1', 'Adjacent Areas contain 2 additional Treasure Anchors'],
  ['b-anchor-2', 'Adjacent Areas contain 4 additional Treasure Anchors'],
  ['b-sulphdrop', "Rare Monsters in adjacent Areas drop Dead Man's Sulphur"],
  ['b-goldlantern', 'Adjacent Areas contain 4 additional Golden Lanterns'],
  ['b-izaro', 'Adjacent Areas contain 2 Altars to the Goddess'],
]

const block = (text: string, index = 0) =>
  `=== VOYAGE BORDER ${index} ===\n${text}\n=== END VOYAGE BORDER ===`

describe('border OCR regressions', () => {
  it('keeps canonical OCR texts unique and raw-source gaps explicit', () => {
    const canonicalByText = new Map<string, string>()

    for (const mod of BORDER_MODS) {
      for (const ocrText of [mod.text, ...(mod.aliases ?? [])]) {
        const normalized = normalizeBorderOcrText(ocrText)
        assert.ok(normalized, `${mod.id} has an empty normalized tooltip`)
        assert.equal(
          canonicalByText.get(normalized),
          undefined,
          `${mod.id} duplicates the normalized OCR tooltip for ${canonicalByText.get(normalized)}`,
        )
        canonicalByText.set(normalized, mod.id)
      }
    }

    assert.equal(BORDER_MODS.length, BORDER_SOURCE_SNAPSHOT.canonicalTooltipCount)
    assert.equal(BORDER_SOURCE_SNAPSHOT.clientPatch, '3.29.3.1.2')
    assert.equal(
      BORDER_SOURCE_SNAPSHOT.repoeExportCommit,
      'af4ccc5e3e011da671553a40d851b1140902ef19',
    )
    assert.equal(BORDER_SOURCE_SNAPSHOT.reviewedAt, '2026-08-14')
    assert.equal(
      BORDER_SOURCE_SNAPSHOT.rawRecordCount,
      BORDER_SOURCE_SNAPSHOT.canonicalTooltipCount +
        BORDER_SOURCE_SNAPSHOT.unresolvedRecords.length,
    )

    const rawIds = new Set<string>()
    for (const record of BORDER_SOURCE_SNAPSHOT.unresolvedRecords) {
      assert.ok(!rawIds.has(record.rawId), `duplicate unresolved raw ID: ${record.rawId}`)
      rawIds.add(record.rawId)
      assert.equal(record.liveStatus, 'unverified')

      if (record.duplicateCanonicalId) {
        const canonical = borderModById.get(record.duplicateCanonicalId)
        assert.ok(canonical, `unknown duplicate canonical ID: ${record.duplicateCanonicalId}`)
        assert.ok(record.publicTranslation, `${record.rawId} is missing its public translation`)
        assert.equal(
          normalizeBorderOcrText(record.publicTranslation),
          normalizeBorderOcrText(canonical.text),
          `${record.rawId} no longer duplicates ${record.duplicateCanonicalId}`,
        )
      }
    }

    assert.deepEqual(
      BORDER_SOURCE_SNAPSHOT.unresolvedRecords.map((record) => [
        record.rawId,
        record.translationStatus,
      ]),
      [
        ['DeepwaterBorderMagicMonsterMods2', 'missing-for-stat-value'],
        ['DeepwaterBorderTreasureAnchorsHardMode', 'canonical-tooltip-collision'],
      ],
    )
  })

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

  it('matches every declared legacy tooltip alias', () => {
    for (const mod of BORDER_MODS) {
      for (const alias of mod.aliases ?? []) {
        const result = parseBorderOcrPayload(block(alias))
        assert.equal(
          result.matches[0]?.id,
          mod.id,
          `${mod.id} alias was parsed as ${result.matches[0]?.id ?? 'MISS'}: ${alias}`,
        )
      }
    }
  })

  it('handles unknown, noisy, and per-connection tooltips', () => {
    const unknown = parseBorderOcrPayload(block('Adjacent Areas contain TotallyUnknownBoss'))
    assert.equal(unknown.matches.length, 0)
    assert.equal(unknown.misses.length, 1)

    const noisyFilthscrabble = parseBorderOcrPayload(block('Adjacent Areas contain Filthscrabblc'))
    assert.equal(noisyFilthscrabble.matches[0]?.id, 'b-octoboss')

    const baseRare = parseBorderOcrPayload(
      block('50% increased number of Rare Monsters in adjacent Areas', 0),
    )
    const rarePerConnection = parseBorderOcrPayload(
      block('50% increased number of Rare monsters in adjacent Areas per connection', 1),
    )
    assert.equal(baseRare.matches[0]?.id, 'b-rare-1')
    assert.equal(rarePerConnection.matches[0]?.id, 'b-rareconn-1')

    const noisyRarePerConnection = parseBorderOcrPayload(
      block('50% increased number of Rare monsters in adjacent Areas per connectlon', 2),
    )
    assert.equal(noisyRarePerConnection.matches[0]?.id, 'b-rareconn-1')
  })

  it('keeps the Windows importer language fallback and board-only refresh', () => {
    // Windows installations often only have their display-language OCR pack.
    // Keep the importer from regressing to a hard dependency on en-US.
    const ahkImporter = readFileSync(
      new URL('../public/voyage-import.ahk', import.meta.url),
      'utf8',
    )
    assert.match(ahkImporter, /TryCreateFromUserProfileLanguages/)
    assert.match(ahkImporter, /AvailableRecognizerLanguages/)
    assert.match(ahkImporter, /Invoke-OcrFile \$Path \$engine/)
    assert.match(ahkImporter, /filtered, unfiltered and contrast-stretched scans/)
    assert.match(ahkImporter, /VoyageOcrImage]::Normalize/)
    assert.match(ahkImporter, /Win\+Alt\+B/)
    assert.match(ahkImporter, /BorderOcrAttempts := 2/)
    assert.match(ahkImporter, /Retrying failed OCR scan/)
    assert.match(ahkImporter, /GetKeyState\("LAlt", "P"\)/)
    assert.match(ahkImporter, /GetKeyState\("RAlt", "P"\)/)
    assert.match(ahkImporter, /Release Alt before border OCR/)
    assert.match(ahkImporter, /VOYAGE BORDER SCAN META/)
    assert.match(ahkImporter, /Captured: " LastBorderScanBlocks/)
    assert.match(ahkImporter, /OCR Language: \$script:RecognizerLanguage/)
    assert.match(ahkImporter, /CleanupOcrArtifacts\(\)/)
    assert.match(ahkImporter, /voyage-border-" ScriptPid "-\*\.png/)
    assert.match(ahkImporter, /EnvSet "VOYAGE_OCR_RUN_ID", ScriptPid/)
    assert.match(ahkImporter, /GetLongPathNameW/)
    assert.match(ahkImporter, /TempDir := LongPath\(A_Temp\)/)
    assert.match(ahkImporter, /PowerShellTrust := ResolveTrustedPowerShell\(\)/)
    assert.match(ahkImporter, /A_Is64bitOS && A_PtrSize = 4/)
    assert.match(ahkImporter, /\\Sysnative\\WindowsPowerShell\\v1\.0\\powershell\.exe/)
    assert.match(ahkImporter, /RejectReparseComponents\(expectedPath\)/)
    assert.match(ahkImporter, /GetFileInformationByHandleEx/)
    assert.match(ahkImporter, /QueryFullProcessImageNameW/)
    assert.match(ahkImporter, /command := quote PowerShellExe quote/)
    assert.doesNotMatch(ahkImporter, /command := "powershell\.exe/)
    assert.match(ahkImporter, /EnvSet "VOYAGE_OCR_SCRIPT", script/)
    assert.match(ahkImporter, /\[ScriptBlock\]::Create\(\$env:VOYAGE_OCR_SCRIPT\)/)
    assert.doesNotMatch(ahkImporter, /^\s*OcrHelper\s*:=|EnsureOcrHelper/m)
    assert.doesNotMatch(ahkImporter, /FileAppend OcrPowerShell\(\)/)
    assert.doesNotMatch(ahkImporter, /-ExecutionPolicy Bypass -File/)
    assert.doesNotMatch(ahkImporter, /Done\. Refreshed 12 borders/)
    const borderRefreshStart = ahkImporter.indexOf('^F9:: {')
    const fullImportMarker = ahkImporter.indexOf('\nF9:: {', borderRefreshStart + 1)
    const fullImportStart = fullImportMarker >= 0 ? fullImportMarker + 1 : -1
    assert.ok(borderRefreshStart >= 0, 'Ctrl+F9 border-only refresh hotkey is missing')
    assert.ok(fullImportStart > borderRefreshStart, 'full F9 import hotkey is missing')
    const borderRefreshHotkey = ahkImporter.slice(borderRefreshStart, fullImportStart)
    const fullImportHotkey = ahkImporter.slice(fullImportStart)
    assert.match(borderRefreshHotkey, /borderBlob := ScanBorders\(\)/)
    assert.match(borderRefreshHotkey, /rerollCostBlob := ScanRerollCost\(\)/)
    assert.match(borderRefreshHotkey, /payload := borderBlob/)
    assert.match(borderRefreshHotkey, /DeliverPayloadToSolver\(payload\)/)
    assert.match(ahkImporter, /\^F7:: \{/)
    assert.match(ahkImporter, /\+F7:: \{/)
    assert.match(ahkImporter, /\+F8:: \{/)
    assert.match(ahkImporter, /Tab1X := IniRead/)
    assert.match(ahkImporter, /Tab2X := IniRead/)
    assert.match(ahkImporter, /IsChartText\(text\)/)
    assert.match(ahkImporter, /아이템 종류: 해도/)
    assert.match(fullImportHotkey, /for tabIndex, tabPoint in tabPoints/)
    assert.match(fullImportHotkey, /MouseMove tabPoint\[1\], tabPoint\[2\], 0\s+Click/)
    assert.match(ahkImporter, /EmptySkipRows := IniRead/)
    assert.match(ahkImporter, /PromptEmptySkip/)
    assert.match(fullImportHotkey, /emptyRowStreak := 0/)
    assert.match(fullImportHotkey, /Loop GridRows \{[\s\S]*?rowEmpty := true/)
    assert.match(
      fullImportHotkey,
      /if !copiedToClipboard \{[\s\S]*?continue\s+\}\s+rowEmpty := false/,
    )
    assert.match(
      fullImportHotkey,
      /if rowEmpty \{\s+emptyRowStreak\+\+[\s\S]*?emptyRowStreak >= EmptySkipRows/,
    )
    assert.doesNotMatch(fullImportHotkey, /EmptySkipRows \* GridCols|emptySkipCells|emptyStreak/)
    assert.match(fullImportHotkey, /Nothing was ever copied - Ctrl\+C isn't reaching the game/)
    assert.match(fullImportHotkey, /chart INVENTORY squares on the right/)
    assert.match(ahkImporter, /ReleaseModifiers\(\)/)
    assert.match(ahkImporter, /Send "\{Ctrl up\}\{Alt up\}\{Shift up\}"/)
    assert.match(fullImportHotkey, /tabsIdentical := true/)
    assert.match(
      fullImportHotkey,
      /tab1Point := ChartTabPoints\(\)\[1\]\s+MouseMove tab1Point\[1\], tab1Point\[2\], 0\s+Click/,
    )
    assert.doesNotMatch(fullImportHotkey, /seen\.Has\(clip\)/)
    assert.match(ahkImporter, /rerollPoint := RerollScreenPoint\(\)/)
    assert.match(ahkImporter, /MouseMove rerollPoint\[1\], rerollPoint\[2\], 0/)
    assert.doesNotMatch(ahkImporter, /MouseMove RerollX, RerollY, 0/)
    assert.match(ahkImporter, /CalibrationSpaceVersion := "poe-client-ratio-v1"/)
    assert.match(ahkImporter, /CapturePoeClientPoint\(\)/)
    assert.match(
      ahkImporter,
      /return \[\(mouseX - clientLeft\) \/ clientWidth, \(mouseY - clientTop\) \/ clientHeight\]/,
    )
    assert.match(ahkImporter, /PoeScreenPoint\(clientRatioX, clientRatioY\)/)
    assert.match(ahkImporter, /return PoeScreenPoint\(TLx \+ col \* dx, TLy \+ row \* dy\)/)
    assert.match(
      ahkImporter,
      /return \[PoeScreenPoint\(Tab1X, Tab1Y\), PoeScreenPoint\(Tab2X, Tab2Y\)\]/,
    )
    assert.match(ahkImporter, /-Unfiltered:\$RerollCost/)
    assert.doesNotMatch(
      borderRefreshHotkey,
      /CellPos|GridRows|GridCols|ChartTabPoints|Tab1X|Tab2X|Send "\^c"/,
    )
    assert.doesNotMatch(
      ahkImporter,
      /throw 'Windows OCR is unavailable for English \(United States\)\.'/,
    )
  })

  it('opens and activates the solver without Ctrl+F2 or saved browser state', () => {
    const ahkImporter = readFileSync(
      new URL('../public/voyage-import.ahk', import.meta.url),
      'utf8',
    )
    const openStart = ahkImporter.indexOf('OpenSolverWindow()')
    const openFunction = ahkImporter.slice(
      openStart,
      ahkImporter.indexOf('PowerShellTrust :=', openStart),
    )
    const deliveryStart = ahkImporter.indexOf('DeliverPayloadToSolver(payload)')
    const summaryStart = ahkImporter.indexOf('DeliverySummary(delivery)', deliveryStart)
    const deliveryFunction = ahkImporter.slice(deliveryStart, summaryStart)

    assert.ok(openStart >= 0, 'solver-window opening is missing')
    assert.ok(deliveryStart >= 0, 'automatic solver delivery is missing')
    assert.doesNotMatch(ahkImporter, /\^F2::|Ctrl\+F2/)
    assert.doesNotMatch(ahkImporter, /\^F3::|Ctrl\+F3/)
    assert.match(
      ahkImporter,
      /https:\/\/alkwer\.github\.io\/one-more-map\.github\.io\/allflame-voyage-solver/,
    )
    assert.match(ahkImporter, /SolverPageTitle := "Allflame Voyage Solver - PoE 3\.29"/)
    assert.match(ahkImporter, /processName := WinGetProcessName\("ahk_id " hwnd\)/)
    assert.match(ahkImporter, /IsExpectedBrowserImage\(processName\)/)
    assert.match(ahkImporter, /IsSolverBrowserWindow\(hwnd\)/)
    assert.match(ahkImporter, /InStr\(WinGetTitle\("ahk_id " hwnd\), SolverPageTitle\)/)
    assert.match(openFunction, /ComObject\("Shell\.Application"\)\.ShellExecute\(SolverLaunchUrl\)/)
    assert.match(openFunction, /solverHwnd := FindSolverBrowserWindow\(\)/)
    assert.match(openFunction, /WinActivate "ahk_id " solverHwnd/)
    assert.match(openFunction, /WinWaitActive\("ahk_id " solverHwnd/)
    assert.match(deliveryFunction, /CopyPayloadToClipboard\(payload\)/)
    assert.match(deliveryFunction, /solverHwnd := OpenSolverWindow\(\)/)
    assert.match(deliveryFunction, /Send "\^v"/)
    assert.doesNotMatch(deliveryFunction, /MouseMove|Click/)
    assert.doesNotMatch(
      ahkImporter,
      /SolverHwnd|SolverPid|SolverClass|SolverImagePath|SolverPageUrl|CanonicalSolverUrl|ReadForegroundBrowserUrl/,
    )
  })

  it('does not authenticate a browser merely titled Path of Exile', () => {
    const ahkImporter = readFileSync(
      new URL('../public/voyage-import.ahk', import.meta.url),
      'utf8',
    )

    assert.match(ahkImporter, /ExpectedPoeClass := "POEWindowClass"/)
    assert.doesNotMatch(ahkImporter, /\^F3::|Ctrl\+F3/)
    assert.match(ahkImporter, /activeHwnd := WinExist\("A"\)/)
    assert.match(ahkImporter, /WinGetClass\("ahk_id " activeHwnd\) != ExpectedPoeClass/)
    assert.match(ahkImporter, /PoeHwnd := activeHwnd/)
    assert.match(ahkImporter, /PoePid := WinGetPID\("ahk_id " activeHwnd\)/)
    assert.match(ahkImporter, /PoeImagePath := imagePath/)
    assert.match(ahkImporter, /PathOfExile\[_A-Za-z0-9-\]\*\\\.exe/)
    assert.match(ahkImporter, /installDir "\\Content\.ggpk"/)
    assert.match(ahkImporter, /installDir "\\Bundles2\\_\.index\.bin"/)
    assert.match(ahkImporter, /RejectReparseComponents\(imagePath\)/)
    assert.match(ahkImporter, /candidates\.Length != 1/)
    assert.match(ahkImporter, /ValidateBoundPoeWindow\(requireForeground := false\)/)
    assert.match(ahkImporter, /RequireBoundPoeForeground\(\)/)
    assert.match(ahkImporter, /RequireBoundPoeForeground\(\) \{[\s\S]*BindForegroundPoeWindow\(\)/)
    assert.match(ahkImporter, /WinActivate "ahk_id " PoeHwnd/)
    assert.doesNotMatch(ahkImporter, /PoeWinTitle|SetTitleMatchMode/)
  })

  it.skipIf(process.platform !== 'win32')(
    'launches native System32 PowerShell even with a benign fake beside the caller',
    () => {
      const windowsDir = process.env.WINDIR ?? process.env.SystemRoot
      assert.ok(windowsDir, 'Windows directory is unavailable')
      const expected = realpathSync.native(
        join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      )
      const fakeDirectory = mkdtempSync(join(tmpdir(), 'voyage-powershell-path-'))
      const fake = join(fakeDirectory, 'powershell.exe')
      copyFileSync(process.execPath, fake)

      try {
        const actual = execFileSync(
          expected,
          [
            '-NoLogo',
            '-NoProfile',
            '-Command',
            '[System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName',
          ],
          { cwd: fakeDirectory, encoding: 'utf8', windowsHide: true },
        ).trim()

        assert.equal(realpathSync.native(actual).toLowerCase(), expected.toLowerCase())
        assert.notEqual(
          realpathSync.native(actual).toLowerCase(),
          realpathSync.native(fake).toLowerCase(),
        )
      } finally {
        rmSync(fakeDirectory, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'ignores a prepositioned predictable helper and a replacement watcher race',
    async () => {
      const windowsDir = process.env.WINDIR ?? process.env.SystemRoot
      assert.ok(windowsDir, 'Windows directory is unavailable')
      const powershell = realpathSync.native(
        join(windowsDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      )
      const raceDirectory = mkdtempSync(join(tmpdir(), 'voyage-helper-race-'))
      const predicted = join(raceDirectory, `voyage-border-ocr-${process.pid}.ps1`)
      const marker = join(raceDirectory, 'attacker-marker.txt')
      const attackerScript = `[IO.File]::WriteAllText('${marker.replace(/'/g, "''")}', 'attacker')`
      writeFileSync(predicted, attackerScript)
      const watcherSource = `
        const fs = require('node:fs');
        const path = ${JSON.stringify(predicted)};
        const content = ${JSON.stringify(attackerScript)};
        const deadline = Date.now() + 500;
        while (Date.now() < deadline) fs.writeFileSync(path, content);
      `
      const watcher = spawn(process.execPath, ['-e', watcherSource], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const watcherExit = once(watcher, 'exit')

      try {
        const output = execFileSync(
          powershell,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '& ([ScriptBlock]::Create($env:VOYAGE_OCR_SCRIPT))',
          ],
          {
            cwd: raceDirectory,
            encoding: 'utf8',
            env: {
              ...process.env,
              VOYAGE_OCR_SCRIPT: "Start-Sleep -Milliseconds 250; [Console]::Out.Write('trusted')",
            },
            windowsHide: true,
          },
        )
        await watcherExit

        assert.equal(output, 'trusted')
        assert.equal(existsSync(marker), false)
      } finally {
        if (watcher.exitCode === null) watcher.kill()
        rmSync(raceDirectory, { recursive: true, force: true })
      }
    },
  )
})
