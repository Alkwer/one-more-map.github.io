#Requires AutoHotkey v2.0
#SingleInstance Force
SetWorkingDir A_ScriptDir
SetTitleMatchMode 2          ; match window titles by "contains"
CoordMode "Mouse", "Screen"  ; all coords are absolute screen pixels

; =====================================================================
;  Allflame Voyage - bulk chart + board-border importer  (AutoHotkey v2)
;
;  Three phases:
;    Phase 1 - stays in PoE, hovers every cell and Ctrl+C's it, appending
;              each chart's text into one buffer (no window switching).
;    Phase 2 - hovers the 12 board-border modifiers. A temporary PowerShell
;              helper captures the PoE window and reads each tooltip with the
;              Windows OCR engine. Screenshots never leave the PC.
;    Phase 3 - switches to the browser ONCE and pastes the whole buffer;
;              the solver parses and imports every chart from that one paste.
;    Empty cells copy nothing and are skipped.
;
;  ---------------------------------------------------------------
;  ONE-TIME SETUP
;   1. Install AutoHotkey v2  (https://www.autohotkey.com/).
;   2. In PoE open the Voyage board so the Chart panel is fully
;      visible and NOT scrolled. Use Windowed or Windowed Fullscreen
;      (exclusive fullscreen can block the mouse/keys).
;   3. Open the solver in your browser; the tab title must contain
;      "Allflame Voyage Solver", and click once inside the page so
;      focus is on the page (not the address bar).
;   4. Double-click this file to run it (it lives in the tray).
;
;  CALIBRATE THE BOARD BORDERS (once; saved to voyage-import.ini)
;   - Hover the TOP border modifier above the TOP-LEFT board square, press F5.
;   - Hover the BOTTOM border modifier below the BOTTOM-RIGHT square, press F6.
;
;  CALIBRATE THE CHART GRID (once; saved to voyage-import.ini)
;   - Hover the CENTRE of the TOP-LEFT chart, press  F7.
;   - Hover the CENTRE of the BOTTOM-RIGHT cell of the 6-wide grid
;     (the far corner cell, even if it's empty), press  F8.
;   - Set GridCols / GridRows below to match your panel.
;
;  RUN
;   F9  = do the real import sweep
;   F10 = abort at any time
;
;  If PoE is running as administrator, run this script as admin too,
;  or its keypresses won't reach the game. Don't touch the mouse or
;  keyboard while it's sweeping.
; =====================================================================

; ---------------- CONFIG ----------------
PoeWinTitle     := "Path of Exile"           ; PoE window title
BrowserWinTitle := "Allflame Voyage Solver"  ; the solver's browser tab title

GridCols := 6    ; columns in the Chart panel
GridRows := 10   ; rows to sweep (overshooting is fine - empty cells skip)

ActivateDelay := 60    ; ms after focusing a window (paid only ~twice total now)
HoverDelay    := 28    ; ms for PoE to register the cursor before Ctrl+C
BorderHoverDelay := 180 ; ms for a border tooltip to appear before OCR capture
PasteDelay    := 90    ; ms after the single big paste
ClipTimeout   := 0.2   ; seconds to wait for Ctrl+C (only empty cells wait the full time)
OcrTimeout    := 90    ; seconds before a stuck Windows OCR scan is stopped
; If it ever MISSES a chart, raise HoverDelay ~10ms at a time (the cursor
; isn't settling before Ctrl+C). If the final paste drops some, raise PasteDelay.
; ----------------------------------------

IniFile := A_ScriptDir "\voyage-import.ini"
TLx := IniRead(IniFile, "grid", "TLx", "0") + 0
TLy := IniRead(IniFile, "grid", "TLy", "0") + 0
BRx := IniRead(IniFile, "grid", "BRx", "0") + 0
BRy := IniRead(IniFile, "grid", "BRy", "0") + 0
BorderTLx := IniRead(IniFile, "board", "TopLeftX", "0") + 0
BorderTLy := IniRead(IniFile, "board", "TopY", "0") + 0
BorderBRx := IniRead(IniFile, "board", "BottomRightX", "0") + 0
BorderBRy := IniRead(IniFile, "board", "BottomY", "0") + 0
ScriptPid := ProcessExist()
OcrHelper := A_Temp "\voyage-border-ocr-" ScriptPid ".ps1"
OcrOutput := A_Temp "\voyage-border-ocr-" ScriptPid ".txt"
OcrPid := 0
Running := false

CleanupOcr(*) {
    global OcrHelper, OcrOutput, OcrPid
    if OcrPid && ProcessExist(OcrPid)
        try ProcessClose OcrPid
    try FileDelete OcrHelper
    try FileDelete OcrOutput
}
OnExit CleanupOcr

Flash(text, ms := 1400) {
    ToolTip text
    SetTimer () => ToolTip(), -ms
}

CellPos(row, col) {
    global TLx, TLy, BRx, BRy, GridCols, GridRows
    dx := (GridCols > 1) ? (BRx - TLx) / (GridCols - 1) : 0
    dy := (GridRows > 1) ? (BRy - TLy) / (GridRows - 1) : 0
    return [Round(TLx + col * dx), Round(TLy + row * dy)]
}

Calibrated() => (TLx != 0 && TLy != 0 && BRx != 0 && BRy != 0)
BoardCalibrated() =>
    (BorderTLx != 0 && BorderTLy != 0 && BorderBRx > BorderTLx && BorderBRy > BorderTLy)

BorderPoints() {
    global BorderTLx, BorderTLy, BorderBRx, BorderBRy
    ; F5/F6 are the centres of the top-left and bottom-right modifiers.
    ; Their X distance spans two columns, while their Y distance spans
    ; three full cell heights (top edge -> bottom edge).
    dx := (BorderBRx - BorderTLx) / 2
    cellH := (BorderBRy - BorderTLy) / 3
    points := []

    ; indices 0-2: top, left to right
    Loop 3
        points.Push([Round(BorderTLx + (A_Index - 1) * dx), BorderTLy])
    ; indices 3-5: right, top to bottom
    Loop 3
        points.Push([Round(BorderBRx + dx / 2), Round(BorderTLy + (A_Index - 0.5) * cellH)])
    ; indices 6-8: bottom, left to right
    Loop 3
        points.Push([Round(BorderTLx + (A_Index - 1) * dx), BorderBRy])
    ; indices 9-11: left, top to bottom
    Loop 3
        points.Push([Round(BorderTLx - dx / 2), Round(BorderTLy + (A_Index - 0.5) * cellH)])

    return points
}

SerializePoints(points) {
    text := ""
    for point in points
        text .= (text = "" ? "" : ";") point[1] "," point[2]
    return text
}

OcrPowerShell() {
    return "
(
param(
    [string]$Points = '',
    [int]$WindowLeft = 0,
    [int]$WindowTop = 0,
    [int]$WindowWidth = 0,
    [int]$WindowHeight = 0,
    [int]$HoverDelay = 180,
    [string]$ImagePath = '',
    [Parameter(Mandatory = $true)][string]$OutputPath)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type @'
using System.Runtime.InteropServices;
public static class VoyageMouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
}
'@

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
[void][Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime]

function Await-Result {
    param(
        [Parameter(Mandatory = $true)]$AsyncOperation,
        [Parameter(Mandatory = $true)][Type]$ResultType)
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.IsGenericMethod -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    $task.Wait()
    return $task.Result
}

function Read-OcrLines {
    param([Parameter(Mandatory = $true)][string]$Path)
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
            if ($null -eq $engine) {
                throw 'Windows OCR is unavailable for the current language profile.'
            }
            $result = Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            $lines = @($result.Lines | ForEach-Object { $_.Text })
            if ($lines.Count -gt 0) { return $lines -join [Environment]::NewLine }
            return $result.Text
        } finally {
            if ($null -ne $bitmap) { $bitmap.Dispose() }
        }
    } finally {
        $stream.Dispose()
    }
}

function Add-Block {
    param(
        [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Builder,
        [Parameter(Mandatory = $true)][int]$Index,
        [Parameter(Mandatory = $true)][string]$Text)
    [void]$Builder.AppendLine("=== VOYAGE BORDER $Index ===")
    [void]$Builder.AppendLine($Text)
    [void]$Builder.AppendLine('=== END VOYAGE BORDER ===')
}

$builder = [System.Text.StringBuilder]::new()
if ($ImagePath) {
    Add-Block $builder 0 (Read-OcrLines $ImagePath)
} else {
    if ($WindowWidth -le 0 -or $WindowHeight -le 0) {
        throw 'Invalid Path of Exile window size.'
    }
    $positions = @($Points -split ';' | ForEach-Object {
        $xy = $_ -split ','
        [pscustomobject]@{ X = [int]$xy[0]; Y = [int]$xy[1] }
    })
    for ($i = 0; $i -lt $positions.Count; $i++) {
        [void][VoyageMouse]::SetCursorPos($positions[$i].X, $positions[$i].Y)
        Start-Sleep -Milliseconds $HoverDelay
        $png = Join-Path $env:TEMP "voyage-border-$PID-$i.png"
        try {
            $image = [System.Drawing.Bitmap]::new($WindowWidth, $WindowHeight)
            $graphics = [System.Drawing.Graphics]::FromImage($image)
            try {
                $graphics.CopyFromScreen($WindowLeft, $WindowTop, 0, 0, $image.Size)
                $image.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $graphics.Dispose()
                $image.Dispose()
            }
            Add-Block $builder $i (Read-OcrLines $png)
        } catch {
            Add-Block $builder $i ("OCR ERROR: " + $_.Exception.Message)
        } finally {
            Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
        }
    }
}

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, $builder.ToString(), $utf8)
)"
}

