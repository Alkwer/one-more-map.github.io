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
;              button. An in-memory PowerShell helper captures the PoE window
;              and reads each tooltip with the Windows OCR engine. No script is
;              executed from TEMP, and screenshots never leave the PC.
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
OcrTimeout    := 90    ; seconds before a stuck Windows OCR scan is stopped
; If it ever MISSES a chart, raise HoverDelay ~10ms at a time (the cursor
; isn't settling before Ctrl+C).
; ----------------------------------------

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
; expand to the real long path before any helper paths are built.
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
OcrOutput := TempDir "\voyage-border-ocr-" ScriptPid ".txt"
OcrPid := 0
LastBorderScanBlocks := 0
Running := false
A_TrayMenu.Add "Configure blank-row skip...", PromptEmptySkip

StopOcrProcess() {
    global OcrPid
    pid := OcrPid
    if pid && ProcessExist(pid) {
        try ProcessClose pid
        try ProcessWaitClose pid, 1
    }
    OcrPid := 0
}

CleanupOcrArtifacts() {
    global OcrOutput, ScriptPid
    try FileDelete OcrOutput
    try FileDelete A_Temp "\voyage-border-" ScriptPid "-*.png"
    try FileDelete A_Temp "\voyage-ocr-filtered-" ScriptPid "-*.png"
    try FileDelete A_Temp "\voyage-ocr-normalized-" ScriptPid "-*.png"
}

CleanupOcr(*) {
    StopOcrProcess()
    CleanupOcrArtifacts()
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
[string]$OutputPath = $env:VOYAGE_OCR_OUTPUT_PATH
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    throw 'The trusted OCR output path was not provided.'
}

$ErrorActionPreference = 'Stop'
$script:RecognizerLanguage = ''
if ([string]::IsNullOrWhiteSpace($RunId)) { $RunId = [string]$PID }
trap {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText(
        $OutputPath,
        ('OCR HELPER ERROR: ' + $_.Exception.ToString()),
        $utf8)
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

    // HDR desktops can make GDI captures washed-out and low-contrast. Stretch
    // the 2nd..98th percentile luminance range to full contrast as a final OCR
    // pass. Keep Prepare's scale and padding across display resolutions.
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
'@

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

$builder = [System.Text.StringBuilder]::new()
if ($ImagePath) {
    $text = Read-OcrLines $ImagePath -Unfiltered:$RerollCost
    if ($RerollCost) {
        Add-RerollCostBlock $builder $text
    } else {
        Add-Block $builder 0 $text
    }
} else {
    if (($Index -lt 0 -and -not $RerollCost) -or $WindowWidth -le 0 -or $WindowHeight -le 0) {
        throw 'Invalid Path of Exile window size.'
    }
    $png = Join-Path $env:TEMP "voyage-border-$RunId-$PID-$Index.png"
    Remove-Item -LiteralPath $png -Force -ErrorAction SilentlyContinue
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

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, $builder.ToString(), $utf8)
)"
}

SetOcrEnvironment(options, preferredLanguage) {
    global OcrOutput, ScriptPid
    script := OcrPowerShell()
    if (StrLen(script) > 30000)
        throw Error("The in-memory Windows OCR helper exceeds its safe environment budget.")
    EnvSet "VOYAGE_OCR_SCRIPT", script
    EnvSet "VOYAGE_OCR_INDEX", options.Get("Index", -1)
    EnvSet "VOYAGE_OCR_WINDOW_LEFT", options.Get("WindowLeft", 0)
    EnvSet "VOYAGE_OCR_WINDOW_TOP", options.Get("WindowTop", 0)
    EnvSet "VOYAGE_OCR_WINDOW_WIDTH", options.Get("WindowWidth", 0)
    EnvSet "VOYAGE_OCR_WINDOW_HEIGHT", options.Get("WindowHeight", 0)
    EnvSet "VOYAGE_OCR_IMAGE_PATH", options.Get("ImagePath", "")
    EnvSet "VOYAGE_OCR_PREFERRED_LANGUAGE", preferredLanguage
    EnvSet "VOYAGE_OCR_RUN_ID", ScriptPid
    EnvSet "VOYAGE_OCR_REROLL_COST", options.Get("RerollCost", false) ? "1" : "0"
    EnvSet "VOYAGE_OCR_OUTPUT_PATH", OcrOutput
}

