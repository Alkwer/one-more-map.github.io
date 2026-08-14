#Requires AutoHotkey v2.0
#SingleInstance Off
#NoTrayIcon

DetectHiddenWindows false

candidates := []
for hwnd in WinGetList("ahk_class POEWindowClass") {
    try processName := WinGetProcessName("ahk_id " hwnd)
    catch
        continue
    if RegExMatch(processName, "i)^PathOfExile[_A-Za-z0-9-]*\.exe$")
        candidates.Push([hwnd, InStr(processName, "Steam", false) ? "PathOfExileSteam" : "PathOfExile"])
}

if candidates.Length != 1 {
    FileAppend '{"found":false,"candidateCount":' candidates.Length '}', "*", "UTF-8"
    ExitApp
}

hwnd := candidates[1][1]
family := candidates[1][2]
try {
    WinGetClientPos &x, &y, &width, &height, "ahk_id " hwnd
    style := WinGetStyle("ahk_id " hwnd)
    dpi := DllCall("GetDpiForWindow", "Ptr", hwnd, "UInt")
    mode := style & 0x00C00000 ? "Windowed" : "Windowed Fullscreen"
    elevated := IsProcessElevated(WinGetPID("ahk_id " hwnd))
    elevatedJson := elevated = 1 ? "true" : elevated = 0 ? "false" : "null"
    output := '{"found":true,"candidateCount":1,"executableFamily":"' family '"'
        . ',"clientWidth":' width
        . ',"clientHeight":' height
        . ',"dpi":' dpi
        . ',"dpiScalePercent":' Round((dpi / 96) * 100)
        . ',"mode":"' mode '"'
        . ',"elevated":' elevatedJson '}'
    FileAppend output, "*", "UTF-8"
} catch {
    FileAppend '{"found":false,"candidateCount":1,"inspectionFailed":true}', "*", "UTF-8"
}
ExitApp

IsProcessElevated(processId) {
    process := DllCall("OpenProcess", "UInt", 0x1000, "Int", false, "UInt", processId, "Ptr")
    if !process
        return -1

    token := 0
    if !DllCall("Advapi32\OpenProcessToken", "Ptr", process, "UInt", 0x0008, "Ptr*", &token) {
        DllCall("CloseHandle", "Ptr", process)
        return -1
    }

    elevation := Buffer(4, 0)
    returned := 0
    ok := DllCall(
        "Advapi32\GetTokenInformation",
        "Ptr", token,
        "Int", 20,
        "Ptr", elevation,
        "UInt", elevation.Size,
        "UInt*", &returned,
    )
    result := ok ? NumGet(elevation, 0, "UInt") : -1
    DllCall("CloseHandle", "Ptr", token)
    DllCall("CloseHandle", "Ptr", process)
    return result
}