EnsureOcrHelper() {
    global OcrHelper
    try FileDelete OcrHelper
    FileAppend OcrPowerShell(), OcrHelper, "UTF-8"
}

RunOcrHelper(arguments, cancellable := true) {
    global OcrHelper, OcrOutput, OcrPid, OcrTimeout, Running
    try FileDelete OcrOutput
    EnsureOcrHelper()
    quote := Chr(34)
    command := "powershell.exe -NoProfile -ExecutionPolicy Bypass -File "
        . quote OcrHelper quote " " arguments " -OutputPath " quote OcrOutput quote
    Run command, , "Hide", &OcrPid
    deadline := A_TickCount + OcrTimeout * 1000
    while ProcessExist(OcrPid) {
        if (cancellable && !Running) {
            ProcessClose OcrPid
            OcrPid := 0
            return ""
        }
        if (A_TickCount > deadline) {
            ProcessClose OcrPid
            OcrPid := 0
            MsgBox "Windows OCR timed out. Try again, or raise OcrTimeout in the script."
            return ""
        }
        Sleep 100
    }
    OcrPid := 0
    if !FileExist(OcrOutput)
        return ""
    return FileRead(OcrOutput, "UTF-8")
}

ScanBorders() {
    global PoeWinTitle, BorderHoverDelay
    WinGetPos &winX, &winY, &winW, &winH, PoeWinTitle
    quote := Chr(34)
    points := SerializePoints(BorderPoints())
    arguments := "-Points " quote points quote
        . " -WindowLeft " winX " -WindowTop " winY
        . " -WindowWidth " winW " -WindowHeight " winH
        . " -HoverDelay " BorderHoverDelay
    return RunOcrHelper(arguments)
}