ClearOcrEnvironment() {
    for name in [
        "VOYAGE_OCR_SCRIPT",
        "VOYAGE_OCR_INDEX",
        "VOYAGE_OCR_WINDOW_LEFT",
        "VOYAGE_OCR_WINDOW_TOP",
        "VOYAGE_OCR_WINDOW_WIDTH",
        "VOYAGE_OCR_WINDOW_HEIGHT",
        "VOYAGE_OCR_IMAGE_PATH",
        "VOYAGE_OCR_PREFERRED_LANGUAGE",
        "VOYAGE_OCR_RUN_ID",
        "VOYAGE_OCR_REROLL_COST",
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

RunOcrHelper(options, cancellable := true, preferredLanguage := "") {
    global OcrOutput, OcrPid, OcrTimeout, Running
    global PowerShellExe, ExpectedPowerShellImage
    CleanupOcrArtifacts()
    quote := Chr(34)
    try {
        if (preferredLanguage = "")
            preferredLanguage := PreferredOcrLanguage()
        command := quote PowerShellExe quote
            . " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
            . quote "& ([ScriptBlock]::Create($env:VOYAGE_OCR_SCRIPT))" quote
        try {
            SetOcrEnvironment(options, preferredLanguage)
            Run command, , "Hide", &OcrPid
        } finally {
            ClearOcrEnvironment()
        }
        actualImage := ProcessImagePath(OcrPid)
        if (NormalizeWindowsPath(actualImage) != NormalizeWindowsPath(ExpectedPowerShellImage)) {
            try ProcessClose OcrPid
            throw Error("Windows OCR child image was not the trusted System32 PowerShell.")
        }
        deadline := A_TickCount + OcrTimeout * 1000
        while ProcessExist(OcrPid) {
            if (cancellable && !Running)
                return ""
            if (A_TickCount > deadline) {
                MsgBox "Windows OCR timed out. Try again, or raise OcrTimeout in the script."
                return ""
            }
            Sleep 100
        }
        OcrPid := 0
        if !FileExist(OcrOutput)
            return ""
        return FileRead(OcrOutput, "UTF-8")
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

ScanBorders() {
    global PoeHwnd, BorderHoverDelay, BorderOcrAttempts, Running, LastBorderScanBlocks
    if !RequireSingleBorderTooltipView()
        return ""
    if !RequireBoundPoeForeground() {
        Running := false
        return ""
    }
    WinGetPos &winX, &winY, &winW, &winH, "ahk_id " PoeHwnd
    result := ""
    LastBorderScanBlocks := 0
    for index, point in BorderPoints() {
        if !Running || !RequireSingleBorderTooltipView() || !RequireBoundPoeForeground() {
            Running := false
            break
        }
        options := Map(
            "Index", index - 1,
            "WindowLeft", winX,
            "WindowTop", winY,
            "WindowWidth", winW,
            "WindowHeight", winH
        )
        block := ""
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
        if (block != "") {
            result .= (result = "" ? "" : "`n") block
            LastBorderScanBlocks++
        }
    }
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
        emptyStreak := 0
        emptySkipCells := EmptySkipRows * GridCols

        Loop GridRows {
            if !Running || !RequireBoundPoeForeground() {
                Running := false
                break
            }
            r := A_Index - 1
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
                    emptyStreak++
                    if (emptySkipCells > 0 && emptyStreak >= emptySkipCells) {
                        ToolTip "Tab " tabIndex ": " EmptySkipRows
                            . " blank row" (EmptySkipRows = 1 ? "" : "s")
                            . " - skipping the rest..."
                        break 2
                    }
                    continue
                }
                clip := Trim(A_Clipboard, " `t`r`n")
                tabSignature .= "|" StrLen(clip) ":" clip
                if !IsChartText(clip) {
                    skipped++                 ; not a Chart item
                    nonChart++
                    emptyStreak := 0
                    continue
                }
                emptyStreak := 0
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
        }

        if (tabIndex = 1)
            firstTabSignature := tabSignature
        else if (tabSignature = firstTabSignature)
            tabsIdentical := true
    }

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
