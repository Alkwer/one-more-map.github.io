#Requires AutoHotkey v2.0
#SingleInstance Force
SetWorkingDir A_ScriptDir
CoordMode "Mouse", "Screen"  ; runtime targets are screen pixels; saved points are PoE-client ratios
CoordMode "ToolTip", "Screen"

; =====================================================================
;  Allflame Voyage - bulk chart + board-border importer  (AutoHotkey v2)
;
;  Three phases:
;    Phase 1 - stays in PoE, switches through both chart-stash tabs, hovers
;              every cell and Ctrl+C's it, appending up to 120 chart slots
;              with the default 6x10 grids (no window switching).
;    Phase 2 - hovers the 12 board-border modifiers and the optional reroll
;              button. PowerShell source is streamed over stdin and executed
;              in memory;
;              no .ps1 file is created. Each OCR attempt briefly writes a raw
;              full-window PNG and UTF-8 result under TEMP. Border OCR also
;              writes a filtered PNG and, only if needed, a normalized fallback.
;              Cleanup runs after attempts, aborts/timeouts and normal exit;
;              none of these local artifacts is uploaded.
;    Phase 3 - opens the fixed solver URL through the Windows shell, activates
;              the resulting supported-browser window, and pastes the payload.
;              If that fails, the payload stays on the clipboard for Ctrl+V.
;    Empty cells copy nothing and are skipped.
;
;  ---------------------------------------------------------------
;  ONE-TIME SETUP
;   1. Install AutoHotkey v2  (https://www.autohotkey.com/).
;   2. In PoE open the Voyage board so the Chart panel is fully
;      visible and NOT scrolled. Use Windowed or Windowed Fullscreen
;      (exclusive fullscreen can block the mouse/keys).
;   3. Double-click this file to run it (it lives in the tray).
;   4. Keep PoE in the foreground when using calibration or scan hotkeys. The
;      real PoE window is authenticated automatically every time.
;   5. F9 opens the solver page automatically. There are no browser or game
;      binding hotkeys and no saved browser window state.
;
;  CALIBRATE THE BOARD BORDERS (once; saved to voyage-import.ini)
;   - Point at the TOP-LEFT corner of the border-modifier square, press F5.
;   - Point at the BOTTOM-RIGHT corner of the border-modifier square, press F6.
;   All 12 hover points are kept inside this rectangle.
;
;  EXACT BORDER CALIBRATION (optional; use if the quick mode misses)
;   - Press Ctrl+F5 to start. The script names the next modifier to record.
;   - Hover that modifier and press Ctrl+F6. Repeat for all 12 modifiers.
;   - Press Ctrl+F4 to preview every saved point slowly without running OCR.
;   Exact points override the F5/F6 rectangle until F5 or F6 is used again.
;
;  CALIBRATE THE REROLL COST (optional; saved to voyage-import.ini)
;   - Hover the compass-shaped border reroll button and press Ctrl+F7.
;   The helper will then read its cost and keep the solver's reroll counter
;   synchronized on every F9 / Ctrl+F9 scan.
;
;  CALIBRATE THE CHART GRID (once; saved to voyage-import.ini)
;   - Use the small chart INVENTORY squares on the right side of the Voyage
;     screen, not the large 3x3 Voyage board in the middle.
;   - Hover the CENTRE of the TOP-LEFT chart, press F7.
;   - Hover the CENTRE of the BOTTOM-RIGHT cell of the 6-wide grid
;     (the far corner cell, even if it's empty), press  F8.
;   - Hover the CENTRE of chart-stash tab 1, press Shift+F7.
;   - Hover the CENTRE of chart-stash tab 2, press Shift+F8.
;   - Set GridCols / GridRows below to match your panel.
;   - Tray menu -> Configure blank-row skip changes how many fully empty rows
;     end a tab sweep; choose 0 if you keep Charts below large gaps.
;
;  RUN
;   F9      = copy charts + board borders and import them into the solver
;   Ctrl+F9 = refresh only the 12 board borders (use after a reroll)
;             and the reroll cost when Ctrl+F7 was calibrated
;   F10     = abort at any time
;
;  If PoE is running as administrator, run this script as admin too,
;  or its keypresses won't reach the game. Don't touch the mouse or
;  keyboard while it's sweeping.
;  If you've bound Inventory (or anything else) to the C key, move that
;  bind before importing: PoE hardcodes item-copy to Ctrl+C, and on
;  empty cells the game lets the C fall through to your bind, flapping
;  panels mid-sweep (issue #37).
; =====================================================================

; ---------------- CONFIG ----------------
ExpectedPoeClass := "POEWindowClass"
PoeHwnd := 0
PoePid := 0
PoeImagePath := ""
LastDeliveryError := ""
SolverLaunchUrl := "https://alkwer.github.io/one-more-map.github.io/allflame-voyage-solver/"
SolverPageTitle := "Allflame Voyage Solver - PoE 3.29"

GridCols := 6    ; columns in the Chart panel
GridRows := 10   ; rows to sweep (overshooting is fine - empty cells skip)

ActivateDelay := 60    ; ms after focusing a window (paid only ~twice total now)
TabSwitchDelay := 180  ; ms for the selected chart-stash tab to redraw
HoverDelay    := 28    ; ms for PoE to register the cursor before Ctrl+C
BorderHoverDelay := 250 ; ms for a border tooltip to appear before OCR capture
RerollHoverDelay := 350 ; ms for the reroll-cost tooltip to appear
BrowserOpenTimeout := 8 ; seconds to wait for the solver page to open
BrowserLoadDelay := 900 ; ms for a newly opened solver page to install its paste handler
BrowserPasteDelay := 180 ; ms after activating the solver page
BorderOcrAttempts := 2  ; retry once when both filtered and unfiltered OCR are empty
BorderPreviewDelay := 900 ; ms per point during the Ctrl+F4 visual preview
ClipTimeout   := 0.2   ; seconds to wait for Ctrl+C (only empty cells wait the full time)
AltRevealDelay := 350  ; ms for held-Alt to reveal every border tooltip at once
OcrTimeout    := 90    ; seconds before a stuck Windows OCR scan is stopped
OcrStdinCapacity := 131072 ; keeps the in-memory helper write below the pipe buffer
; If it ever MISSES a chart, raise HoverDelay ~10ms at a time (the cursor
; isn't settling before Ctrl+C).
; ----------------------------------------

; version stamp - shown in diagnostic bundles so reports say what they ran
ScriptVersion := "2026-08-15"

IniFile := A_ScriptDir "\voyage-import.ini"
; Stop a tab sweep after this many completely blank rows in a row. Set 0 to
; scan every cell (useful when Charts are parked below a large gap).
EmptySkipRows := IniRead(IniFile, "sweep", "EmptySkipRows", "2") + 0
CalibrationSpaceVersion := "poe-client-ratio-v1"
CalibrationSpace := IniRead(IniFile, "meta", "CoordinateSpace", "legacy-screen")
TLx := IniRead(IniFile, "grid", "TLx", "0") + 0
TLy := IniRead(IniFile, "grid", "TLy", "0") + 0
BRx := IniRead(IniFile, "grid", "BRx", "0") + 0
BRy := IniRead(IniFile, "grid", "BRy", "0") + 0
Tab1X := IniRead(IniFile, "grid", "Tab1X", "0") + 0
Tab1Y := IniRead(IniFile, "grid", "Tab1Y", "0") + 0
Tab2X := IniRead(IniFile, "grid", "Tab2X", "0") + 0
Tab2Y := IniRead(IniFile, "grid", "Tab2Y", "0") + 0
; support escape hatch: set AltScan=0 under [sweep] in the ini to skip the
; one-screenshot Alt border scan entirely and always hover each border
AltScanBorders := IniRead(IniFile, "sweep", "AltScan", "1") + 0
; screen capture backend for border OCR: auto = Windows.Graphics.Capture
; with HDR tone mapping when Windows HDR is detected, plain GDI otherwise;
; gdi / wgc force one path (issue #33)
CaptureMode := IniRead(IniFile, "sweep", "Capture", "auto")
BorderTLx := IniRead(IniFile, "board", "TopLeftX", "0") + 0
BorderTLy := IniRead(IniFile, "board", "TopY", "0") + 0
BorderBRx := IniRead(IniFile, "board", "BottomRightX", "0") + 0
BorderBRy := IniRead(IniFile, "board", "BottomY", "0") + 0
RerollX := IniRead(IniFile, "board", "RerollX", "0") + 0
RerollY := IniRead(IniFile, "board", "RerollY", "0") + 0
ExactBorderPoints := []
Loop 12 {
    exactX := IniRead(IniFile, "board-exact", "Point" A_Index "X", "0") + 0
    exactY := IniRead(IniFile, "board-exact", "Point" A_Index "Y", "0") + 0
    if (exactX = 0 && exactY = 0) {
        ExactBorderPoints := []
        break
    }
    ExactBorderPoints.Push([exactX, exactY])
}
if (CalibrationSpace != CalibrationSpaceVersion) {
    ; Absolute desktop coordinates from older builds cannot be translated after
    ; PoE moves to another monitor. Ignore them and clear them lazily when the
    ; first new calibration point is captured.
    TLx := TLy := BRx := BRy := 0
    Tab1X := Tab1Y := Tab2X := Tab2Y := 0
    BorderTLx := BorderTLy := BorderBRx := BorderBRy := 0
    RerollX := RerollY := 0
    ExactBorderPoints := []
}
ExactBorderNext := 0
ScriptPid := ProcessExist()
; %TEMP% can arrive as an 8.3 short path (C:\Users\HARDPC~1\...) and
; PowerShell's path normalizer chokes on the "~" component (issue #27) -
; expand to the real long path before any OCR artifact paths are built.
LongPath(path) {
    buf := Buffer(1040, 0)
    len := DllCall("GetLongPathNameW", "Str", path, "Ptr", buf.Ptr, "UInt", 520, "UInt")
    return (len > 0 && len <= 520) ? StrGet(buf, "UTF-16") : path
}

NormalizeWindowsPath(path) {
    if (SubStr(path, 1, 4) = "\\?\")
        path := SubStr(path, 5)
    return StrLower(RTrim(LongPath(path), "\"))
}

; ---------------- ACTIVITY LOG ----------------
; The rolling log intentionally records only coarse state and timings: never
; OCR text, calibration coordinates, paths, window titles, or screenshots.
LogFile := A_ScriptDir "\voyage-import.log"
Log(msg) {
    global LogFile
    try {
        size := 0
        try size := FileGetSize(LogFile)
        if (size > 262144) {
            keep := SubStr(FileRead(LogFile, "UTF-8"), -131072)
            FileDelete LogFile
            FileAppend keep, LogFile, "UTF-8"
        }
        FileAppend FormatTime(, "yyyy-MM-dd HH:mm:ss") " | " msg "`n", LogFile, "UTF-8"
    }
}
Log("started v" ScriptVersion " | AHK " A_AhkVersion " | Windows " A_OSVersion
    . " | screen " A_ScreenWidth "x" A_ScreenHeight " @ " A_ScreenDPI " DPI | monitors " MonitorGetCount())

RejectReparseComponents(path) {
    if !RegExMatch(path, "i)^([a-z]:\\)(.*)$", &parts)
        throw Error("Trusted Windows path is not a local absolute path: " path)
    current := parts[1]
    for component in StrSplit(parts[2], "\") {
        if (component = "")
            continue
        current .= (SubStr(current, -1) = "\" ? "" : "\") component
        attributes := DllCall("GetFileAttributesW", "Str", current, "UInt")
        if (attributes = 0xFFFFFFFF)
            throw Error("Trusted Windows path is unavailable: " current)
        if (attributes & 0x400)
            throw Error("Refusing a reparse point in the trusted Windows path: " current)
    }
}

CanonicalFilePath(path) {
    static OPEN_EXISTING := 3
    static SHARE_ALL := 0x7
    static FILE_FLAG_OPEN_REPARSE_POINT := 0x200000
    handle := DllCall(
        "CreateFileW",
        "Str", path,
        "UInt", 0,
        "UInt", SHARE_ALL,
        "Ptr", 0,
        "UInt", OPEN_EXISTING,
        "UInt", FILE_FLAG_OPEN_REPARSE_POINT,
        "Ptr", 0,
        "Ptr"
    )
    if (handle = -1)
        throw Error("Trusted Windows PowerShell is unavailable: " path)
    try {
        attributeInfo := Buffer(8, 0)
        if !DllCall(
            "GetFileInformationByHandleEx",
            "Ptr", handle,
            "Int", 9,
            "Ptr", attributeInfo.Ptr,
            "UInt", attributeInfo.Size,
            "Int"
        )
            throw Error("Could not inspect the trusted Windows PowerShell image.")
        if (NumGet(attributeInfo, 0, "UInt") & 0x400)
            throw Error("Refusing a reparse point for the Windows PowerShell image.")

        pathBuffer := Buffer(65536, 0)
        length := DllCall(
            "GetFinalPathNameByHandleW",
            "Ptr", handle,
            "Ptr", pathBuffer.Ptr,
            "UInt", 32768,
            "UInt", 0,
            "UInt"
        )
        if (length = 0 || length >= 32768)
            throw Error("Could not canonicalize the trusted Windows PowerShell image.")
        return StrGet(pathBuffer, length, "UTF-16")
    } finally {
        DllCall("CloseHandle", "Ptr", handle)
    }
}

ResolveTrustedPowerShell() {
    windowsDir := LongPath(A_WinDir)
    expectedPath := windowsDir "\System32\WindowsPowerShell\v1.0\powershell.exe"
    RejectReparseComponents(expectedPath)

    ; A 32-bit AutoHotkey process must use Sysnative to bypass WOW64's
    ; System32 -> SysWOW64 redirection. The child image still canonicalizes to
    ; the expected native System32 path below.
    launchPath := (A_Is64bitOS && A_PtrSize = 4)
        ? windowsDir "\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
        : expectedPath
    canonicalPath := CanonicalFilePath(launchPath)
    if (NormalizeWindowsPath(canonicalPath) != NormalizeWindowsPath(expectedPath))
        throw Error("Windows PowerShell resolved outside the trusted System32 path.")
    return { LaunchPath: launchPath, ExpectedPath: expectedPath }
}

ProcessImagePath(pid) {
    static PROCESS_QUERY_LIMITED_INFORMATION := 0x1000
    handle := DllCall("OpenProcess", "UInt", PROCESS_QUERY_LIMITED_INFORMATION, "Int", false, "UInt", pid, "Ptr")
    if !handle
        throw Error("Could not inspect the Windows OCR child process.")
    try {
        size := 32768
        imageBuffer := Buffer(size * 2, 0)
        if !DllCall(
            "QueryFullProcessImageNameW",
            "Ptr", handle,
            "UInt", 0,
            "Ptr", imageBuffer.Ptr,
            "UIntP", &size,
            "Int"
        )
            throw Error("Could not verify the Windows OCR child image.")
        return StrGet(imageBuffer, size, "UTF-16")
    } finally {
        DllCall("CloseHandle", "Ptr", handle)
    }
}

CanonicalWindowImageForWindow(hwnd) {
    pid := WinGetPID("ahk_id " hwnd)
    imagePath := CanonicalFilePath(ProcessImagePath(pid))
    if (SubStr(imagePath, 1, 4) = "\\?\")
        imagePath := SubStr(imagePath, 5)
    return LongPath(imagePath)
}

CanonicalPoeImageForWindow(hwnd) {
    return CanonicalWindowImageForWindow(hwnd)
}

IsExpectedPoeImage(imagePath) {
    SplitPath imagePath, &fileName, &installDir
    if !RegExMatch(fileName, "i)^PathOfExile[_A-Za-z0-9-]*\.exe$")
        return false

    ; Older installations keep the game data in Content.ggpk. Current Steam
    ; installations use the Bundles2 index instead, so accept either complete
    ; layout while still rejecting an executable copied outside a PoE install.
    contentArchive := installDir "\Content.ggpk"
    attributes := FileExist(contentArchive)
    if attributes && !InStr(attributes, "D")
        return true

    bundleIndex := installDir "\Bundles2\_.index.bin"
    attributes := FileExist(bundleIndex)
    return attributes && !InStr(attributes, "D")
}

PoeCandidateWindows() {
    global ExpectedPoeClass
    candidates := []
    for hwnd in WinGetList("ahk_class " ExpectedPoeClass) {
        try {
            imagePath := CanonicalPoeImageForWindow(hwnd)
            if IsExpectedPoeImage(imagePath)
                candidates.Push(hwnd)
        }
    }
    return candidates
}

BindForegroundPoeWindow() {
    global ExpectedPoeClass, PoeHwnd, PoePid, PoeImagePath
    activeHwnd := WinExist("A")
    if !activeHwnd
        throw Error("No foreground window is available to bind.")
    if (WinGetClass("ahk_id " activeHwnd) != ExpectedPoeClass)
        throw Error("The foreground window is not the expected Path of Exile window class.")

    candidates := PoeCandidateWindows()
    if (candidates.Length != 1)
        throw Error("Expected exactly one authenticated Path of Exile window; found " candidates.Length ".")
    if (candidates[1] != activeHwnd)
        throw Error("The authenticated Path of Exile window is not in the foreground.")

    imagePath := CanonicalPoeImageForWindow(activeHwnd)
    RejectReparseComponents(imagePath)
    if !IsExpectedPoeImage(imagePath)
        throw Error("The foreground process is not inside a complete Path of Exile installation.")

    PoeHwnd := activeHwnd
    PoePid := WinGetPID("ahk_id " activeHwnd)
    PoeImagePath := imagePath
}

ValidateBoundPoeWindow(requireForeground := false) {
    global ExpectedPoeClass, PoeHwnd, PoePid, PoeImagePath
    if !PoeHwnd || !WinExist("ahk_id " PoeHwnd)
        return false
    try {
        if (WinGetClass("ahk_id " PoeHwnd) != ExpectedPoeClass)
            return false
        if (WinGetPID("ahk_id " PoeHwnd) != PoePid)
            return false
        currentImagePath := CanonicalPoeImageForWindow(PoeHwnd)
        RejectReparseComponents(currentImagePath)
        if !IsExpectedPoeImage(currentImagePath)
            return false
        if (NormalizeWindowsPath(currentImagePath) != NormalizeWindowsPath(PoeImagePath))
            return false
        candidates := PoeCandidateWindows()
        if (candidates.Length != 1 || candidates[1] != PoeHwnd)
            return false
        if requireForeground && (WinExist("A") != PoeHwnd)
            return false
        return true
    }
    return false
}

RequireBoundPoeForeground() {
    global PoeHwnd, PoePid, PoeImagePath
    if ValidateBoundPoeWindow(true)
        return true
    try {
        BindForegroundPoeWindow()
        return true
    } catch as error {
        PoeHwnd := 0
        PoePid := 0
        PoeImagePath := ""
        Flash "Focus the real Path of Exile window and try again.`n" error.Message, 5000
        return false
    }
}

ActivateBoundPoeWindow() {
    global PoeHwnd
    if !ValidateBoundPoeWindow(false)
        return false
    WinActivate "ahk_id " PoeHwnd
    if !WinWaitActive("ahk_id " PoeHwnd, , 2)
        return false
    return ValidateBoundPoeWindow(true)
}

ResetCalibrationVariables() {
    global TLx, TLy, BRx, BRy, Tab1X, Tab1Y, Tab2X, Tab2Y
    global BorderTLx, BorderTLy, BorderBRx, BorderBRy, RerollX, RerollY
    global ExactBorderPoints, ExactBorderNext
    TLx := TLy := BRx := BRy := 0
    Tab1X := Tab1Y := Tab2X := Tab2Y := 0
    BorderTLx := BorderTLy := BorderBRx := BorderBRy := 0
    RerollX := RerollY := 0
    ExactBorderPoints := []
    ExactBorderNext := 0
}

BeginClientCalibration() {
    global CalibrationSpace, CalibrationSpaceVersion, IniFile
    if (CalibrationSpace = CalibrationSpaceVersion)
        return

    ; Do not mix legacy desktop pixels with monitor-independent client ratios.
    try IniDelete IniFile, "grid"
    try IniDelete IniFile, "board"
    try IniDelete IniFile, "board-exact"
    ResetCalibrationVariables()
    CalibrationSpace := CalibrationSpaceVersion
    IniWrite CalibrationSpace, IniFile, "meta", "CoordinateSpace"
    Flash "Old screen-based calibration was cleared once.`nRecalibrate the required points in PoE.", 5000
}

CapturePoeClientPoint() {
    global PoeHwnd
    BeginClientCalibration()
    WinGetClientPos &clientLeft, &clientTop, &clientWidth, &clientHeight, "ahk_id " PoeHwnd
    if (clientWidth <= 0 || clientHeight <= 0)
        throw Error("Could not read the Path of Exile client area.")
    MouseGetPos &mouseX, &mouseY
    if (mouseX < clientLeft || mouseX > clientLeft + clientWidth
        || mouseY < clientTop || mouseY > clientTop + clientHeight)
        throw Error("The mouse pointer is outside the bound Path of Exile window.")
    return [(mouseX - clientLeft) / clientWidth, (mouseY - clientTop) / clientHeight]
}

PoeScreenPoint(clientRatioX, clientRatioY) {
    global PoeHwnd
    WinGetClientPos &clientLeft, &clientTop, &clientWidth, &clientHeight, "ahk_id " PoeHwnd
    if (clientWidth <= 0 || clientHeight <= 0)
        throw Error("Could not read the Path of Exile client area.")
    return [
        Round(clientLeft + clientRatioX * clientWidth),
        Round(clientTop + clientRatioY * clientHeight)
    ]
}

IsExpectedBrowserImage(imagePath) {
    SplitPath imagePath, &fileName
    return RegExMatch(fileName, "i)^(?:arc|brave|chrome|firefox|librewolf|msedge|opera|opera_gx|vivaldi)\.exe$")
}

IsSolverBrowserWindow(hwnd) {
    global SolverPageTitle
    if !hwnd || !WinExist("ahk_id " hwnd)
        return false
    try {
        processName := WinGetProcessName("ahk_id " hwnd)
        return IsExpectedBrowserImage(processName)
            && InStr(WinGetTitle("ahk_id " hwnd), SolverPageTitle)
    }
    return false
}

FindSolverBrowserWindow() {
    activeHwnd := WinExist("A")
    if IsSolverBrowserWindow(activeHwnd)
        return activeHwnd
    for hwnd in WinGetList() {
        if IsSolverBrowserWindow(hwnd)
            return hwnd
    }
    return 0
}

OpenSolverWindow() {
    global SolverLaunchUrl, BrowserOpenTimeout, BrowserLoadDelay

    solverHwnd := FindSolverBrowserWindow()
    if !solverHwnd {
        ; Ask the normal Windows shell to open the fixed solver URL. This also
        ; works when the helper runs elevated and the user's browser does not.
        try ComObject("Shell.Application").ShellExecute(SolverLaunchUrl)
        catch
            return 0
    }

    deadline := A_TickCount + BrowserOpenTimeout * 1000
    while (A_TickCount < deadline) {
        Sleep 150
        solverHwnd := FindSolverBrowserWindow()
        if !solverHwnd
            continue
        WinActivate "ahk_id " solverHwnd
        if !WinWaitActive("ahk_id " solverHwnd, , 2)
            continue
        Sleep BrowserLoadDelay
        return solverHwnd
    }
    return 0
}

PowerShellTrust := ResolveTrustedPowerShell()
PowerShellExe := PowerShellTrust.LaunchPath
ExpectedPowerShellImage := PowerShellTrust.ExpectedPath
TempDir := LongPath(A_Temp)
; The PowerShell source never touches disk. This short-lived UTF-8 result and
; the PNGs cleaned below are the only files created by normal OCR attempts.
OcrOutput := TempDir "\voyage-border-ocr-" ScriptPid ".txt"
OcrPid := 0
OcrProcessHandle := 0
OcrThreadHandle := 0
OcrStdinHandle := 0
LastBorderScanBlocks := 0
Running := false
A_TrayMenu.Add "Configure blank-row skip...", PromptEmptySkip

StopOcrProcess() {
    global OcrPid, OcrProcessHandle, OcrThreadHandle, OcrStdinHandle
    if OcrStdinHandle {
        try DllCall("CloseHandle", "Ptr", OcrStdinHandle)
        OcrStdinHandle := 0
    }
    if OcrProcessHandle {
        try {
            if (DllCall("WaitForSingleObject", "Ptr", OcrProcessHandle, "UInt", 0, "UInt") = 0x102)
                DllCall("TerminateProcess", "Ptr", OcrProcessHandle, "UInt", 1)
            DllCall("WaitForSingleObject", "Ptr", OcrProcessHandle, "UInt", 1000, "UInt")
        }
    } else if OcrPid && ProcessExist(OcrPid) {
        try ProcessClose OcrPid
        try ProcessWaitClose OcrPid, 1
    }
    if OcrThreadHandle {
        try DllCall("CloseHandle", "Ptr", OcrThreadHandle)
        OcrThreadHandle := 0
    }
    if OcrProcessHandle {
        try DllCall("CloseHandle", "Ptr", OcrProcessHandle)
        OcrProcessHandle := 0
    }
    OcrPid := 0
}

CleanupOcrArtifacts() {
    global OcrOutput, ScriptPid
    try FileDelete OcrOutput
    try FileDelete OcrOutput ".tmp-*"
    try FileDelete A_Temp "\voyage-border-" ScriptPid "-*.png"
    try FileDelete A_Temp "\voyage-ocr-filtered-" ScriptPid "-*.png"
    try FileDelete A_Temp "\voyage-ocr-normalized-" ScriptPid "-*.png"
}

CleanupOcr(*) {
    StopOcrProcess()
    CleanupOcrArtifacts()
}
OnExit CleanupOcr

; ---------------- DIAGNOSTIC BUNDLE ----------------
; One click creates a privacy-safe zip. It deliberately excludes calibration
; coordinates, OCR payloads, screenshots, window titles and filesystem paths.
SaveDiagnostics(*) {
    global ScriptVersion, LogFile, TempDir, CaptureMode, PowerShellExe
    ts := FormatTime(, "yyyyMMdd-HHmmss")
    dir := TempDir "\voyage-diag-bundle-" ts
    try DirCreate dir
    info := "Allflame Voyage importer - diagnostic bundle`n"
        . "generated: " FormatTime(, "yyyy-MM-dd HH:mm:ss") "`n"
        . "script version: " ScriptVersion "`n"
        . "AutoHotkey: " A_AhkVersion "`n"
        . "Windows: " A_OSVersion (A_Is64bitOS ? " 64-bit" : "") "`n"
        . "primary screen: " A_ScreenWidth "x" A_ScreenHeight " @ " A_ScreenDPI " DPI`n"
        . "monitors: " MonitorGetCount() "`n"
        . "running as admin: " (A_IsAdmin ? "yes" : "no") "`n"
    info .= "PoE window authenticated: " (ValidateBoundPoeWindow(false) ? "yes" : "no") "`n"
        . "grid calibrated: " (Calibrated() ? "yes" : "no") "`n"
        . "board calibrated: " (BoardCalibrated() ? "yes" : "no") "`n"
        . "page tabs calibrated: " (StashTabsCalibrated() ? "yes" : "no") "`n"
        . "capture mode: " CaptureMode "`n"
    try FileAppend info, dir "\info.txt", "UTF-8"
    try FileCopy LogFile, dir "\voyage-import.log"
    zip := A_Desktop "\voyage-import-diagnostics-" ts ".zip"
    try FileDelete zip
    EnvSet "VOYAGE_DIAG_DIR", dir
    EnvSet "VOYAGE_DIAG_ZIP", zip
    quote := Chr(34)
    command := quote PowerShellExe quote
        . " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
        . quote "Get-ChildItem -LiteralPath $env:VOYAGE_DIAG_DIR | Compress-Archive -DestinationPath $env:VOYAGE_DIAG_ZIP -Force" quote
    try RunWait command, , "Hide"
    finally {
        EnvSet "VOYAGE_DIAG_DIR"
        EnvSet "VOYAGE_DIAG_ZIP"
    }
    if FileExist(zip) {
        try DirDelete dir, 1
        Log("privacy-safe diagnostic bundle saved")
        MsgBox "Saved a privacy-safe diagnostic bundle to your desktop.`n`n"
            . "It contains system/capture status and the activity log; no OCR text,"
            . " screenshots, calibration coordinates, window titles or paths.", "Diagnostic bundle"
    } else {
        try DirDelete dir, 1
        MsgBox "Couldn't create the diagnostic zip.", "Diagnostic bundle"
    }
}

A_TrayMenu.Insert("2&", "Save privacy-safe diagnostic bundle...", SaveDiagnostics)
; ------------------------------------------

Flash(text, ms := 1400) {
    ToolTip text
    SetTimer () => ToolTip(), -ms
}

CellPos(row, col) {
    global TLx, TLy, BRx, BRy, GridCols, GridRows
    dx := (GridCols > 1) ? (BRx - TLx) / (GridCols - 1) : 0
    dy := (GridRows > 1) ? (BRy - TLy) / (GridRows - 1) : 0
    return PoeScreenPoint(TLx + col * dx, TLy + row * dy)
}

ClientRatioPointValid(x, y) => (x > 0 && x <= 1 && y > 0 && y <= 1)

GridCalibrated() {
    global TLx, TLy, BRx, BRy
    return ClientRatioPointValid(TLx, TLy)
        && ClientRatioPointValid(BRx, BRy)
        && BRx > TLx && BRy > TLy
}

StashTabsCalibrated() {
    global Tab1X, Tab1Y, Tab2X, Tab2Y
    return ClientRatioPointValid(Tab1X, Tab1Y)
        && ClientRatioPointValid(Tab2X, Tab2Y)
        && (Tab1X != Tab2X || Tab1Y != Tab2Y)
}

Calibrated() => GridCalibrated() && StashTabsCalibrated()

ChartTabPoints() {
    global Tab1X, Tab1Y, Tab2X, Tab2Y
    return [PoeScreenPoint(Tab1X, Tab1Y), PoeScreenPoint(Tab2X, Tab2Y)]
}

IsChartText(text) {
    return InStr(text, "Item Class: Chart")
        || InStr(text, "아이템 종류: 해도")
}

ExactBordersCalibrated() {
    global ExactBorderPoints
    if (ExactBorderPoints.Length != 12)
        return false
    for point in ExactBorderPoints {
        if !ClientRatioPointValid(point[1], point[2])
            return false
    }
    return true
}

BoardCalibrated() {
    global BorderTLx, BorderTLy, BorderBRx, BorderBRy
    return ExactBordersCalibrated()
        || (ClientRatioPointValid(BorderTLx, BorderTLy)
            && ClientRatioPointValid(BorderBRx, BorderBRy)
            && BorderBRx > BorderTLx && BorderBRy > BorderTLy)
}

RerollCostCalibrated() {
    global RerollX, RerollY
    return ClientRatioPointValid(RerollX, RerollY)
}

BorderPointLabel(index) {
    labels := [
        "TOP - left", "TOP - middle", "TOP - right",
        "RIGHT - top", "RIGHT - middle", "RIGHT - bottom",
        "BOTTOM - left", "BOTTOM - middle", "BOTTOM - right",
        "LEFT - top", "LEFT - middle", "LEFT - bottom"
    ]
    return (index >= 1 && index <= labels.Length) ? labels[index] : "unknown"
}

ClearExactBorderCalibration() {
    global ExactBorderPoints, ExactBorderNext, IniFile
    ExactBorderPoints := []
    ExactBorderNext := 0
    try IniDelete IniFile, "board-exact"
}

BorderPoints() {
    global BorderTLx, BorderTLy, BorderBRx, BorderBRy, ExactBorderPoints
    if ExactBordersCalibrated()
        clientPoints := ExactBorderPoints
    else {
        ; F5/F6 define the outer rectangle. Each modifier sits at the centre
        ; of one of the three equal edge segments, never outside that rectangle.
        cellW := (BorderBRx - BorderTLx) / 3
        cellH := (BorderBRy - BorderTLy) / 3
        clientPoints := []

        ; indices 0-2: top, left to right
        Loop 3
            clientPoints.Push([BorderTLx + (A_Index - 0.5) * cellW, BorderTLy])
        ; indices 3-5: right, top to bottom
        Loop 3
            clientPoints.Push([BorderBRx, BorderTLy + (A_Index - 0.5) * cellH])
        ; indices 6-8: bottom, left to right
        Loop 3
            clientPoints.Push([BorderTLx + (A_Index - 0.5) * cellW, BorderBRy])
        ; indices 9-11: left, top to bottom
        Loop 3
            clientPoints.Push([BorderTLx, BorderTLy + (A_Index - 0.5) * cellH])
    }

    points := []
    for point in clientPoints
        points.Push(PoeScreenPoint(point[1], point[2]))
    return points
}

RerollScreenPoint() {
    global RerollX, RerollY
    return PoeScreenPoint(RerollX, RerollY)
}

OcrPowerShell() {
    return "
(
[int]$Index = $env:VOYAGE_OCR_INDEX
[int]$WindowLeft = $env:VOYAGE_OCR_WINDOW_LEFT
[int]$WindowTop = $env:VOYAGE_OCR_WINDOW_TOP
[int]$WindowWidth = $env:VOYAGE_OCR_WINDOW_WIDTH
[int]$WindowHeight = $env:VOYAGE_OCR_WINDOW_HEIGHT
[string]$ImagePath = $env:VOYAGE_OCR_IMAGE_PATH
[string]$PreferredLanguage = $env:VOYAGE_OCR_PREFERRED_LANGUAGE
[string]$RunId = $env:VOYAGE_OCR_RUN_ID
[bool]$RerollCost = $env:VOYAGE_OCR_REROLL_COST -eq '1'
[string]$Mode = $env:VOYAGE_OCR_MODE
[string]$PointSpec = $env:VOYAGE_OCR_POINT_SPEC
[string]$CaptureMode = $env:VOYAGE_OCR_CAPTURE_MODE
[string]$OutputPath = $env:VOYAGE_OCR_OUTPUT_PATH
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    throw 'The trusted OCR output path was not provided.'
}
if ([string]::IsNullOrWhiteSpace($Mode)) { $Mode = 'border' }
if ([string]::IsNullOrWhiteSpace($CaptureMode)) { $CaptureMode = 'auto' }

$ErrorActionPreference = 'Stop'
$script:RecognizerLanguage = ''
if ([string]::IsNullOrWhiteSpace($RunId)) { $RunId = [string]$PID }
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Atomic {
    param([string]$Path, [string]$Content)
    $tmp = "$Path.tmp-$PID-$([Guid]::NewGuid().ToString('N'))"
    try {
        [System.IO.File]::WriteAllText($tmp, $Content, $utf8)
        Move-Item -LiteralPath $tmp -Destination $Path -Force
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

trap {
    Write-Atomic $OutputPath ('OCR HELPER ERROR: ' + $_.Exception.ToString())
    exit 1
}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class VoyageOcrImage
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetLongPathNameW(string shortPath, System.Text.StringBuilder buffer, uint bufferLength);

    // %TEMP% can arrive as an 8.3 short path (C:\Users\HARDPC~1\...). Win32
    // tolerates those, but WinRT StorageFile - which Windows OCR uses to open
    // images - can refuse them ('An object at the specified path does not
    // exist'), failing the scan on every image it just wrote (issues #27/#35).
    public static string LongPath(string path)
    {
        try
        {
            System.Text.StringBuilder buffer = new System.Text.StringBuilder(1024);
            uint length = GetLongPathNameW(path, buffer, 1024);
            if (length > 0 && length < 1024) { return buffer.ToString(); }
        }
        catch { }
        return path;
    }

    public static void Prepare(string sourcePath, string outputPath)
    {
        using (var original = new Bitmap(sourcePath))
        using (var source = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.DrawImageUnscaled(original, 0, 0);
            }

            var rect = new Rectangle(0, 0, source.Width, source.Height);
            var sourceData = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var sourceStride = Math.Abs(sourceData.Stride);
            var sourceBytes = new byte[sourceStride * source.Height];
            Marshal.Copy(sourceData.Scan0, sourceBytes, 0, sourceBytes.Length);
            source.UnlockBits(sourceData);

            using (var mask = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb))
            {
                var maskData = mask.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var maskStride = Math.Abs(maskData.Stride);
                var maskBytes = new byte[maskStride * mask.Height];
                for (var i = 0; i < maskBytes.Length; i++)
                {
                    maskBytes[i] = 255;
                }

                for (var y = 0; y < source.Height; y++)
                {
                    for (var x = 0; x < source.Width; x++)
                    {
                        var sourceOffset = y * sourceStride + x * 4;
                        var blue = sourceBytes[sourceOffset];
                        var green = sourceBytes[sourceOffset + 1];
                        var red = sourceBytes[sourceOffset + 2];

                        // PoE board modifiers use lavender text. Keep its
                        // anti-aliased pixels and discard inventory levels,
                        // icons, scenery and other white UI text.
                        var isModifierText =
                            blue >= 130 &&
                            blue - red >= 30 &&
                            blue - green >= 30 &&
                            Math.Abs(red - green) <= 18;
                        if (!isModifierText)
                        {
                            continue;
                        }

                        var maskOffset = y * maskStride + x * 3;
                        maskBytes[maskOffset] = 0;
                        maskBytes[maskOffset + 1] = 0;
                        maskBytes[maskOffset + 2] = 0;
                    }
                }

                Marshal.Copy(maskBytes, 0, maskData.Scan0, maskBytes.Length);
                mask.UnlockBits(maskData);

                var scale = Math.Min(2.0, 6000.0 / Math.Max(mask.Width, mask.Height));
                var scaledWidth = (int)Math.Round(mask.Width * scale);
                var scaledHeight = (int)Math.Round(mask.Height * scale);
                const int padding = 64;
                using (var prepared = new Bitmap(
                    scaledWidth + 2 * padding,
                    scaledHeight + 2 * padding,
                    PixelFormat.Format24bppRgb))
                {
                    using (var graphics = Graphics.FromImage(prepared))
                    {
                        graphics.Clear(Color.White);
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            mask,
                            new Rectangle(padding, padding, scaledWidth, scaledHeight));
                    }
                    prepared.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }

    // HDR desktops make GDI captures washed-out and low-contrast (issue #33):
    // colours shift enough to defeat the lavender mask, and the raw image is
    // too flat for OCR. Stretch the 2nd..98th percentile luminance range to
    // full contrast as a last-chance pass; same scale/padding as Prepare so
    // word geometry maps back identically.
    public static void Normalize(string sourcePath, string outputPath)
    {
        using (var original = new Bitmap(sourcePath))
        using (var source = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(source))
            {
                graphics.DrawImageUnscaled(original, 0, 0);
            }

            var rect = new Rectangle(0, 0, source.Width, source.Height);
            var sourceData = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var sourceStride = Math.Abs(sourceData.Stride);
            var sourceBytes = new byte[sourceStride * source.Height];
            Marshal.Copy(sourceData.Scan0, sourceBytes, 0, sourceBytes.Length);
            source.UnlockBits(sourceData);

            var histogram = new int[256];
            var luminance = new byte[source.Width * source.Height];
            var index = 0;
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var offset = y * sourceStride + x * 4;
                    var value = (byte)((sourceBytes[offset] * 114 +
                        sourceBytes[offset + 1] * 587 +
                        sourceBytes[offset + 2] * 299) / 1000);
                    luminance[index++] = value;
                    histogram[value]++;
                }
            }
            var total = source.Width * source.Height;
            var lowTarget = total / 50;
            var highTarget = total - total / 50;
            var low = 0;
            var high = 255;
            var cumulative = 0;
            for (var i = 0; i < 256; i++)
            {
                cumulative += histogram[i];
                if (cumulative <= lowTarget) { low = i; }
                if (cumulative < highTarget) { high = i; }
            }
            if (high <= low) { high = low + 1; }

            using (var normalized = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb))
            {
                var normalizedData = normalized.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var normalizedStride = Math.Abs(normalizedData.Stride);
                var normalizedBytes = new byte[normalizedStride * normalized.Height];
                index = 0;
                for (var y = 0; y < source.Height; y++)
                {
                    for (var x = 0; x < source.Width; x++)
                    {
                        var stretched = (luminance[index++] - low) * 255 / (high - low);
                        if (stretched < 0) { stretched = 0; }
                        if (stretched > 255) { stretched = 255; }
                        var value = (byte)stretched;
                        var offset = y * normalizedStride + x * 3;
                        normalizedBytes[offset] = value;
                        normalizedBytes[offset + 1] = value;
                        normalizedBytes[offset + 2] = value;
                    }
                }
                Marshal.Copy(normalizedBytes, 0, normalizedData.Scan0, normalizedBytes.Length);
                normalized.UnlockBits(normalizedData);

                var scale = Math.Min(2.0, 6000.0 / Math.Max(normalized.Width, normalized.Height));
                var scaledWidth = (int)Math.Round(normalized.Width * scale);
                var scaledHeight = (int)Math.Round(normalized.Height * scale);
                const int padding = 64;
                using (var prepared = new Bitmap(
                    scaledWidth + 2 * padding,
                    scaledHeight + 2 * padding,
                    PixelFormat.Format24bppRgb))
                {
                    using (var graphics = Graphics.FromImage(prepared))
                    {
                        graphics.Clear(Color.White);
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            normalized,
                            new Rectangle(padding, padding, scaledWidth, scaledHeight));
                    }
                    prepared.Save(outputPath, ImageFormat.Png);
                }
            }
        }
    }
}

// Windows.Graphics.Capture at the raw WinRT ABI level (issue #33). GDI's
// CopyFromScreen returns washed-out, non-tone-mapped pixels when Windows
// HDR is on; WGC can read the real float16 scRGB frame and tone-map it
// against the monitor's SDR white level. Every WinRT instance call goes
// through vtable delegates because .NET wraps WinRT objects in projected
// RCWs that refuse ComImport casts (field-tested: RCW casts throw
// InvalidCastException, delegates are pixel-identical to GDI on SDR).
public static class VoyageWgc
{
    [DllImport("d3d11.dll")]
    private static extern int D3D11CreateDevice(IntPtr adapter, int driverType, IntPtr software, int flags, IntPtr featureLevels, int featureLevelCount, int sdkVersion, out IntPtr device, out int featureLevel, out IntPtr context);

    [DllImport("d3d11.dll")]
    private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

    [DllImport("combase.dll")]
    private static extern int WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string src, int length, out IntPtr hstring);

    [DllImport("combase.dll")]
    private static extern int WindowsDeleteString(IntPtr hstring);

    [DllImport("combase.dll")]
    private static extern int RoGetActivationFactory(IntPtr activatableClassId, ref Guid iid, out IntPtr factory);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct SizeInt32 { public int Width; public int Height; }

    [StructLayout(LayoutKind.Sequential)]
    private struct D3D11_TEXTURE2D_DESC
    {
        public uint Width;
        public uint Height;
        public uint MipLevels;
        public uint ArraySize;
        public int Format;
        public uint SampleCount;
        public uint SampleQuality;
        public int Usage;
        public uint BindFlags;
        public uint CPUAccessFlags;
        public uint MiscFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct D3D11_BOX
    {
        public uint Left;
        public uint Top;
        public uint Front;
        public uint Right;
        public uint Bottom;
        public uint Back;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct D3D11_MAPPED_SUBRESOURCE
    {
        public IntPtr Data;
        public uint RowPitch;
        public uint DepthPitch;
    }

    [ComImport]
    [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        IntPtr CreateForWindow([In] IntPtr window, [In] ref Guid iid);
        IntPtr CreateForMonitor([In] IntPtr monitor, [In] ref Guid iid);
    }

    // Plain COM (non-WinRT) objects still take ComImport casts fine.
    [ComImport]
    [Guid("DB6F6DDB-AC77-4E88-8253-819DF9BBF140")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ID3D11DeviceAbi
    {
        [PreserveSig] void Slot3_CreateBuffer();
        [PreserveSig] void Slot4_CreateTexture1D();
        [PreserveSig] int CreateTexture2D(ref D3D11_TEXTURE2D_DESC desc, IntPtr initialData, out IntPtr texture);
    }

    [ComImport]
    [Guid("C0BFA96C-E089-44FB-8EAF-26F8796190DA")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ID3D11DeviceContextAbi
    {
        [PreserveSig] void Slot3();
        [PreserveSig] void Slot4();
        [PreserveSig] void Slot5();
        [PreserveSig] void Slot6();
        [PreserveSig] void Slot7();
        [PreserveSig] void Slot8();
        [PreserveSig] void Slot9();
        [PreserveSig] void Slot10();
        [PreserveSig] void Slot11();
        [PreserveSig] void Slot12();
        [PreserveSig] void Slot13();
        [PreserveSig] int Map(IntPtr resource, uint subresource, int mapType, uint flags, out D3D11_MAPPED_SUBRESOURCE mapped);
        [PreserveSig] void Unmap(IntPtr resource, uint subresource);
        [PreserveSig] void Slot16();
        [PreserveSig] void Slot17();
        [PreserveSig] void Slot18();
        [PreserveSig] void Slot19();
        [PreserveSig] void Slot20();
        [PreserveSig] void Slot21();
        [PreserveSig] void Slot22();
        [PreserveSig] void Slot23();
        [PreserveSig] void Slot24();
        [PreserveSig] void Slot25();
        [PreserveSig] void Slot26();
        [PreserveSig] void Slot27();
        [PreserveSig] void Slot28();
        [PreserveSig] void Slot29();
        [PreserveSig] void Slot30();
        [PreserveSig] void Slot31();
        [PreserveSig] void Slot32();
        [PreserveSig] void Slot33();
        [PreserveSig] void Slot34();
        [PreserveSig] void Slot35();
        [PreserveSig] void Slot36();
        [PreserveSig] void Slot37();
        [PreserveSig] void Slot38();
        [PreserveSig] void Slot39();
        [PreserveSig] void Slot40();
        [PreserveSig] void Slot41();
        [PreserveSig] void Slot42();
        [PreserveSig] void Slot43();
        [PreserveSig] void Slot44();
        [PreserveSig] void Slot45();
        [PreserveSig] void CopySubresourceRegion(IntPtr dst, uint dstSubresource, uint dstX, uint dstY, uint dstZ, IntPtr src, uint srcSubresource, ref D3D11_BOX box);
    }

    // Raw vtable delegates for WinRT instance calls (IUnknown slots 0-2,
    // IInspectable slots 3-5, interface methods from slot 6).
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnThisOnly(IntPtr thisPtr);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnOutPtr(IntPtr thisPtr, out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnOutSize(IntPtr thisPtr, out SizeInt32 result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnPutByte(IntPtr thisPtr, byte value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnPtrOutPtr(IntPtr thisPtr, IntPtr arg, out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnCreateFreeThreaded(IntPtr thisPtr, IntPtr device, int pixelFormat, int numberOfBuffers, SizeInt32 size, out IntPtr result);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int FnGetInterface(IntPtr thisPtr, ref Guid iid, out IntPtr result);

    private static Delegate VtableFn(IntPtr obj, int slot, Type delegateType)
    {
        IntPtr vtable = Marshal.ReadIntPtr(obj);
        IntPtr fn = Marshal.ReadIntPtr(vtable, slot * IntPtr.Size);
        return Marshal.GetDelegateForFunctionPointer(fn, delegateType);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MONITORINFOEX
    {
        public int Size;
        public RECT Monitor;
        public RECT Work;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromRect(ref RECT rect, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool GetMonitorInfoW(IntPtr hmon, ref MONITORINFOEX info);

    [StructLayout(LayoutKind.Sequential)]
    private struct LUID { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_SOURCE_INFO { public LUID AdapterId; public uint Id; public uint ModeInfoIdx; public uint StatusFlags; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_TARGET_INFO
    {
        public LUID AdapterId;
        public uint Id;
        public uint ModeInfoIdx;
        public uint OutputTechnology;
        public uint Rotation;
        public uint Scaling;
        public uint RefreshRateNumerator;
        public uint RefreshRateDenominator;
        public uint ScanLineOrdering;
        public int TargetAvailable;
        public uint StatusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_INFO { public DISPLAYCONFIG_PATH_SOURCE_INFO Source; public DISPLAYCONFIG_PATH_TARGET_INFO Target; public uint Flags; }

    [StructLayout(LayoutKind.Sequential, Size = 64)]
    private struct DISPLAYCONFIG_MODE_INFO { public uint InfoType; public uint Id; public LUID AdapterId; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_DEVICE_INFO_HEADER { public uint Type; public uint Size; public LUID AdapterId; public uint Id; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DISPLAYCONFIG_SOURCE_DEVICE_NAME
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER Header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string ViewGdiDeviceName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER Header;
        public uint Value;
        public uint ColorEncoding;
        public uint BitsPerColorChannel;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_SDR_WHITE_LEVEL
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER Header;
        public uint SDRWhiteLevel;
    }

    [DllImport("user32.dll")]
    private static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPaths, out uint numModes);

    [DllImport("user32.dll")]
    private static extern int QueryDisplayConfig(uint flags, ref uint numPaths, [In, Out] DISPLAYCONFIG_PATH_INFO[] paths, ref uint numModes, [In, Out] DISPLAYCONFIG_MODE_INFO[] modes, IntPtr currentTopology);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int DisplayConfigGetSourceName(ref DISPLAYCONFIG_SOURCE_DEVICE_NAME request);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int DisplayConfigGetColorInfo(ref DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO request);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int DisplayConfigGetSdrWhiteLevel(ref DISPLAYCONFIG_SDR_WHITE_LEVEL request);

    public static IntPtr MonitorForRegion(int left, int top, int width, int height)
    {
        RECT r;
        r.Left = left; r.Top = top; r.Right = left + width; r.Bottom = top + height;
        return MonitorFromRect(ref r, 2);
    }

    private static bool FindDisplayPath(IntPtr hmon, out DISPLAYCONFIG_PATH_INFO found)
    {
        found = new DISPLAYCONFIG_PATH_INFO();
        MONITORINFOEX info = new MONITORINFOEX();
        info.Size = Marshal.SizeOf(typeof(MONITORINFOEX));
        if (!GetMonitorInfoW(hmon, ref info)) { return false; }
        uint numPaths;
        uint numModes;
        if (GetDisplayConfigBufferSizes(2, out numPaths, out numModes) != 0) { return false; }
        DISPLAYCONFIG_PATH_INFO[] paths = new DISPLAYCONFIG_PATH_INFO[numPaths];
        DISPLAYCONFIG_MODE_INFO[] modes = new DISPLAYCONFIG_MODE_INFO[numModes];
        if (QueryDisplayConfig(2, ref numPaths, paths, ref numModes, modes, IntPtr.Zero) != 0) { return false; }
        for (int i = 0; i < numPaths; i++)
        {
            DISPLAYCONFIG_SOURCE_DEVICE_NAME sourceName = new DISPLAYCONFIG_SOURCE_DEVICE_NAME();
            sourceName.Header.Type = 1;
            sourceName.Header.Size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DEVICE_NAME));
            sourceName.Header.AdapterId = paths[i].Source.AdapterId;
            sourceName.Header.Id = paths[i].Source.Id;
            if (DisplayConfigGetSourceName(ref sourceName) != 0) { continue; }
            if (!string.Equals(sourceName.ViewGdiDeviceName, info.Device, StringComparison.OrdinalIgnoreCase)) { continue; }
            found = paths[i];
            return true;
        }
        return false;
    }

    // True when Windows "advanced color" (HDR) is active on the monitor -
    // the case where GDI captures come back washed-out (issue #33).
    public static bool IsHdrEnabled(IntPtr hmon)
    {
        try
        {
            DISPLAYCONFIG_PATH_INFO path;
            if (!FindDisplayPath(hmon, out path)) { return false; }
            DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO color = new DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO();
            color.Header.Type = 9;
            color.Header.Size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO));
            color.Header.AdapterId = path.Target.AdapterId;
            color.Header.Id = path.Target.Id;
            if (DisplayConfigGetColorInfo(ref color) != 0) { return false; }
            return (color.Value & 2) != 0;
        }
        catch { return false; }
    }

    // The monitor's SDR white level in scRGB units (1.0 = 80 nits). SDR
    // content on an HDR desktop renders at this brightness; dividing by it
    // during tone mapping puts SDR white back at exactly 255.
    public static double SdrWhiteScale(IntPtr hmon)
    {
        try
        {
            DISPLAYCONFIG_PATH_INFO path;
            if (!FindDisplayPath(hmon, out path)) { return 1.0; }
            DISPLAYCONFIG_SDR_WHITE_LEVEL white = new DISPLAYCONFIG_SDR_WHITE_LEVEL();
            white.Header.Type = 11;
            white.Header.Size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SDR_WHITE_LEVEL));
            white.Header.AdapterId = path.Target.AdapterId;
            white.Header.Id = path.Target.Id;
            if (DisplayConfigGetSdrWhiteLevel(ref white) != 0) { return 1.0; }
            if (white.SDRWhiteLevel < 1000) { return 1.0; }
            return white.SDRWhiteLevel / 1000.0;
        }
        catch { return 1.0; }
    }

    private static float HalfToFloat(ushort half)
    {
        int sign = (half >> 15) & 1;
        int exponent = (half >> 10) & 0x1F;
        int mantissa = half & 0x3FF;
        float value;
        if (exponent == 0)
        {
            value = (float)(mantissa * Math.Pow(2, -24));
        }
        else if (exponent == 31)
        {
            value = mantissa == 0 ? float.PositiveInfinity : float.NaN;
        }
        else
        {
            value = (float)((1.0 + mantissa / 1024.0) * Math.Pow(2, exponent - 15));
        }
        return sign == 1 ? -value : value;
    }

    private static byte LinearToSrgbByte(double v)
    {
        if (double.IsNaN(v) || v <= 0.0) { return 0; }
        if (v >= 1.0) { return 255; }
        double s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.Pow(v, 1.0 / 2.4) - 0.055;
        int b = (int)Math.Round(s * 255.0);
        if (b < 0) { b = 0; }
        if (b > 255) { b = 255; }
        return (byte)b;
    }

    private static void CheckHr(int hr, string what)
    {
        if (hr < 0) { throw new Exception(what + " failed: 0x" + hr.ToString("X8")); }
    }

    private static void SafeClose(IntPtr winrtObject)
    {
        if (winrtObject == IntPtr.Zero) { return; }
        try
        {
            Guid closableIid = new Guid("30D5A829-7FA4-4026-83BB-D75BAE4EA99E");
            IntPtr closable;
            if (Marshal.QueryInterface(winrtObject, ref closableIid, out closable) == 0)
            {
                FnThisOnly close = (FnThisOnly)VtableFn(closable, 6, typeof(FnThisOnly));
                close(closable);
                Marshal.Release(closable);
            }
        }
        catch { }
    }

    // Capture a screen region through Windows.Graphics.Capture. On HDR
    // monitors the frame is read as float16 scRGB and tone-mapped against
    // the SDR white level, which is exactly what GDI's CopyFromScreen fails
    // to do (issue #33). Writes a PNG to outputPath.
    public static void CaptureRegion(int left, int top, int width, int height, string outputPath, bool forceHdrPath)
    {
        IntPtr hmon = MonitorForRegion(left, top, width, height);
        MONITORINFOEX monInfo = new MONITORINFOEX();
        monInfo.Size = Marshal.SizeOf(typeof(MONITORINFOEX));
        if (!GetMonitorInfoW(hmon, ref monInfo)) { throw new Exception("GetMonitorInfo failed"); }
        int cropX = left - monInfo.Monitor.Left;
        int cropY = top - monInfo.Monitor.Top;
        bool hdr = forceHdrPath || IsHdrEnabled(hmon);
        int pixelFormat = hdr ? 10 : 87; // R16G16B16A16Float : B8G8R8A8UIntNormalized
        int bytesPerPixel = hdr ? 8 : 4;

        IntPtr device = IntPtr.Zero;
        IntPtr context = IntPtr.Zero;
        IntPtr dxgi = IntPtr.Zero;
        IntPtr inspectableDevice = IntPtr.Zero;
        IntPtr itemPtr = IntPtr.Zero;
        IntPtr poolPtr = IntPtr.Zero;
        IntPtr sessionPtr = IntPtr.Zero;
        IntPtr framePtr = IntPtr.Zero;
        IntPtr surfacePtr = IntPtr.Zero;
        IntPtr accessPtr = IntPtr.Zero;
        IntPtr texturePtr = IntPtr.Zero;
        IntPtr stagingPtr = IntPtr.Zero;
        IntPtr classId = IntPtr.Zero;
        try
        {
            int featureLevel;
            int hr = D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out device, out featureLevel, out context);
            if (hr < 0)
            {
                hr = D3D11CreateDevice(IntPtr.Zero, 5, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out device, out featureLevel, out context);
            }
            CheckHr(hr, "D3D11CreateDevice");
            Guid dxgiIid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
            CheckHr(Marshal.QueryInterface(device, ref dxgiIid, out dxgi), "QI IDXGIDevice");
            CheckHr(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out inspectableDevice), "CreateDirect3D11DeviceFromDXGIDevice");

            string className = "Windows.Graphics.Capture.GraphicsCaptureItem";
            CheckHr(WindowsCreateString(className, className.Length, out classId), "WindowsCreateString");
            Guid interopIid = new Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");
            IntPtr factoryPtr;
            CheckHr(RoGetActivationFactory(classId, ref interopIid, out factoryPtr), "RoGetActivationFactory(item)");
            IGraphicsCaptureItemInterop interop = (IGraphicsCaptureItemInterop)Marshal.GetObjectForIUnknown(factoryPtr);
            Marshal.Release(factoryPtr);
            Guid itemIid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
            itemPtr = interop.CreateForMonitor(hmon, ref itemIid);
            Marshal.ReleaseComObject(interop);
            SizeInt32 itemSize;
            FnOutSize getSize = (FnOutSize)VtableFn(itemPtr, 7, typeof(FnOutSize));
            CheckHr(getSize(itemPtr, out itemSize), "GraphicsCaptureItem.Size");
            WindowsDeleteString(classId);
            classId = IntPtr.Zero;

            string poolClass = "Windows.Graphics.Capture.Direct3D11CaptureFramePool";
            CheckHr(WindowsCreateString(poolClass, poolClass.Length, out classId), "WindowsCreateString(pool)");
            Guid statics2Iid = new Guid("589B103F-6BBC-5DF5-A991-02E28B3B66D5");
            IntPtr statics2Ptr;
            CheckHr(RoGetActivationFactory(classId, ref statics2Iid, out statics2Ptr), "RoGetActivationFactory(framePool statics2)");
            FnCreateFreeThreaded createFreeThreaded = (FnCreateFreeThreaded)VtableFn(statics2Ptr, 6, typeof(FnCreateFreeThreaded));
            int poolHr = createFreeThreaded(statics2Ptr, inspectableDevice, pixelFormat, 2, itemSize, out poolPtr);
            Marshal.Release(statics2Ptr);
            CheckHr(poolHr, "Direct3D11CaptureFramePool.CreateFreeThreaded");

            FnPtrOutPtr createSession = (FnPtrOutPtr)VtableFn(poolPtr, 10, typeof(FnPtrOutPtr));
            CheckHr(createSession(poolPtr, itemPtr, out sessionPtr), "CreateCaptureSession");

            try
            {
                Guid session2Iid = new Guid("2C39AE40-7D2E-5044-804E-8B6799D4CF9E");
                IntPtr session2Ptr;
                if (Marshal.QueryInterface(sessionPtr, ref session2Iid, out session2Ptr) == 0)
                {
                    FnPutByte putCursor = (FnPutByte)VtableFn(session2Ptr, 7, typeof(FnPutByte));
                    putCursor(session2Ptr, 0);
                    Marshal.Release(session2Ptr);
                }
            }
            catch { }
            try
            {
                Guid session3Iid = new Guid("F2CDD966-22AE-5EA1-9596-3A289344C3BE");
                IntPtr session3Ptr;
                if (Marshal.QueryInterface(sessionPtr, ref session3Iid, out session3Ptr) == 0)
                {
                    FnPutByte putBorder = (FnPutByte)VtableFn(session3Ptr, 7, typeof(FnPutByte));
                    putBorder(session3Ptr, 0);
                    Marshal.Release(session3Ptr);
                }
            }
            catch { }

            FnThisOnly startCapture = (FnThisOnly)VtableFn(sessionPtr, 6, typeof(FnThisOnly));
            CheckHr(startCapture(sessionPtr), "StartCapture");

            FnOutPtr tryGetNextFrame = (FnOutPtr)VtableFn(poolPtr, 7, typeof(FnOutPtr));
            DateTime deadline = DateTime.UtcNow.AddSeconds(5);
            while (framePtr == IntPtr.Zero && DateTime.UtcNow < deadline)
            {
                CheckHr(tryGetNextFrame(poolPtr, out framePtr), "TryGetNextFrame");
                if (framePtr == IntPtr.Zero) { System.Threading.Thread.Sleep(15); }
            }
            if (framePtr == IntPtr.Zero) { throw new Exception("Windows.Graphics.Capture produced no frame within 5 seconds."); }

            FnOutPtr getSurface = (FnOutPtr)VtableFn(framePtr, 6, typeof(FnOutPtr));
            CheckHr(getSurface(framePtr, out surfacePtr), "Direct3D11CaptureFrame.Surface");

            Guid accessIid = new Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1");
            CheckHr(Marshal.QueryInterface(surfacePtr, ref accessIid, out accessPtr), "QI IDirect3DDxgiInterfaceAccess");
            FnGetInterface getInterface = (FnGetInterface)VtableFn(accessPtr, 3, typeof(FnGetInterface));
            Guid textureIid = new Guid("6F15AAF2-D208-4E89-9AB4-489535D34F9C");
            CheckHr(getInterface(accessPtr, ref textureIid, out texturePtr), "IDirect3DDxgiInterfaceAccess.GetInterface");

            if (cropX < 0) { cropX = 0; }
            if (cropY < 0) { cropY = 0; }
            int cropW = width;
            int cropH = height;
            if (cropX + cropW > itemSize.Width) { cropW = itemSize.Width - cropX; }
            if (cropY + cropH > itemSize.Height) { cropH = itemSize.Height - cropY; }
            if (cropW <= 0 || cropH <= 0) { throw new Exception("Capture region is outside the monitor frame."); }

            D3D11_TEXTURE2D_DESC desc = new D3D11_TEXTURE2D_DESC();
            desc.Width = (uint)cropW;
            desc.Height = (uint)cropH;
            desc.MipLevels = 1;
            desc.ArraySize = 1;
            desc.Format = pixelFormat;
            desc.SampleCount = 1;
            desc.SampleQuality = 0;
            desc.Usage = 3;           // D3D11_USAGE_STAGING
            desc.BindFlags = 0;
            desc.CPUAccessFlags = 0x20000; // D3D11_CPU_ACCESS_READ
            desc.MiscFlags = 0;
            ID3D11DeviceAbi deviceAbi = (ID3D11DeviceAbi)Marshal.GetObjectForIUnknown(device);
            CheckHr(deviceAbi.CreateTexture2D(ref desc, IntPtr.Zero, out stagingPtr), "CreateTexture2D(staging)");
            Marshal.ReleaseComObject(deviceAbi);

            D3D11_BOX box = new D3D11_BOX();
            box.Left = (uint)cropX;
            box.Top = (uint)cropY;
            box.Front = 0;
            box.Right = (uint)(cropX + cropW);
            box.Bottom = (uint)(cropY + cropH);
            box.Back = 1;
            ID3D11DeviceContextAbi contextAbi = (ID3D11DeviceContextAbi)Marshal.GetObjectForIUnknown(context);
            contextAbi.CopySubresourceRegion(stagingPtr, 0, 0, 0, 0, texturePtr, 0, ref box);
            D3D11_MAPPED_SUBRESOURCE mapped;
            CheckHr(contextAbi.Map(stagingPtr, 0, 1, 0, out mapped), "Map(staging)");
            try
            {
                byte[] rowBytes = new byte[cropW * bytesPerPixel];
                byte[] bgra = new byte[cropW * cropH * 4];
                double invWhite = 1.0 / SdrWhiteScale(hmon);
                for (int y = 0; y < cropH; y++)
                {
                    Marshal.Copy(new IntPtr(mapped.Data.ToInt64() + (long)y * mapped.RowPitch), rowBytes, 0, rowBytes.Length);
                    int destBase = y * cropW * 4;
                    if (hdr)
                    {
                        for (int x = 0; x < cropW; x++)
                        {
                            int src = x * 8;
                            double r = HalfToFloat(BitConverter.ToUInt16(rowBytes, src)) * invWhite;
                            double g = HalfToFloat(BitConverter.ToUInt16(rowBytes, src + 2)) * invWhite;
                            double b = HalfToFloat(BitConverter.ToUInt16(rowBytes, src + 4)) * invWhite;
                            bgra[destBase + x * 4] = LinearToSrgbByte(b);
                            bgra[destBase + x * 4 + 1] = LinearToSrgbByte(g);
                            bgra[destBase + x * 4 + 2] = LinearToSrgbByte(r);
                            bgra[destBase + x * 4 + 3] = 255;
                        }
                    }
                    else
                    {
                        Array.Copy(rowBytes, 0, bgra, destBase, cropW * 4);
                    }
                }
                using (Bitmap bmp = new Bitmap(cropW, cropH, PixelFormat.Format32bppRgb))
                {
                    Rectangle rect = new Rectangle(0, 0, cropW, cropH);
                    BitmapData bits = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
                    int destStride = Math.Abs(bits.Stride);
                    for (int y = 0; y < cropH; y++)
                    {
                        Marshal.Copy(bgra, y * cropW * 4, new IntPtr(bits.Scan0.ToInt64() + (long)y * destStride), cropW * 4);
                    }
                    bmp.UnlockBits(bits);
                    bmp.Save(outputPath, ImageFormat.Png);
                }
            }
            finally
            {
                contextAbi.Unmap(stagingPtr, 0);
                Marshal.ReleaseComObject(contextAbi);
            }
        }
        finally
        {
            SafeClose(sessionPtr);
            SafeClose(framePtr);
            SafeClose(poolPtr);
            if (classId != IntPtr.Zero) { WindowsDeleteString(classId); }
            if (stagingPtr != IntPtr.Zero) { Marshal.Release(stagingPtr); }
            if (texturePtr != IntPtr.Zero) { Marshal.Release(texturePtr); }
            if (accessPtr != IntPtr.Zero) { Marshal.Release(accessPtr); }
            if (surfacePtr != IntPtr.Zero) { Marshal.Release(surfacePtr); }
            if (framePtr != IntPtr.Zero) { Marshal.Release(framePtr); }
            if (sessionPtr != IntPtr.Zero) { Marshal.Release(sessionPtr); }
            if (poolPtr != IntPtr.Zero) { Marshal.Release(poolPtr); }
            if (itemPtr != IntPtr.Zero) { Marshal.Release(itemPtr); }
            if (inspectableDevice != IntPtr.Zero) { Marshal.Release(inspectableDevice); }
            if (dxgi != IntPtr.Zero) { Marshal.Release(dxgi); }
            if (context != IntPtr.Zero) { Marshal.Release(context); }
            if (device != IntPtr.Zero) { Marshal.Release(device); }
        }
    }
}
'@

# expand a short-path %TEMP% once - every Join-Path $env:TEMP below inherits
# the fix and WinRT never sees a '~' path (issues #27/#35)
$env:TEMP = [VoyageOcrImage]::LongPath($env:TEMP)

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
[void][Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
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

function New-OcrEngine {
    param([string]$PreferredLanguage = '')

    $available = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)

    # Localized PoE clients need a matching OCR engine. Windows can expose the
    # Korean pack as either "ko" or a regional tag such as "ko-KR".
    if (-not [string]::IsNullOrWhiteSpace($PreferredLanguage)) {
        $preferredTag = $PreferredLanguage.Trim()
        $preferredPrimary = ($preferredTag -split '-', 2)[0]
        $preferred = @($available | Where-Object {
            $tag = $_.LanguageTag
            $primary = ($tag -split '-', 2)[0]
            $tag -ieq $preferredTag -or $primary -ieq $preferredPrimary
        } | Sort-Object {
            if ($_.LanguageTag -ieq $preferredTag) { 0 }
            elseif ($_.LanguageTag -ieq $preferredPrimary) { 1 }
            else { 2 }
        })

        foreach ($language in $preferred) {
            $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
            if ($null -ne $engine) {
                return $engine
            }
        }

        throw ("Windows OCR language '$preferredTag' is not installed. " +
            'Install the matching Windows language OCR feature. For Korean, open an elevated ' +
            'Command Prompt and run: DISM /Online /Add-Capability ' +
            '/CapabilityName:Language.OCR~~~ko-KR~0.0.1.0')
    }

    # English clients keep the original English-first behavior. Do not require
    # en-US specifically: many Windows installs only have en-GB or another
    # Latin-script OCR language.
    $english = @($available | Where-Object {
        $_.LanguageTag -eq 'en-US' -or $_.LanguageTag -like 'en-*'
    } | Sort-Object {
        if ($_.LanguageTag -eq 'en-US') { 0 } else { 1 }
    })

    foreach ($language in $english) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        if ($null -ne $engine) {
            return $engine
        }
    }

    # Fall back to the Windows profile language (for example pl-PL). The
    # border matcher tolerates small OCR errors, and Latin-script recognizers
    # can still read the English tooltip text well enough for matching.
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -ne $engine) {
        return $engine
    }

    # A profile language may not be in the installed OCR list. Use any
    # recognizer as a final fallback rather than rejecting a usable setup.
    foreach ($language in $available) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
        if ($null -ne $engine) {
            return $engine
        }
    }

    throw ('Windows OCR has no installed language. Open an elevated Command Prompt and run: ' +
        'DISM /Online /Add-Capability /CapabilityName:Language.OCR~~~en-US~0.0.1.0')
}

function Invoke-OcrFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Engine)

    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $result = Await-Result ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
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

function Read-OcrLines {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$Unfiltered)

    $engine = New-OcrEngine -PreferredLanguage $PreferredLanguage
    $script:RecognizerLanguage = $engine.RecognizerLanguage.LanguageTag
    if ($Unfiltered) {
        $text = Invoke-OcrFile $Path $engine
        if ([string]::IsNullOrWhiteSpace($text)) {
            throw 'Windows OCR returned no text from the unfiltered reroll-cost scan.'
        }
        return $text
    }

    $preparedPath = Join-Path $env:TEMP "voyage-ocr-filtered-$RunId-$PID-$([Guid]::NewGuid().ToString('N')).png"
    try {
        [VoyageOcrImage]::Prepare($Path, $preparedPath)
        $text = Invoke-OcrFile $preparedPath $engine

        # The lavender-only mask can occasionally be empty even though the
        # tooltip is visible. Retry the original screenshot before declaring
        # the border unreadable.
        if ([string]::IsNullOrWhiteSpace($text)) {
            $text = Invoke-OcrFile $Path $engine
        }
        # HDR desktops wash out GDI captures (issue #33): last chance, stretch
        # the contrast and try once more.
        if ([string]::IsNullOrWhiteSpace($text)) {
            $normalizedPath = Join-Path $env:TEMP "voyage-ocr-normalized-$RunId-$PID-$([Guid]::NewGuid().ToString('N')).png"
            [VoyageOcrImage]::Normalize($Path, $normalizedPath)
            try {
                $text = Invoke-OcrFile $normalizedPath $engine
            } finally {
                Remove-Item -LiteralPath $normalizedPath -Force -ErrorAction SilentlyContinue
            }
        }
        if ([string]::IsNullOrWhiteSpace($text)) {
            throw 'Windows OCR returned no text after filtered, unfiltered and contrast-stretched scans. If Windows HDR is on, turn it off for the scan (Win+Alt+B).'
        }
        return $text
    } finally {
        Remove-Item -LiteralPath $preparedPath -Force -ErrorAction SilentlyContinue
    }
}

function Add-Block {
    param(
        [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Builder,
        [Parameter(Mandatory = $true)][int]$Index,
    [Parameter(Mandatory = $true)][string]$Text)
    [void]$Builder.AppendLine("=== VOYAGE BORDER $Index ===")
    if (-not [string]::IsNullOrWhiteSpace($script:RecognizerLanguage)) {
        [void]$Builder.AppendLine("OCR Language: $script:RecognizerLanguage")
    }
    [void]$Builder.AppendLine($Text)
    [void]$Builder.AppendLine('=== END VOYAGE BORDER ===')
}

function Add-RerollCostBlock {
    param(
        [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Builder,
        [Parameter(Mandatory = $true)][string]$Text)
    [void]$Builder.AppendLine('=== VOYAGE REROLL COST ===')
    if (-not [string]::IsNullOrWhiteSpace($script:RecognizerLanguage)) {
        [void]$Builder.AppendLine("OCR Language: $script:RecognizerLanguage")
    }
    [void]$Builder.AppendLine($Text)
    [void]$Builder.AppendLine('=== END VOYAGE REROLL COST ===')
}

# GDI CopyFromScreen returns washed-out pixels when Windows HDR is on
# (issue #33). CaptureMode auto switches to Windows.Graphics.Capture with
# float16 tone mapping when HDR is detected on the target monitor; gdi /
# wgc force one path (ini: [sweep] Capture). Any WGC failure falls back
# to plain GDI so the scan never gets worse than before.
function Save-ScreenRegion {
    param([int]$Left, [int]$Top, [int]$Width, [int]$Height, [string]$Path)
    if ($Width -le 0 -or $Height -le 0) {
        throw 'Invalid Path of Exile window size.'
    }
    $useWgc = $false
    if ($CaptureMode -eq 'wgc') {
        $useWgc = $true
    } elseif ($CaptureMode -ne 'gdi') {
        $hmon = [VoyageWgc]::MonitorForRegion($Left, $Top, $Width, $Height)
        $useWgc = [VoyageWgc]::IsHdrEnabled($hmon)
    }
    if ($useWgc) {
        try {
            [VoyageWgc]::CaptureRegion($Left, $Top, $Width, $Height, $Path, $false)
            return
        } catch { }
    }
    $image = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($image)
    try {
        $graphics.CopyFromScreen($Left, $Top, 0, 0, $image.Size)
        $image.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $image.Dispose()
    }
}

function Get-BorderBlock {
    param([int]$Index, [int]$Left, [int]$Top, [int]$Width, [int]$Height)
    $builder = [System.Text.StringBuilder]::new()
    $png = Join-Path $env:TEMP "voyage-border-$RunId-$PID-$Index.png"
    try {
        Save-ScreenRegion -Left $Left -Top $Top -Width $Width -Height $Height -Path $png
        Add-Block $builder $Index (Read-OcrLines $png)
    } catch {
        if ($RerollCost) {
            Add-RerollCostBlock $builder ("OCR ERROR: " + $_.Exception.Message)
        } else {
            Add-Block $builder $Index ("OCR ERROR: " + $_.Exception.Message)
        }
    } finally {
        Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
    }
}

function Get-OcrLineRects {
    param([string]$Path, $Engine, [double]$Scale, [double]$Pad)
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        try {
            $result = Await-Result ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
            $found = @()
            foreach ($line in $result.Lines) {
                $minX = [double]::MaxValue
                $minY = [double]::MaxValue
                $maxX = 0.0
                $maxY = 0.0
                foreach ($word in $line.Words) {
                    $r = $word.BoundingRect
                    if ($r.X -lt $minX) { $minX = $r.X }
                    if ($r.Y -lt $minY) { $minY = $r.Y }
                    if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
                    if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
                }
                if ($minX -eq [double]::MaxValue) { continue }
                $found += [pscustomobject]@{
                    Text = $line.Text
                    X = ($minX - $Pad) / $Scale
                    Y = ($minY - $Pad) / $Scale
                    R = ($maxX - $Pad) / $Scale
                    B = ($maxY - $Pad) / $Scale
                }
            }
            return $found
        } finally {
            if ($null -ne $bitmap) { $bitmap.Dispose() }
        }
    } finally {
        $stream.Dispose()
    }
}

# Match tooltip blocks to border points as a GLOBAL assignment, not greedy
# nearest: tooltips render offset outward and stack along a side, so a
# tooltip's individually-nearest point is often its neighbour's. Start from
# the greedy solution, then 2-opt swap pairs until total distance is locally
# minimal - for 12 points this converges instantly and fixes the cascades.
# CONFIRMED against a player-annotated board (2026-08-14): this global
# matching placed all 12 correctly; plain cheapest-first greedy swapped the
# three corner pairs (top-left/left-top and friends). Keep the 2-opt.
function Resolve-BorderAssignment {
    param($Points, $Blocks)
    $count = $Points.Count
    $dist = New-Object 'double[,]' $count, $Blocks.Count
    for ($p = 0; $p -lt $count; $p++) {
        for ($b = 0; $b -lt $Blocks.Count; $b++) {
            $cx = ($Blocks[$b].X + $Blocks[$b].R) / 2.0
            $cy = ($Blocks[$b].Y + $Blocks[$b].B) / 2.0
            $dx = $cx - $Points[$p].X
            $dy = $cy - $Points[$p].Y
            $dist[$p, $b] = $dx * $dx + $dy * $dy
        }
    }
    $assigned = @($null) * $count
    $used = @{}
    $order = @()
    for ($p = 0; $p -lt $count; $p++) {
        for ($b = 0; $b -lt $Blocks.Count; $b++) {
            $order += [pscustomobject]@{ P = $p; B = $b; D = $dist[$p, $b] }
        }
    }
    foreach ($pair in ($order | Sort-Object D)) {
        if ($null -ne $assigned[$pair.P] -or $used.ContainsKey($pair.B)) { continue }
        $assigned[$pair.P] = $pair.B
        $used[$pair.B] = $true
    }
    $improved = $true
    $rounds = 0
    while ($improved -and $rounds -lt 50) {
        $improved = $false
        $rounds++
        for ($i = 0; $i -lt $count; $i++) {
            for ($j = $i + 1; $j -lt $count; $j++) {
                $bi = $assigned[$i]
                $bj = $assigned[$j]
                if ($null -eq $bi -or $null -eq $bj) { continue }
                if (($dist[$i, $bj] + $dist[$j, $bi]) -lt ($dist[$i, $bi] + $dist[$j, $bj])) {
                    $assigned[$i] = $bj
                    $assigned[$j] = $bi
                    $improved = $true
                }
            }
        }
    }
    return $assigned
}

# One held-Alt screenshot shows every border tooltip at once. OCR it with
# per-line geometry, cluster lines into tooltip blocks, then assign each
# block to a border point via the global matcher above.
function Get-AllBorderBlocks {
    param([int]$Left, [int]$Top, [int]$Width, [int]$Height, [string]$PointSpec, $Engine)
    $builder = [System.Text.StringBuilder]::new()
    $png = Join-Path $env:TEMP "voyage-border-$RunId-$PID-all.png"
    $prepared = Join-Path $env:TEMP "voyage-border-$RunId-$PID-all-prep.png"
    try {
        Save-ScreenRegion -Left $Left -Top $Top -Width $Width -Height $Height -Path $png
        # mirror the transform inside VoyageOcrImage::Prepare so rects map back
        $scale = [Math]::Min(2.0, 6000.0 / [Math]::Max($Width, $Height))
        [VoyageOcrImage]::Prepare($png, $prepared)
        $lines = @(Get-OcrLineRects $prepared $Engine $scale 64.0)
        if ($lines.Count -eq 0) { $lines = @(Get-OcrLineRects $png $Engine 1.0 0.0) }
        # HDR washout rescue (issue #33): contrast-stretch and retry
        if ($lines.Count -eq 0) {
            [VoyageOcrImage]::Normalize($png, $prepared)
            $lines = @(Get-OcrLineRects $prepared $Engine $scale 64.0)
        }
        if ($lines.Count -eq 0) { throw 'Windows OCR found no border tooltips in the Alt overview. If Windows HDR is on, turn it off for the scan (Win+Alt+B).' }
        # cluster vertically-adjacent, horizontally-overlapping lines
        $blocks = @()
        foreach ($line in ($lines | Sort-Object Y)) {
            $joined = $false
            foreach ($block in $blocks) {
                $lineHeight = [Math]::Max(12.0, $line.B - $line.Y)
                $xOverlap = [Math]::Min($line.R, $block.R) - [Math]::Max($line.X, $block.X)
                if (($line.Y - $block.B) -le ($lineHeight * 0.9) -and $xOverlap -gt 0) {
                    $block.Text = $block.Text + [Environment]::NewLine + $line.Text
                    if ($line.X -lt $block.X) { $block.X = $line.X }
                    if ($line.R -gt $block.R) { $block.R = $line.R }
                    if ($line.B -gt $block.B) { $block.B = $line.B }
                    $joined = $true
                    break
                }
            }
            if (-not $joined) {
                $blocks += [pscustomobject]@{ Text = $line.Text; X = $line.X; Y = $line.Y; R = $line.R; B = $line.B }
            }
        }
        $points = @()
        foreach ($pair in $PointSpec.Split(';')) {
            $xy = $pair.Split(',')
            $points += [pscustomobject]@{ X = [double]$xy[0]; Y = [double]$xy[1] }
        }
        $assigned = Resolve-BorderAssignment $points $blocks
        for ($p = 0; $p -lt $points.Count; $p++) {
            if ($null -ne $assigned[$p]) {
                Add-Block $builder $p $blocks[$assigned[$p]].Text
            } else {
                Add-Block $builder $p 'OCR ERROR: no tooltip found near this border.'
            }
        }
    } catch {
        $builder = [System.Text.StringBuilder]::new()
        for ($p = 0; $p -lt 12; $p++) {
            Add-Block $builder $p ('OCR ERROR: ' + $_.Exception.Message)
        }
    } finally {
        Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $prepared -Force -ErrorAction SilentlyContinue
    }
    return $builder.ToString()
}

$builder = [System.Text.StringBuilder]::new()
if ($ImagePath) {
    $text = Read-OcrLines $ImagePath -Unfiltered:$RerollCost
    if ($RerollCost) {
        Add-RerollCostBlock $builder $text
    } else {
        Add-Block $builder 0 $text
    }
} elseif ($Mode -eq 'alt') {
    $engine = New-OcrEngine -PreferredLanguage $PreferredLanguage
    try { $script:RecognizerLanguage = $engine.RecognizerLanguage.LanguageTag } catch { }
    [void]$builder.Append((Get-AllBorderBlocks -Left $WindowLeft -Top $WindowTop -Width $WindowWidth -Height $WindowHeight -PointSpec $PointSpec -Engine $engine))
} else {
    if (($Index -lt 0 -and -not $RerollCost) -or $WindowWidth -le 0 -or $WindowHeight -le 0) {
        throw 'Invalid Path of Exile window size.'
    }
    $png = Join-Path $env:TEMP "voyage-border-$RunId-$PID-$Index.png"
    Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
    try {
        Save-ScreenRegion -Left $WindowLeft -Top $WindowTop -Width $WindowWidth -Height $WindowHeight -Path $png
        $text = Read-OcrLines $png -Unfiltered:$RerollCost
        if ($RerollCost) {
            Add-RerollCostBlock $builder $text
        } else {
            Add-Block $builder $Index $text
        }
    } catch {
        if ($RerollCost) {
            Add-RerollCostBlock $builder ("OCR ERROR: " + $_.Exception.Message)
        } else {
            Add-Block $builder $Index ("OCR ERROR: " + $_.Exception.Message)
        }
    } finally {
        Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
    }
}
Write-Atomic $OutputPath $builder.ToString()
)"
}

SetOcrEnvironment(options, preferredLanguage) {
    global OcrOutput, ScriptPid, CaptureMode
    EnvSet "VOYAGE_OCR_INDEX", options.Get("Index", -1)
    EnvSet "VOYAGE_OCR_WINDOW_LEFT", options.Get("WindowLeft", 0)
    EnvSet "VOYAGE_OCR_WINDOW_TOP", options.Get("WindowTop", 0)
    EnvSet "VOYAGE_OCR_WINDOW_WIDTH", options.Get("WindowWidth", 0)
    EnvSet "VOYAGE_OCR_WINDOW_HEIGHT", options.Get("WindowHeight", 0)
    EnvSet "VOYAGE_OCR_IMAGE_PATH", options.Get("ImagePath", "")
    EnvSet "VOYAGE_OCR_PREFERRED_LANGUAGE", preferredLanguage
    EnvSet "VOYAGE_OCR_RUN_ID", ScriptPid
    EnvSet "VOYAGE_OCR_REROLL_COST", options.Get("RerollCost", false) ? "1" : "0"
    EnvSet "VOYAGE_OCR_MODE", options.Get("Mode", "border")
    EnvSet "VOYAGE_OCR_POINT_SPEC", options.Get("PointSpec", "")
    EnvSet "VOYAGE_OCR_CAPTURE_MODE", CaptureMode
    EnvSet "VOYAGE_OCR_OUTPUT_PATH", OcrOutput
}

ClearOcrEnvironment() {
    for name in [
        "VOYAGE_OCR_INDEX",
        "VOYAGE_OCR_WINDOW_LEFT",
        "VOYAGE_OCR_WINDOW_TOP",
        "VOYAGE_OCR_WINDOW_WIDTH",
        "VOYAGE_OCR_WINDOW_HEIGHT",
        "VOYAGE_OCR_IMAGE_PATH",
        "VOYAGE_OCR_PREFERRED_LANGUAGE",
        "VOYAGE_OCR_RUN_ID",
        "VOYAGE_OCR_REROLL_COST",
        "VOYAGE_OCR_MODE",
        "VOYAGE_OCR_POINT_SPEC",
        "VOYAGE_OCR_CAPTURE_MODE",
        "VOYAGE_OCR_OUTPUT_PATH"
    ]
        EnvSet name
}

PreferredOcrLanguage() {
    global PoeImagePath
    SplitPath PoeImagePath, &processName
    if RegExMatch(processName, "i)_KG\.exe$")
        return "ko-KR"
    return ""
}

Win32Failure(action) {
    return Error(action " (Windows error " A_LastError ").")
}

CloseNativeHandle(handle) {
    if handle && handle != -1
        DllCall("CloseHandle", "Ptr", handle)
}

StartHiddenPowerShell(applicationName, commandLine) {
    global OcrStdinCapacity
    static HANDLE_FLAG_INHERIT := 0x1
        , STARTF_USESHOWWINDOW := 0x1
        , STARTF_USESTDHANDLES := 0x100
        , SW_HIDE := 0
        , CREATE_SUSPENDED := 0x4
        , CREATE_NO_WINDOW := 0x08000000
        , EXTENDED_STARTUPINFO_PRESENT := 0x00080000
        , PROC_THREAD_ATTRIBUTE_HANDLE_LIST := 0x00020002
        , GENERIC_WRITE := 0x40000000
        , FILE_SHARE_READ_WRITE := 0x3
        , OPEN_EXISTING := 0x3
        , FILE_ATTRIBUTE_NORMAL := 0x80
        , SECURITY_ATTRIBUTES_SIZE := A_PtrSize = 8 ? 24 : 12
        , SECURITY_ATTRIBUTES_INHERIT := A_PtrSize = 8 ? 16 : 8
        , STARTUPINFO_SIZE := A_PtrSize = 8 ? 104 : 68
        , STARTUPINFOEX_SIZE := A_PtrSize = 8 ? 112 : 72
        , STARTUPINFO_dwFlags := A_PtrSize = 8 ? 60 : 44
        , STARTUPINFO_wShowWindow := A_PtrSize = 8 ? 64 : 48
        , STARTUPINFO_hStdInput := A_PtrSize = 8 ? 80 : 56
        , PROCESS_INFORMATION_SIZE := A_PtrSize = 8 ? 24 : 16

    stdinRead := 0
    stdinWrite := 0
    nullOutput := 0
    processHandle := 0
    threadHandle := 0
    attributeListReady := false
    returned := false
    try {
        securityAttributes := Buffer(SECURITY_ATTRIBUTES_SIZE, 0)
        NumPut("UInt", SECURITY_ATTRIBUTES_SIZE, securityAttributes)
        NumPut("Int", true, securityAttributes, SECURITY_ATTRIBUTES_INHERIT)
        if !DllCall(
            "CreatePipe",
            "PtrP", &stdinRead,
            "PtrP", &stdinWrite,
            "Ptr", securityAttributes.Ptr,
            "UInt", OcrStdinCapacity,
            "Int"
        )
            throw Win32Failure("Could not create the Windows OCR stdin pipe")
        if !DllCall(
            "SetHandleInformation",
            "Ptr", stdinWrite,
            "UInt", HANDLE_FLAG_INHERIT,
            "UInt", 0,
            "Int"
        )
            throw Win32Failure("Could not protect the Windows OCR stdin pipe")

        nullOutput := DllCall(
            "CreateFileW",
            "Str", "NUL",
            "UInt", GENERIC_WRITE,
            "UInt", FILE_SHARE_READ_WRITE,
            "Ptr", securityAttributes.Ptr,
            "UInt", OPEN_EXISTING,
            "UInt", FILE_ATTRIBUTE_NORMAL,
            "Ptr", 0,
            "Ptr"
        )
        if !nullOutput || nullOutput = -1
            throw Win32Failure("Could not open the Windows OCR null output")

        attributeListSize := 0
        DllCall(
            "InitializeProcThreadAttributeList",
            "Ptr", 0,
            "UInt", 1,
            "UInt", 0,
            "UPtrP", &attributeListSize,
            "Int"
        )
        if !attributeListSize
            throw Win32Failure("Could not size the Windows OCR process attribute list")
        attributeList := Buffer(attributeListSize, 0)
        if !DllCall(
            "InitializeProcThreadAttributeList",
            "Ptr", attributeList.Ptr,
            "UInt", 1,
            "UInt", 0,
            "UPtrP", &attributeListSize,
            "Int"
        )
            throw Win32Failure("Could not initialize the Windows OCR process attribute list")
        attributeListReady := true

        inheritedHandles := Buffer(A_PtrSize * 2, 0)
        NumPut("Ptr", stdinRead, "Ptr", nullOutput, inheritedHandles)
        if !DllCall(
            "UpdateProcThreadAttribute",
            "Ptr", attributeList.Ptr,
            "UInt", 0,
            "UPtr", PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            "Ptr", inheritedHandles.Ptr,
            "UPtr", inheritedHandles.Size,
            "Ptr", 0,
            "Ptr", 0,
            "Int"
        )
            throw Win32Failure("Could not restrict Windows OCR child handles")

        startupInfo := Buffer(STARTUPINFOEX_SIZE, 0)
        NumPut("UInt", STARTUPINFOEX_SIZE, startupInfo)
        NumPut(
            "UInt", STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES,
            startupInfo,
            STARTUPINFO_dwFlags
        )
        NumPut("UShort", SW_HIDE, startupInfo, STARTUPINFO_wShowWindow)
        NumPut(
            "Ptr", stdinRead,
            "Ptr", nullOutput,
            "Ptr", nullOutput,
            startupInfo,
            STARTUPINFO_hStdInput
        )
        NumPut("Ptr", attributeList.Ptr, startupInfo, STARTUPINFO_SIZE)

        commandLineChars := StrPut(commandLine, "UTF-16")
        commandLineBuffer := Buffer(commandLineChars * 2, 0)
        StrPut(commandLine, commandLineBuffer, "UTF-16")
        processInfo := Buffer(PROCESS_INFORMATION_SIZE, 0)
        if !DllCall(
            "CreateProcessW",
            "Str", applicationName,
            "Ptr", commandLineBuffer.Ptr,
            "Ptr", 0,
            "Ptr", 0,
            "Int", true,
            "UInt", CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT,
            "Ptr", 0,
            "Ptr", 0,
            "Ptr", startupInfo.Ptr,
            "Ptr", processInfo.Ptr,
            "Int"
        )
            throw Win32Failure("Could not start the hidden Windows OCR process")

        processHandle := NumGet(processInfo, 0, "Ptr")
        threadHandle := NumGet(processInfo, A_PtrSize, "Ptr")
        pid := NumGet(processInfo, A_PtrSize * 2, "UInt")
        result := {
            ProcessID: pid,
            ProcessHandle: processHandle,
            ThreadHandle: threadHandle,
            StdinHandle: stdinWrite
        }
        processHandle := 0
        threadHandle := 0
        stdinWrite := 0
        returned := true
        return result
    } finally {
        if attributeListReady
            DllCall("DeleteProcThreadAttributeList", "Ptr", attributeList.Ptr)
        CloseNativeHandle(stdinRead)
        CloseNativeHandle(stdinWrite)
        CloseNativeHandle(nullOutput)
        CloseNativeHandle(threadHandle)
        if processHandle {
            if !returned
                DllCall("TerminateProcess", "Ptr", processHandle, "UInt", 1)
            CloseNativeHandle(processHandle)
        }
    }
}

WriteUtf8Pipe(handle, text) {
    requiredBytes := StrPut(text, "UTF-8")
    bytes := Buffer(requiredBytes, 0)
    StrPut(text, bytes, "UTF-8")
    remaining := requiredBytes - 1
    offset := 0
    while remaining > 0 {
        chunk := Min(remaining, 16384)
        written := 0
        if !DllCall(
            "WriteFile",
            "Ptr", handle,
            "Ptr", bytes.Ptr + offset,
            "UInt", chunk,
            "UIntP", &written,
            "Ptr", 0,
            "Int"
        )
            throw Win32Failure("Could not stream the Windows OCR helper")
        if !written
            throw Error("Windows OCR stdin closed before the helper was streamed.")
        offset += written
        remaining -= written
    }
}

PowerShellStdinCommand() {
    global PowerShellExe
    quote := Chr(34)
    return quote PowerShellExe quote
        . " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
        . quote "$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false)); "
        . "try { & ([ScriptBlock]::Create($reader.ReadToEnd())) } finally { $reader.Dispose() }" quote
}

RunOcrHelper(options, cancellable := true, preferredLanguage := "") {
    global OcrOutput, OcrPid, OcrTimeout, Running
    global OcrProcessHandle, OcrThreadHandle, OcrStdinHandle
    global PowerShellExe, ExpectedPowerShellImage, OcrStdinCapacity
    CleanupOcrArtifacts()
    try {
        if (preferredLanguage = "")
            preferredLanguage := PreferredOcrLanguage()
        ocrSource := OcrPowerShell()
        if (StrPut(ocrSource, "UTF-8") - 1 > OcrStdinCapacity)
            throw Error("The in-memory Windows OCR helper exceeds its stdin pipe budget.")
        command := PowerShellStdinCommand()
        try {
            SetOcrEnvironment(options, preferredLanguage)
            helper := StartHiddenPowerShell(PowerShellExe, command)
            OcrPid := helper.ProcessID
            OcrProcessHandle := helper.ProcessHandle
            OcrThreadHandle := helper.ThreadHandle
            OcrStdinHandle := helper.StdinHandle
        } finally {
            ClearOcrEnvironment()
        }
        actualImage := ProcessImagePath(OcrPid)
        if (NormalizeWindowsPath(actualImage) != NormalizeWindowsPath(ExpectedPowerShellImage)) {
            throw Error("Windows OCR child image was not the trusted System32 PowerShell.")
        }
        if (DllCall("ResumeThread", "Ptr", OcrThreadHandle, "UInt") = 0xFFFFFFFF)
            throw Win32Failure("Could not resume the verified Windows OCR process")
        CloseNativeHandle(OcrThreadHandle)
        OcrThreadHandle := 0
        if (cancellable && !Running)
            return ""
        try WriteUtf8Pipe(OcrStdinHandle, ocrSource)
        catch as writeError {
            if (cancellable && !Running)
                return ""
            throw writeError
        }
        CloseNativeHandle(OcrStdinHandle)
        OcrStdinHandle := 0
        deadline := A_TickCount + OcrTimeout * 1000
        loop {
            if (cancellable && !Running)
                return ""
            if !OcrProcessHandle
                return ""
            waitResult := DllCall("WaitForSingleObject", "Ptr", OcrProcessHandle, "UInt", 100, "UInt")
            if (waitResult = 0)
                break
            if (waitResult != 0x102)
                throw Win32Failure("Could not wait for the Windows OCR process")
            if (A_TickCount > deadline) {
                MsgBox "Windows OCR timed out. Try again, or raise OcrTimeout in the script."
                return ""
            }
        }
        CloseNativeHandle(OcrProcessHandle)
        OcrProcessHandle := 0
        OcrPid := 0
        if !FileExist(OcrOutput)
            return ""
        return FileRead(OcrOutput, "UTF-8")
    } catch as ocrError {
        if (cancellable && !Running)
            return ""
        throw ocrError
    } finally {
        CleanupOcr()
    }
}

RunHiddenPowerShellProbe() {
    global OcrPid, OcrProcessHandle, OcrThreadHandle, OcrStdinHandle
    global PowerShellExe, ExpectedPowerShellImage
    baselineConsoles := Map()
    for hwnd in WinGetList("ahk_class ConsoleWindowClass")
        baselineConsoles[hwnd] := true
    visibleConsole := false
    exitCode := 0
    try {
        helper := StartHiddenPowerShell(PowerShellExe, PowerShellStdinCommand())
        OcrPid := helper.ProcessID
        OcrProcessHandle := helper.ProcessHandle
        OcrThreadHandle := helper.ThreadHandle
        OcrStdinHandle := helper.StdinHandle
        actualImage := ProcessImagePath(OcrPid)
        if (NormalizeWindowsPath(actualImage) != NormalizeWindowsPath(ExpectedPowerShellImage))
            throw Error("Hidden-launch probe did not start the trusted System32 PowerShell.")
        if (DllCall("ResumeThread", "Ptr", OcrThreadHandle, "UInt") = 0xFFFFFFFF)
            throw Win32Failure("Could not resume the hidden-launch probe")
        CloseNativeHandle(OcrThreadHandle)
        OcrThreadHandle := 0
        WriteUtf8Pipe(OcrStdinHandle, "Start-Sleep -Milliseconds 1000; exit 23")
        CloseNativeHandle(OcrStdinHandle)
        OcrStdinHandle := 0
        deadline := A_TickCount + 5000
        loop {
            waitResult := DllCall("WaitForSingleObject", "Ptr", OcrProcessHandle, "UInt", 5, "UInt")
            if (waitResult = 0)
                break
            if (waitResult != 0x102)
                throw Win32Failure("Could not wait for the hidden-launch probe")
            if WinExist("ahk_pid " OcrPid)
                visibleConsole := true
            for hwnd in WinGetList("ahk_class ConsoleWindowClass") {
                if !baselineConsoles.Has(hwnd) {
                    visibleConsole := true
                    break
                }
            }
            if (A_TickCount > deadline)
                throw Error("Hidden-launch probe timed out.")
        }
        if !DllCall(
            "GetExitCodeProcess",
            "Ptr", OcrProcessHandle,
            "UIntP", &exitCode,
            "Int"
        )
            throw Win32Failure("Could not read the hidden-launch probe result")
        return { StdinExecuted: exitCode = 23, VisibleConsole: visibleConsole }
    } finally {
        CleanupOcr()
    }
}

RequireSingleBorderTooltipView() {
    global Running
    if !GetKeyState("LAlt", "P") && !GetKeyState("RAlt", "P")
        return true

    Running := false
    ToolTip()
    Flash "Release Alt before border OCR. The importer reads one tooltip at a time.", 5000
    return false
}

; Preferred path: the game now reveals EVERY border tooltip while Alt is held,
; so one screenshot + one OCR pass covers all 12 (seconds instead of 15-30s).
; Tooltip text is assigned to segments by proximity to the calibration points.
; Any failure falls back to the per-border hover scan below.
ScanBordersAlt() {
    global PoeHwnd, AltRevealDelay, Running
    if !RequireBoundPoeForeground() {
        Running := false
        return "ABORT"
    }
    WinGetPos &winX, &winY, &winW, &winH, "ahk_id " PoeHwnd
    points := ""
    for index, point in BorderPoints()
        points .= (points = "" ? "" : ";") (point[1] - winX) "," (point[2] - winY)
    ToolTip "Reading all 12 borders in one Alt scan..."
    ; park the cursor mid-board so no single tooltip is hover-highlighted
    MouseMove winX + winW // 2, winY + winH // 2, 0
    Send "{Alt down}"
    Sleep AltRevealDelay
    ; hide our status tooltip before the capture - it's a topmost window, so
    ; it gets baked into the screenshot and can sit right on top of a border
    ; tooltip the OCR needs to read
    ToolTip()
    Sleep 30
    scanStart := A_TickCount
    options := Map(
        "Mode", "alt",
        "WindowLeft", winX,
        "WindowTop", winY,
        "WindowWidth", winW,
        "WindowHeight", winH,
        "PointSpec", points
    )
    try {
        block := RunOcrHelper(options)
    } finally {
        Send "{Alt up}"
        ToolTip()
    }
    if !Running
        return "ABORT"
    Log("alt scan | " (block = "" ? "no result" : "completed")
        . " | " (A_TickCount - scanStart) "ms")
    return block
}

; split a payload of "=== VOYAGE BORDER n ===" blocks into index -> inner text
ParseBorderBlocks(blob) {
    blocks := Map()
    pos := 1
    while (pos := RegExMatch(blob, "=== VOYAGE BORDER (\d+) ===\R([\s\S]*?)\R=== END VOYAGE BORDER ===", &m, pos)) {
        blocks[m[1] + 0] := m[2]
        pos += StrLen(m[0])
    }
    return blocks
}

ArrayHas(arr, value) {
    for , item in arr
        if (item = value)
            return true
    return false
}

; Hybrid border scan: the one-screenshot Alt overview covers most segments in
; seconds; any SUSPECT segment (missing, errored, or a suspiciously tall block
; that smells like two tooltips merged at a cramped resolution) gets the slow
; per-border hover treatment individually. Worst case on an odd setup is a
; slightly slower scan, never silently wrong borders.
ScanBorders() {
    global AltScanBorders, Running, LastBorderScanBlocks
    if !RequireSingleBorderTooltipView()
        return ""
    if !RequireBoundPoeForeground() {
        Running := false
        return ""
    }
    if (AltScanBorders != 0) {
        result := ScanBordersAlt()
        if (result = "ABORT")
            return ""
        if (result != "") {
            blocks := ParseBorderBlocks(result)
            suspects := []
            Loop 12 {
                idx := A_Index - 1
                if (!blocks.Has(idx) || InStr(blocks[idx], "OCR ERROR")
                    || StrSplit(blocks[idx], "`n").Length >= 4)
                    suspects.Push(A_Index) ; 1-based for BorderPoints()
            }
            suspectNote := ""
            for , i in suspects
                suspectNote .= (suspectNote = "" ? "" : ",") i
            Log("alt scan | " blocks.Count " blocks | suspect count " suspects.Length)
            if (suspects.Length <= 4) {
                if (suspects.Length > 0) {
                    ToolTip "Alt scan read " (12 - suspects.Length) "/12 - hovering the other " suspects.Length "..."
                    rescans := ParseBorderBlocks(ScanBordersHover(suspects))
                    for , i in suspects
                        if rescans.Has(i - 1)
                            blocks[i - 1] := rescans[i - 1]
                }
                finalBlob := ""
                Loop 12 {
                    idx := A_Index - 1
                    if blocks.Has(idx)
                        finalBlob .= (finalBlob = "" ? "" : "`n")
                            . "=== VOYAGE BORDER " idx " ===`n" blocks[idx] "`n=== END VOYAGE BORDER ==="
                }
                LastBorderScanBlocks := blocks.Count
                return BorderScanMeta(finalBlob)
            }
            ; 5+ suspects: the overview is unreliable here - hover everything
        }
        Log("alt overview unusable - full per-border fallback")
        ToolTip "Alt overview didn't work here - falling back to the per-border scan..."
    }
    result := ScanBordersHover()
    return BorderScanMeta(result)
}

ScanBordersHover(only := 0) {
    global PoeHwnd, BorderHoverDelay, BorderOcrAttempts, Running, LastBorderScanBlocks
    if !RequireBoundPoeForeground() {
        Running := false
        return ""
    }
    Log("hover scan | " (only ? "rescanning " only.Length " suspect(s)" : "all 12"))
    WinGetPos &winX, &winY, &winW, &winH, "ahk_id " PoeHwnd
    result := ""
    LastBorderScanBlocks := 0
    for index, point in BorderPoints() {
        if !Running || !RequireSingleBorderTooltipView() || !RequireBoundPoeForeground() {
            Running := false
            break
        }
        if (only && !ArrayHas(only, index))
            continue
        options := Map(
            "Index", index - 1,
            "WindowLeft", winX,
            "WindowTop", winY,
            "WindowWidth", winW,
            "WindowHeight", winH
        )
        block := ""
        borderStart := A_TickCount
        Loop BorderOcrAttempts {
            if !Running
                break
            attempt := A_Index
            ToolTip "Moving to board border " index "/12..."
                . (attempt > 1 ? "`nRetrying failed OCR scan..." : "")
            MouseMove point[1], point[2], 0
            Sleep BorderHoverDelay + (attempt - 1) * 200
            ToolTip()
            Sleep 30
            if !RequireSingleBorderTooltipView() || !RequireBoundPoeForeground() {
                Running := false
                break
            }
            block := RunOcrHelper(options)
            if (block != "")
                && !InStr(block, "Windows OCR returned no text")
                && !InStr(block, "OCR ERROR:")
                && !InStr(block, "OCR HELPER ERROR:")
                break
        }
        ; per-border health: errors and pathological slowness both go to the
        ; privacy-safe log, without OCR text or paths
        borderMs := A_TickCount - borderStart
        if InStr(block, "OCR ERROR")
            Log("hover border " index " | OCR error | " borderMs "ms")
        else if (borderMs > 8000)
            Log("hover border " index " | slow: " borderMs "ms")
        if (block != "") {
            result .= (result = "" ? "" : "`n") block
            LastBorderScanBlocks++
        }
    }
    return result
}

BorderScanMeta(result) {
    global LastBorderScanBlocks
    meta := "=== VOYAGE BORDER SCAN META ===`n"
        . "Expected: 12`n"
        . "Captured: " LastBorderScanBlocks "`n"
        . "=== END VOYAGE BORDER SCAN META ==="
    return meta . (result = "" ? "" : "`n" result)
}

ScanRerollCost() {
    global PoeHwnd, RerollX, RerollY, RerollHoverDelay, BorderOcrAttempts, Running
    if !RerollCostCalibrated()
        return ""
    if !RequireBoundPoeForeground() {
        Running := false
        return ""
    }

    WinGetPos &winX, &winY, &winW, &winH, "ahk_id " PoeHwnd
    options := Map(
        "RerollCost", true,
        "WindowLeft", winX,
        "WindowTop", winY,
        "WindowWidth", winW,
        "WindowHeight", winH
    )
    block := ""
    rerollPoint := RerollScreenPoint()
    Loop BorderOcrAttempts {
        if !Running
            break
        attempt := A_Index
        ToolTip "Reading border reroll cost..."
            . (attempt > 1 ? "`nRetrying tooltip OCR..." : "")
        MouseMove rerollPoint[1], rerollPoint[2], 0
        Sleep RerollHoverDelay + (attempt - 1) * 200
        ToolTip()
        Sleep 30
        if !RequireBoundPoeForeground() {
            Running := false
            break
        }
        block := RunOcrHelper(options)
        if RegExMatch(block, "i)Border\s+Modifiers?\s+Reroll\s+Cost")
            && RegExMatch(block, "i)(?:3|6|12|24|48)[\s,.]*[0o]{3}")
            break
    }
    return block
}

CopyPayloadToClipboard(payload) {
    if (payload = "")
        return false

    A_Clipboard := payload
    if !ClipWait(1) {
        Flash "Could not place the import payload on the clipboard.", 4000
        return false
    }
    return true
}

DeliverPayloadToSolver(payload) {
    global LastDeliveryError, BrowserPasteDelay
    LastDeliveryError := ""
    if !CopyPayloadToClipboard(payload)
        return "failed"

    solverHwnd := OpenSolverWindow()
    if !solverHwnd {
        LastDeliveryError := "the solver browser window could not be opened and activated"
        return "clipboard"
    }

    ; The solver listens for paste anywhere on the page. No click point, address
    ; bar read, or saved browser binding is needed.
    Send "{Esc}"
    Sleep BrowserPasteDelay
    Send "^v"
    return "pasted"
}

DeliverySummary(delivery) {
    global LastDeliveryError
    if (delivery = "pasted")
        return " Sent the payload to the solver page. Check the Import status for the result."
    if (delivery = "clipboard")
        return " Auto-import skipped: " LastDeliveryError ". The payload remains on the clipboard for Ctrl+V."
    return " No payload was delivered."
}

; Developer smoke-test: prove that the real stdin launcher executes without
; ever creating a visible PowerShell or conhost window.
if A_Args.Length >= 1 && A_Args[1] = "--probe-hidden-ocr-launcher" {
    try {
        probe := RunHiddenPowerShellProbe()
        FileAppend "stdinExecuted=" (probe.StdinExecuted ? "true" : "false") "`n"
            . "visibleConsole=" (probe.VisibleConsole ? "true" : "false") "`n", "*", "UTF-8"
        ExitApp probe.StdinExecuted && !probe.VisibleConsole ? 0 : 1
    } catch as probeError {
        FileAppend "probeError=" probeError.Message "`n", "*", "UTF-8"
        ExitApp 2
    }
}

; Developer smoke-test: run the embedded Windows OCR helper against an image.
if A_Args.Length >= 2
    && (A_Args[1] = "--ocr-file" || A_Args[1] = "--ocr-reroll-cost-file") {
    options := Map("ImagePath", A_Args[2])
    if A_Args[1] = "--ocr-reroll-cost-file"
        options["RerollCost"] := true
    preferredLanguage := A_Args.Length >= 3 ? A_Args[3] : ""
    result := RunOcrHelper(options, false, preferredLanguage)
    FileAppend result, "*", "UTF-8"
    ExitApp
}

; ---- F5 / F6: capture the outer board-border rectangle ----
F5:: {
    global
    if !RequireBoundPoeForeground()
        return
    ClearExactBorderCalibration()
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    BorderTLx := point[1], BorderTLy := point[2]
    IniWrite BorderTLx, IniFile, "board", "TopLeftX"
    IniWrite BorderTLy, IniFile, "board", "TopY"
    Flash "Top-left board border saved relative to the PoE window."
}
F6:: {
    global
    if !RequireBoundPoeForeground()
        return
    ClearExactBorderCalibration()
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    BorderBRx := point[1], BorderBRy := point[2]
    IniWrite BorderBRx, IniFile, "board", "BottomRightX"
    IniWrite BorderBRy, IniFile, "board", "BottomY"
    Flash "Bottom-right board border saved relative to the PoE window."
}

; ---- Ctrl+F5 / Ctrl+F6: guided exact calibration of all 12 modifiers ----
^F5:: {
    global
    if !RequireBoundPoeForeground()
        return
    BeginClientCalibration()
    ClearExactBorderCalibration()
    ExactBorderNext := 1
    Flash "Exact border calibration started."
        . "`nHover 1/12: " BorderPointLabel(ExactBorderNext)
        . "`nPress Ctrl+F6 to save it.", 5000
}

^F6:: {
    global
    if !RequireBoundPoeForeground()
        return
    if (ExactBorderNext < 1 || ExactBorderNext > 12) {
        Flash "Press Ctrl+F5 first to start exact border calibration.", 3500
        return
    }

    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    savedIndex := ExactBorderNext
    ExactBorderPoints.Push(point)
    IniWrite point[1], IniFile, "board-exact", "Point" savedIndex "X"
    IniWrite point[2], IniFile, "board-exact", "Point" savedIndex "Y"
    ExactBorderNext++

    if (ExactBorderNext > 12) {
        ExactBorderNext := 0
        Flash "Exact border calibration complete: 12/12."
            . "`nPress Ctrl+F4 to preview or F9 to scan.", 5000
        return
    }

    Flash "Saved " savedIndex "/12: " BorderPointLabel(savedIndex)
        . "`nNext " ExactBorderNext "/12: " BorderPointLabel(ExactBorderNext)
        . "`nHover it and press Ctrl+F6.", 5000
}

; ---- Ctrl+F4: preview border positions without OCR or clipboard changes ----
^F4:: {
    global
    if Running {
        Flash "A scan or preview is already running.", 2500
        return
    }
    if !BoardCalibrated() {
        MsgBox "Calibrate borders first with F5/F6 or Ctrl+F5/Ctrl+F6."
        return
    }
    if !RequireBoundPoeForeground() {
        MsgBox "Focus the real Path of Exile window and try the preview again."
        return
    }

    Running := true
    if !ActivateBoundPoeWindow() {
        Running := false
        Flash "Couldn't activate the authenticated PoE window.", 3000
        return
    }

    for index, point in BorderPoints() {
        if !Running || !RequireBoundPoeForeground() {
            Running := false
            break
        }
        MouseMove point[1], point[2], 0
        ToolTip "Border preview " index "/12"
            . "`n" BorderPointLabel(index)
            . "`n(F10 to abort)", 20, 20
        Sleep BorderPreviewDelay
    }

    if Running && RerollCostCalibrated() && RequireBoundPoeForeground() {
        rerollPoint := RerollScreenPoint()
        MouseMove rerollPoint[1], rerollPoint[2], 0
        ToolTip "Reroll-cost preview"
            . "`nThe cost tooltip should now be visible."
            . "`n(F10 to abort)", 20, 20
        Sleep BorderPreviewDelay
    }

    completed := Running
    Running := false
    ToolTip()
    if completed
        Flash "Border preview complete. No OCR was run.", 3500
}

; ---- Ctrl+F7: capture the border-reroll button ----
^F7:: {
    global
    if !RequireBoundPoeForeground()
        return
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    RerollX := point[1], RerollY := point[2]
    IniWrite RerollX, IniFile, "board", "RerollX"
    IniWrite RerollY, IniFile, "board", "RerollY"
    Flash "Border reroll button saved relative to the PoE window."
        . "`nIts tooltip cost will be read during F9 / Ctrl+F9.", 4000
}

; ---- F7 / F8: capture the grid corners ----
F7:: {
    global
    if !RequireBoundPoeForeground()
        return
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    TLx := point[1], TLy := point[2]
    IniWrite TLx, IniFile, "grid", "TLx"
    IniWrite TLy, IniFile, "grid", "TLy"
    Flash "Top-left chart saved relative to the PoE window."
}
F8:: {
    global
    if !RequireBoundPoeForeground()
        return
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    BRx := point[1], BRy := point[2]
    IniWrite BRx, IniFile, "grid", "BRx"
    IniWrite BRy, IniFile, "grid", "BRy"
    Flash "Bottom-right chart saved relative to the PoE window."
}

; ---- Shift+F7 / Shift+F8: capture the two chart-stash tabs ----
+F7:: {
    global
    if !RequireBoundPoeForeground()
        return
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    Tab1X := point[1], Tab1Y := point[2]
    IniWrite Tab1X, IniFile, "grid", "Tab1X"
    IniWrite Tab1Y, IniFile, "grid", "Tab1Y"
    Flash "Chart-stash tab 1 saved relative to the PoE window."
}
+F8:: {
    global
    if !RequireBoundPoeForeground()
        return
    try point := CapturePoeClientPoint()
    catch as captureError {
        MsgBox captureError.Message
        return
    }
    Tab2X := point[1], Tab2Y := point[2]
    IniWrite Tab2X, IniFile, "grid", "Tab2X"
    IniWrite Tab2Y, IniFile, "grid", "Tab2Y"
    Flash "Chart-stash tab 2 saved relative to the PoE window."
}

PromptEmptySkip(*) {
    global EmptySkipRows, IniFile
    result := InputBox("Skip the rest of a chart tab after how many fully blank rows in a row?"
        . "`n0 = never skip; scan every cell.", "Blank-row skip", "w420 h150", EmptySkipRows)
    if (result.Result != "OK")
        return
    if !RegExMatch(Trim(result.Value), "^\d+$") {
        Flash "Enter a whole number (0 or more).", 2500
        return
    }
    EmptySkipRows := Trim(result.Value) + 0
    IniWrite EmptySkipRows, IniFile, "sweep", "EmptySkipRows"
    Flash "Blank-row skip: " (EmptySkipRows = 0
        ? "disabled"
        : "after " EmptySkipRows " blank row" (EmptySkipRows = 1 ? "" : "s")), 3000
}

; the script sends Ctrl (copies/paste) and holds Alt (border reveal) - make
; sure none of them stay logically held if a sweep ends mid-keystroke
ReleaseModifiers() {
    Send "{Ctrl up}{Alt up}{Shift up}"
}

; ---- F10: abort ----
F10:: {
    global Running, ExactBorderNext
    Running := false
    ExactBorderNext := 0
    CleanupOcr()
    ReleaseModifiers()
    Flash "Aborting..."
}

; ---- Ctrl+F9: refresh only the board borders after an in-game reroll ----
^F9:: {
    global
    if Running {
        Flash "A scan is already running.", 2500
        return
    }
    if !BoardCalibrated() {
        MsgBox "Calibrate borders first with F5/F6 or Ctrl+F5/Ctrl+F6."
        return
    }
    if !RequireBoundPoeForeground() {
        MsgBox "Focus the real Path of Exile window and press Ctrl+F9 again."
        return
    }

    Running := true
    if !ActivateBoundPoeWindow() {
        Running := false
        Flash "Couldn't activate the authenticated PoE window.", 3000
        return
    }
    Sleep ActivateDelay

    Log("borders-only start")
    ToolTip "Refreshing 12 board borders with Windows OCR..."
        . "`nCharts will not be scanned."
        . "`n(F10 to abort)"
    borderBlob := ScanBorders()
    if !Running
        return
    rerollCostBlob := ScanRerollCost()
    if !Running
        return
    if (borderBlob = "" && rerollCostBlob = "") {
        Running := false
        ReleaseModifiers()
        Flash "Border and reroll-cost OCR returned no data. Try Ctrl+F9 again.", 4000
        return
    }
    ToolTip()
    Log("borders-only | borders " (borderBlob != "" ? "captured" : "failed")
        . " | reroll " (rerollCostBlob != "" ? "captured" : "skipped-or-failed"))

    payload := borderBlob
    if (payload != "" && rerollCostBlob != "")
        payload .= "`n"
    payload .= rerollCostBlob
    delivery := DeliverPayloadToSolver(payload)
    if (delivery = "failed") {
        Running := false
        ReleaseModifiers()
        return
    }

    Running := false
    ReleaseModifiers()
    costNote := RerollCostCalibrated()
        ? (rerollCostBlob != "" ? " + reroll cost" : " (reroll-cost OCR failed)")
        : " (reroll cost skipped: calibrate Ctrl+F7)"
    Flash "Copied " LastBorderScanBlocks "/12 border OCR results"
        . costNote "; charts were not rescanned." DeliverySummary(delivery), 8000
}

; ---- F9: the real import sweep ----
F9:: {
    global
    if !Calibrated() {
        MsgBox "Calibrate the chart stash first:`n"
            . "F7 = top-left slot, F8 = bottom-right slot`n"
            . "Shift+F7 = tab 1, Shift+F8 = tab 2."
        return
    }
    if !RequireBoundPoeForeground() {
        MsgBox "Focus the real Path of Exile window and press F9 again."
        return
    }

    Running := true
    copied := 0, skipped := 0, nonChart := 0, scannedCharts := 0
    blob := "", borderBlob := "", rerollCostBlob := ""
    delivery := "none"
    firstChart := "", allIdentical := true, firstTabSignature := "", tabsIdentical := false
    Log("sweep start | grid " GridCols "x" GridRows " | tabs 2"
        . " | EmptySkipRows " EmptySkipRows " | AltScan " AltScanBorders)

    ; ---- Phase 1: copy every chart while staying in PoE ----
    if !ActivateBoundPoeWindow() {
        Running := false
        Flash "Couldn't activate the authenticated PoE window.", 3000
        return
    }
    Sleep ActivateDelay

    tabPoints := ChartTabPoints()
    for tabIndex, tabPoint in tabPoints {
        if !Running || !RequireBoundPoeForeground() {
            Running := false
            break
        }
        MouseMove tabPoint[1], tabPoint[2], 0
        Click
        Sleep TabSwitchDelay
        if !RequireBoundPoeForeground() {
            Running := false
            break
        }
        tabSignature := ""
        emptyRowStreak := 0
        Loop GridRows {
            if !Running || !RequireBoundPoeForeground() {
                Running := false
                break
            }
            r := A_Index - 1
            rowEmpty := true
            Loop GridCols {
                if !Running || !RequireBoundPoeForeground() {
                    Running := false
                    break
                }
                c := A_Index - 1
                p := CellPos(r, c)
                A_Clipboard := ""
                MouseMove p[1], p[2], 0
                Sleep HoverDelay
                if !RequireBoundPoeForeground() {
                    Running := false
                    break
                }
                Send "^c"
                copiedToClipboard := ClipWait(ClipTimeout)
                if !RequireBoundPoeForeground() {
                    Running := false
                    break
                }
                if !copiedToClipboard {
                    tabSignature .= "|0:"
                    skipped++                 ; empty slot - nothing copied
                    continue
                }
                rowEmpty := false
                clip := Trim(A_Clipboard, " `t`r`n")
                tabSignature .= "|" StrLen(clip) ":" clip
                if !IsChartText(clip) {
                    skipped++                 ; not a Chart item
                    nonChart++
                    continue
                }
                scannedCharts++
                if (firstChart = "")
                    firstChart := clip
                else if (clip != firstChart)
                    allIdentical := false
                ; Keep identical item text: separate physical Charts are separate
                ; solver pieces even when every copied property is the same.
                blob .= (blob = "" ? "" : "`n") clip
                copied++
                ToolTip "Copying tab " tabIndex "/" tabPoints.Length
                    . "... row " (r+1) " col " (c+1)
                    . "`ncharts " copied "   skipped " skipped
                    . "`n(F10 to abort)"
            }
            if !Running
                break
            if rowEmpty {
                emptyRowStreak++
                if (EmptySkipRows > 0 && emptyRowStreak >= EmptySkipRows) {
                    ToolTip "Tab " tabIndex ": " EmptySkipRows
                        . " blank row" (EmptySkipRows = 1 ? "" : "s")
                        . " - skipping the rest..."
                    break
                }
            } else {
                emptyRowStreak := 0
            }
        }

        if (tabIndex = 1)
            firstTabSignature := tabSignature
        else if (tabSignature = firstTabSignature)
            tabsIdentical := true
    }
    Log("sweep phase 1 | copied " copied " | skipped " skipped " | nonChart " nonChart)

    ; Leave the stash on tab 1, matching the game's default view.
    if Running && RequireBoundPoeForeground() {
        tab1Point := ChartTabPoints()[1]
        MouseMove tab1Point[1], tab1Point[2], 0
        Click
        Sleep TabSwitchDelay
        if !RequireBoundPoeForeground()
            Running := false
    }

    ; Distinct physical Charts always differ in their rolled values. If every
    ; occupied cell copied the same text, the mouse stayed on one item and the
    ; saved grid corners are no longer valid.
    calibWarn := ""
    if Running && tabsIdentical {
        blob := "", copied := 0
        calibWarn := "Both chart-stash tabs produced identical slot data, so none were sent"
            . " - a tab click probably missed. Recalibrate tab 1 with Shift+F7"
            . " and tab 2 with Shift+F8, then try again."
    } else if Running && scannedCharts >= 5 && allIdentical {
        blob := "", copied := 0
        calibWarn := "Every occupied grid cell copied the SAME chart, so none were sent"
            . " - your chart-inventory grid calibration looks wrong (or PoE's window moved)."
            . " Recalibrate the small chart squares with F7/F8 and try again."
    }
    if (Running && calibWarn = "" && copied = 0) {
        if (nonChart > 0)
            calibWarn := "Copied " nonChart " item(s) that aren't Charts - the F7/F8 grid"
                . " is probably over the wrong panel. Calibrate the small chart INVENTORY"
                . " squares on the right, not the large 3x3 Voyage board."
        else
            calibWarn := "Nothing was ever copied - Ctrl+C isn't reaching the game,"
                . " or the grid isn't over your Charts. Check that F7/F8 target the small"
                . " chart INVENTORY squares on the right; then check administrator mode,"
                . " mouse-and-keyboard input, Windowed mode, and that the chart panel is open."
                . " (If the chart inventory is genuinely empty, ignore this.)"
    }
    if (calibWarn != "")
        Log("sweep warning | " calibWarn)

    ; ---- Phase 2: OCR the 12 borders and the optional reroll-cost tooltip ----
    if Running && BoardCalibrated() {
        ToolTip "Reading 12 board borders with Windows OCR..."
            . "`nThis can take 15-30 seconds on a 4K screen."
            . "`n(F10 to abort)"
        borderBlob := ScanBorders()
    }
    if Running && RerollCostCalibrated()
        rerollCostBlob := ScanRerollCost()

    if !Running
        return

    ; ---- Phase 3: open or activate the solver page and paste once ----
    if Running && (copied > 0 || borderBlob != "" || rerollCostBlob != "") {
        payload := blob
        if (payload != "" && borderBlob != "")
            payload .= "`n"
        payload .= borderBlob
        if (payload != "" && rerollCostBlob != "")
            payload .= "`n"
        payload .= rerollCostBlob
        delivery := DeliverPayloadToSolver(payload)
        if (delivery = "failed") {
            Running := false
            ReleaseModifiers()
            return
        }
    }

    Running := false
    ReleaseModifiers()
    Log("sweep done | sent " copied " charts | borders "
        . (borderBlob != "" ? "sent" : (BoardCalibrated() ? "FAILED" : "skipped")))
    borderNote := BoardCalibrated()
        ? " + " LastBorderScanBlocks "/12 border OCR results"
        : " (borders skipped: calibrate F5/F6)"
    costNote := RerollCostCalibrated()
        ? (rerollCostBlob != "" ? " + reroll cost" : " (reroll-cost OCR failed)")
        : " (reroll cost skipped: calibrate Ctrl+F7)"
    if (calibWarn != "") {
        Flash calibWarn borderNote costNote, 10000
        return
    }
    Flash "Copied " copied " charts from 2 stash tabs" borderNote costNote
        . "; skipped " skipped " empty/non-chart cells." DeliverySummary(delivery), 9000
}
