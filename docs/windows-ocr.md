# Windows chart import and border OCR

`public/voyage-import.ahk` is an optional Windows helper for the Allflame Voyage
Solver. It copies Charted Charts from both chart-stash tabs in Path of Exile, reads the 12 visible
Corruption Current tooltips, and optionally reads the next border-reroll cost
with Windows Runtime OCR before opening or returning to the trusted solver page,
re-verifying its address, and pasting the combined payload automatically without
a saved mouse click.

The web app and manual border entry do not require this helper.

Release testing against the live game follows the
[Windows OCR live validation matrix](windows-ocr-live-validation.md). The matrix
keeps planned coverage separate from executed, privacy-reviewed results.

## Requirements

- Windows 10 or Windows 11 with a Windows OCR language capability.
- [AutoHotkey v2](https://www.autohotkey.com/download/). The script starts with
  `#Requires AutoHotkey v2` and will not run under AutoHotkey v1.
- Path of Exile in **Windowed** or **Windowed Fullscreen** mode. Exclusive
  fullscreen can prevent reliable mouse and keyboard automation.
- The Voyage Board fully visible and not scrolled.
- A supported browser: Chrome, Edge, Firefox, Brave, Vivaldi, Opera, Arc, or
  LibreWolf, configured as the Windows default browser.

If Path of Exile runs as administrator, run the helper as administrator (or use
AutoHotkey's UI Access option) so Windows permits it to send input to the game.

### Trust and elevation model

Only run a reviewed copy of `voyage-import.ahk`: elevation grants the AutoHotkey
script the same integrity level as Path of Exile. The helper never resolves its
OCR child through the current directory or `PATH`. It opens the canonical
`%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe` by absolute path,
uses the `Sysnative` alias when a 32-bit AutoHotkey process must bypass WOW64
filesystem redirection, rejects reparse points, and verifies both the resolved
file and the actual child image against the native System32 path. OCR fails
closed when any of those checks is unavailable or mismatched, so a
`powershell.exe` placed beside the downloaded script is never selected.

The OCR program itself is passed to that verified child as an inherited,
short-lived environment value and created as an in-memory PowerShell
`ScriptBlock`. The importer clears the parent values immediately after process
creation and never creates, appends to, hashes, or executes a `.ps1` file in the
shared temporary directory. Prepositioning or repeatedly replacing the old
`voyage-border-ocr-<PID>.ps1` name therefore has no effect.

Elevation is needed only when Path of Exile itself is elevated and Windows UIPI
would otherwise block synthetic input. Prefer running the game and helper
without elevation; AutoHotkey's UI Access mode is the next option. Local Windows
OCR and screenshot capture do not independently require administrator rights.

## Install the OCR language

The helper prefers an installed English (`en-US` or another `en-*`) Windows OCR
recognizer, then falls back to the current user-profile language or another
available recognizer.

First check **Settings → Time & language → Language & region** and install the
English (United States) language and its available language features. Microsoft
documents the [Windows language installation
flow](https://support.microsoft.com/windows/change-your-keyboard-layout-245c49b8-f856-7fd7-2cf5-41e54c66f5b3)
and identifies OCR as a [language Feature on
Demand](https://learn.microsoft.com/windows-hardware/manufacture/desktop/features-on-demand-language-fod?view=windows-11).

If the script still reports that no OCR language is installed, open PowerShell
as administrator and inspect the capability:

```powershell
DISM /Online /Get-CapabilityInfo /CapabilityName:Language.OCR~~~en-US~0.0.1.0
```

Install it when its state is not `Installed`:

```powershell
DISM /Online /Add-Capability /CapabilityName:Language.OCR~~~en-US~0.0.1.0
```

DISM downloads the capability from Windows Update unless device policy or a
specified source changes that behavior. See Microsoft's
[`/Add-Capability`
documentation](https://learn.microsoft.com/windows-hardware/manufacture/desktop/dism-capabilities-package-servicing-command-line-options?view=windows-11#add-capability)
for managed-device and offline-source options.

## Start the helper

1. Download [the script](../public/voyage-import.ahk) and run it with AutoHotkey
   v2.
2. Open the Voyage Board in Path of Exile and keep the complete border visible.
3. Calibrate the board and chart grid once. The foreground game is authenticated
   automatically, and calibration is saved to `voyage-import.ini` beside the
   script.
4. Existing absolute screen calibration is cleared once after this update.
   Recalibrate the required points; new coordinates are stored as ratios of the
   PoE client area and follow the game when it moves between monitors or resizes.

### Solver window

The helper opens the fixed repository Pages URL through the normal Windows
shell, waits for the solver title in a supported browser process, activates that
window, and sends `Ctrl+V`. It does not save a browser HWND, PID, URL, size, or
click point, and it never reads the address bar. There is no browser-binding
hotkey. If Windows cannot open and activate the solver within the timeout, the
payload remains on the clipboard for a manual paste.

### Game-window identity

Every calibration and scan hotkey automatically authenticates only a foreground
window with the exact Path of Exile window
class and an expected PoE executable in a complete installation (`Content.ggpk`
on older installs or the `Bundles2` index on current Steam installs). The helper
records its HWND, PID, canonical executable path, and rejects reparse-point path
components. It also requires exactly one authenticated PoE candidate, so
multiple or ambiguous candidates fail closed.

The identity is revalidated before and after input and capture operations. A
changed window, process, class, executable path, installation, foreground owner,
or candidate set aborts the sweep. Focus the real game and retry. There is no
game-binding hotkey.

### Border calibration

For the quick rectangular calibration:

- Hover the top-left outer corner of the border and press `F5`.
- Hover the bottom-right outer corner and press `F6`.

For exact calibration, press `Ctrl+F5`, hover each prompted border-tooltip point,
and press `Ctrl+F6` for all 12 positions. Press `Ctrl+F4` to preview the stored
points.

### Reroll-cost calibration

Hover the compass-shaped border reroll button until `Border Modifiers Reroll
Cost` is visible, then press `Ctrl+F7`. This saves the hover point. During each
later `F9` or `Ctrl+F9` scan, the helper moves the pointer to that button, waits
for its tooltip, reads the displayed cost, and maps it to the solver's `Used`
reroll count. The known next costs are 3,000, 6,000, 12,000, 24,000, and 48,000.

This calibration is optional; without it, the existing reroll counter remains
unchanged. `Ctrl+F4` also previews the saved reroll-button point after the 12
border points.

### Chart-grid calibration

- Hover the center of the top-left chart slot and press `F7`.
- Hover the center of the bottom-right slot of the visible six-column chart grid
  and press `F8`.
- Hover the center of chart-stash tab `1` and press `Shift+F7`.
- Hover the center of chart-stash tab `2` and press `Shift+F8`.

The script defaults to a six-column, ten-row grid. Edit `GridCols` and `GridRows`
near the top of the script if the visible chart stash uses a different size.
The two tab positions are stored with the grid calibration in `voyage-import.ini`.

## Run

- `F9` switches through both calibrated chart-stash tabs, copies up to 120
  charts from the two default 6×10 grids,
  returns the stash to tab `1`, reads all 12 border tooltips and the calibrated
  reroll-cost tooltip, then opens the solver and imports the combined payload.
- `Ctrl+F9` copies only the borders and reroll cost, which is useful after a
  reroll, then opens the solver and imports that refresh.
- `F10` aborts the current sweep.

Release **Alt** (or the controller's **Left Trigger**) before starting a border
scan and keep it released until the scan finishes. Patch 3.29.3 uses that input
to display all 12 border modifiers at once, while the importer deliberately
reads one position at a time. The helper aborts if it detects a held Alt key,
and the solver rejects an OCR block containing multiple exact tooltips instead
of guessing a border position. The all-border view remains useful for manually
checking the imported result after the scan.

After `F9` or `Ctrl+F9`, the solver window in the default browser becomes active
and receives the paste automatically. If automatic opening or activation fails,
the payload remains on the clipboard and can be pasted with `Ctrl+V`.

Each border sweep includes a 12-position completion marker. The solver applies
complete snapshots atomically: an unreadable position is cleared instead of
silently retaining a modifier from an earlier scan. If the helper is aborted,
returns fewer than 12 positions, or recognizes none of the tooltips, the solver
keeps the existing borders and reports that the sweep failed. Legacy
single-border text fixtures can still be pasted as targeted updates.

The import status also reports the Windows OCR recognizer language selected by
the helper, such as `en-US` or `ko-KR`. Record that value when reproducing an OCR
failure.

A complete 12/12 paste is also recorded automatically in the active research
sequence. Scan the natural board and every paid reroll before changing it.
Clicking `Finish Voyage` under the solver board then closes that sequence; if
automatic submission has been explicitly enabled with a private key, the
sequence is queued for delivery without another GitHub click.

Do not move the mouse or type while a sweep is running. Chart copying uses the
game's normal `Ctrl+C` item text; OCR is used only for border tooltips.

## Privacy and temporary files

OCR runs locally through the Windows Runtime API. The helper writes screenshots,
the generated PowerShell bridge, and OCR output under `%TEMP%`. Files belonging
to the current helper run are removed after every successful or failed attempt,
after `F10` or a timeout, and again when the script exits. The helper does not
upload screenshots or OCR text.

The solver stores imported data in browser `localStorage` unless you explicitly
export it or create a share URL.

## Troubleshooting

- **No OCR language:** install the English OCR capability as described above,
  then restart the helper.
- **The game does not receive input:** avoid exclusive fullscreen and match the
  helper's privilege level to the game.
- **Wrong border tooltip or missed text:** keep the board unscrolled, use exact
  calibration, release Alt/Left Trigger, and press `Ctrl+F4` to verify the 12
  points.
- **Reroll count does not update:** hover the reroll button until the cost is
  visible, repeat `Ctrl+F7`, and use `Ctrl+F4` to preview the saved point.
- **Wrong charts are copied:** repeat `F7` and `F8`, then recalibrate tabs `1` and
  `2` with `Shift+F7` and `Shift+F8`; adjust `GridCols` or `GridRows` if necessary.
- **The payload was not imported automatically:** verify that the default browser
  can open the solver URL. The failed automatic delivery leaves the payload on
  the clipboard, so `Ctrl+V` remains available.
- **The helper reports an identity change:** close duplicate PoE windows, focus
  the real game, and retry the calibration or scan hotkey.
- **Tooltips appear too slowly:** increase `HoverDelay` near the top of the
  script.
