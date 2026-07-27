#Requires AutoHotkey v2.0
#SingleInstance Force
SetWorkingDir A_ScriptDir
SetTitleMatchMode 2          ; match window titles by "contains"
CoordMode "Mouse", "Screen"  ; all coords are absolute screen pixels

; =====================================================================
;  Allflame Voyage - bulk chart importer  (AutoHotkey v2)
;
;  Two-phase, fast:
;    Phase 1 - stays in PoE, hovers every cell and Ctrl+C's it, appending
;              each chart's text into one buffer (no window switching).
;    Phase 2 - switches to the browser ONCE and pastes the whole buffer;
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
;  CALIBRATE THE GRID (once; it's saved to voyage-import.ini)
;   - Hover the CENTRE of the TOP-LEFT chart, press  F7.
;   - Hover the CENTRE of the BOTTOM-RIGHT cell of the 6-wide grid
;     (the far corner cell, even if it's empty), press  F8.
;   - Set GridCols / GridRows below to match your panel.
;
;  RUN
;   F4 = test one copy (hover top-left, shows what PoE copied)
;   F5 = dry run (mouse walks every cell, no copy/paste) to check aim
;   F6 = do the real import sweep
;   F9 = abort at any time
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
PasteDelay    := 90    ; ms after the single big paste
ClipTimeout   := 0.2   ; seconds to wait for Ctrl+C (only empty cells wait the full time)
StepDelay     := 40    ; ms between cells in the F5 dry run
; If it ever MISSES a chart, raise HoverDelay ~10ms at a time (the cursor
; isn't settling before Ctrl+C). If the final paste drops some, raise PasteDelay.
; ----------------------------------------

IniFile := A_ScriptDir "\voyage-import.ini"
TLx := IniRead(IniFile, "grid", "TLx", "0") + 0
TLy := IniRead(IniFile, "grid", "TLy", "0") + 0
BRx := IniRead(IniFile, "grid", "BRx", "0") + 0
BRy := IniRead(IniFile, "grid", "BRy", "0") + 0
Running := false

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

Calibrated() => (BRx != 0 || BRy != 0)

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

; ---- F4: single-copy test ----
F4:: {
    global
    if !Calibrated() {
        MsgBox "Calibrate first (F7 top-left, F8 bottom-right)."
        return
    }
    if !WinExist(PoeWinTitle) {
        MsgBox "Can't find the PoE window."
        return
    }
    WinActivate PoeWinTitle
    WinWaitActive PoeWinTitle, , 2
    Sleep ActivateDelay
    A_Clipboard := ""
    p := CellPos(0, 0)
    MouseMove p[1], p[2], 0
    Sleep HoverDelay
    Send "^c"
    if !ClipWait(ClipTimeout) {
        Flash "Nothing copied - check aim / that Ctrl+C copies items in PoE.", 3000
        return
    }
    first := StrSplit(A_Clipboard, "`n")
    Flash "Copied: " (first.Length ? first[1] : "?"), 3500
}

; ---- F5: dry run (no copy/paste) ----
F5:: {
    global
    if !Calibrated() {
        MsgBox "Calibrate first (F7 top-left, F8 bottom-right)."
        return
    }
    Loop GridRows {
        r := A_Index - 1
        Loop GridCols {
            c := A_Index - 1
            p := CellPos(r, c)
            MouseMove p[1], p[2], 2
            Sleep StepDelay
        }
    }
    Flash "Dry run done."
}

; ---- F9: abort ----
F9:: {
    global Running
    Running := false
    Flash "Aborting..."
}

; ---- F6: the real import sweep ----
F6:: {
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
    copied := 0, skipped := 0, blob := "", seen := Map()

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
                . "`n(F9 to abort)"
        }
    }

    ; ---- Phase 2: one switch, one paste of the whole batch ----
    if (copied > 0 && Running) {
        A_Clipboard := blob
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
    Flash "Done. Sent " copied " charts in one paste; skipped " skipped " empty/dup cells.", 5000
}