; Developer smoke-test: run the embedded Windows OCR helper against an image.
if A_Args.Length >= 2 && A_Args[1] = "--ocr-file" {
    quote := Chr(34)
    result := RunOcrHelper("-ImagePath " quote A_Args[2] quote, false)
    FileAppend result, "*", "UTF-8"
    ExitApp
}

; ---- F5 / F6: capture diagonal board-border calibration points ----
F5:: {
    global
    MouseGetPos &x, &y
    BorderTLx := x, BorderTLy := y
    IniWrite BorderTLx, IniFile, "board", "TopLeftX"
    IniWrite BorderTLy, IniFile, "board", "TopY"
    Flash "Top-left board border set: " BorderTLx ", " BorderTLy
}
F6:: {
    global
    MouseGetPos &x, &y
    BorderBRx := x, BorderBRy := y
    IniWrite BorderBRx, IniFile, "board", "BottomRightX"
    IniWrite BorderBRy, IniFile, "board", "BottomY"
    Flash "Bottom-right board border set: " BorderBRx ", " BorderBRy
}

; ---- F7 / F8: capture the grid corners ----
F7:: {
    global
    MouseGetPos &x, &y
    TLx := x, TLy := y
    IniWrite TLx, IniFile, "grid", "TLx"
    IniWrite TLy, IniFile, "grid", "TLy"
    Flash "Top-left set: " TLx ", " TLy
}
F8:: {
    global
    MouseGetPos &x, &y
    BRx := x, BRy := y
    IniWrite BRx, IniFile, "grid", "BRx"
    IniWrite BRy, IniFile, "grid", "BRy"
    Flash "Bottom-right set: " BRx ", " BRy
}

