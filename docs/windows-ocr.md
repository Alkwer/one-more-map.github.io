# Windows chart import and border OCR

`public/voyage-import.ahk` is an optional Windows helper for the Allflame Voyage
Solver. It copies Charted Charts from Path of Exile and reads the 12 visible
Corruption Current tooltips with Windows Runtime OCR before pasting the combined
text into the browser.

The web app and manual border entry do not require this helper.

## Requirements

- Windows 10 or Windows 11 with a Windows OCR language capability.
- [AutoHotkey v2](https://www.autohotkey.com/download/). The script starts with
  `#Requires AutoHotkey v2` and will not run under AutoHotkey v1.
- Path of Exile in **Windowed** or **Windowed Fullscreen** mode. Exclusive
  fullscreen can prevent reliable mouse and keyboard automation.
- The Voyage Board fully visible and not scrolled.
- A browser tab whose title contains `Allflame Voyage Solver`. Click the page
  rather than the address bar before starting.

If Path of Exile runs as administrator, run the helper as administrator (or use
AutoHotkey's UI Access option) so Windows permits it to send input to the game.

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
3. Open the solver in a browser tab and click inside the page.
4. Calibrate the board and chart grid once. Calibration is saved to
   `voyage-import.ini` beside the script.

### Border calibration

For the quick rectangular calibration:

- Hover the top-left outer corner of the border and press `F5`.
- Hover the bottom-right outer corner and press `F6`.

For exact calibration, press `Ctrl+F5`, hover each prompted border-tooltip point,
and press `Ctrl+F6` for all 12 positions. Press `Ctrl+F4` to preview the stored
points.

### Chart-grid calibration

- Hover the center of the top-left chart slot and press `F7`.
- Hover the center of the bottom-right slot of the visible six-column chart grid
  and press `F8`.

The script defaults to a six-column, ten-row grid. Edit `GridCols` and `GridRows`
near the top of the script if the visible chart stash uses a different size.

## Run

- `F9` copies the calibrated chart grid, reads all 12 border tooltips, activates
  the solver tab, and pastes the combined payload.
- `Ctrl+F9` reads and pastes only the borders, which is useful after a reroll.
- `F10` aborts the current sweep.

Do not move the mouse or type while a sweep is running. Chart copying uses the
game's normal `Ctrl+C` item text; OCR is used only for border tooltips.

## Privacy and temporary files

OCR runs locally through the Windows Runtime API. The helper writes screenshots,
the generated PowerShell bridge, and OCR output under `%TEMP%`. Each screenshot
is deleted after its OCR attempt, and helper/output files are removed when the
script exits. The helper does not upload screenshots or OCR text.

The solver stores imported data in browser `localStorage` unless you explicitly
export it or create a share URL.

## Troubleshooting

- **No OCR language:** install the English OCR capability as described above,
  then restart the helper.
- **The game does not receive input:** avoid exclusive fullscreen and match the
  helper's privilege level to the game.
- **Wrong border tooltip or missed text:** keep the board unscrolled, use exact
  calibration, and press `Ctrl+F4` to verify the 12 points.
- **Wrong charts are copied:** repeat `F7` and `F8`; adjust `GridCols` or
  `GridRows` if necessary.
- **The browser is not selected:** ensure the tab title contains
  `Allflame Voyage Solver` and click the page body before pressing a run hotkey.
- **Tooltips appear too slowly:** increase `HoverDelay` near the top of the
  script.