; ---- F10: abort ----
F10:: {
    global Running, OcrPid
    Running := false
    if OcrPid && ProcessExist(OcrPid) {
        ProcessClose OcrPid
        OcrPid := 0
    }
    Flash "Aborting..."
}

; ---- F9: the real import sweep ----
F9:: {
    global
    if !Calibrated() {
        MsgBox "Calibrate first (F7 top-left, F8 bottom-right)."
        return
    }
    if !WinExist(PoeWinTitle) {
        MsgBox "Can't find the PoE window (" PoeWinTitle ")."
        return
    }
    if !WinExist(BrowserWinTitle) {
        MsgBox "Can't find a window titled '" BrowserWinTitle "'.`nOpen the solver and make it the active browser tab."
        return
    }

    Running := true
    copied := 0, skipped := 0, blob := "", borderBlob := "", seen := Map()

    ; ---- Phase 1: copy every chart while staying in PoE ----
    WinActivate PoeWinTitle
    if !WinWaitActive(PoeWinTitle, , 2) {
        Running := false
        Flash "Couldn't focus PoE.", 3000
        return
    }
    Sleep ActivateDelay

    Loop GridRows {
        if !Running
            break
        r := A_Index - 1
        Loop GridCols {
            if !Running
                break
            c := A_Index - 1
            p := CellPos(r, c)
            A_Clipboard := ""
            MouseMove p[1], p[2], 0
            Sleep HoverDelay
            Send "^c"
            if !ClipWait(ClipTimeout) {
                skipped++                 ; empty slot - nothing copied
                continue
            }
            clip := Trim(A_Clipboard, " `t`r`n")
            if !InStr(clip, "Item Class") || seen.Has(clip) {
                skipped++                 ; not an item, or a duplicate
                continue
            }
            seen[clip] := true
            blob .= (blob = "" ? "" : "`n") clip
            copied++
            ToolTip "Copying... row " (r+1) " col " (c+1)
                . "`ncharts " copied "   skipped " skipped
                . "`n(F10 to abort)"
        }
    }

    ; ---- Phase 2: OCR the 12 board-border modifier tooltips ----
    if Running && BoardCalibrated() {
        ToolTip "Reading 12 board borders with Windows OCR..."
            . "`nThis can take 15-30 seconds on a 4K screen."
            . "`n(F10 to abort)"
        borderBlob := ScanBorders()
    }

    ; ---- Phase 3: one switch, one paste of the whole batch ----
    if Running && (copied > 0 || borderBlob != "") {
        payload := blob
        if (payload != "" && borderBlob != "")
            payload .= "`n"
        payload .= borderBlob
        A_Clipboard := payload
        ClipWait(1)
        WinActivate BrowserWinTitle
        if WinWaitActive(BrowserWinTitle, , 2) {
            Sleep ActivateDelay
            Send "^v"
            Sleep PasteDelay
        } else {
            Running := false
            Flash "Copied " copied " charts but couldn't focus the browser to paste.", 4000
            return
        }
    }

    Running := false
    borderNote := BoardCalibrated()
        ? (borderBlob != "" ? " + 12 border OCR scans" : " (border OCR failed)")
        : " (borders skipped: calibrate F5/F6)"
    Flash "Done. Sent " copied " charts" borderNote
        . "; skipped " skipped " empty/dup cells.", 6000
}
