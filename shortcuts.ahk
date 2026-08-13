; shortcuts.ahk — v2.3  (standalone, no komorebi)
; Vinti's Windows keybinds
;
; BOTTOM monitor — Odyssey G8 3440x1440, primary, at origin
;   Win+1..4          switch native virtual desktop
;   Win+Shift+1..4    send active window to that desktop + follow
;
; TOP monitor — LG 4K, sits at y=-2160
;   Win+5 / Win+6         switch top workspace
;   Win+Shift+5 / +6      send active window to that top workspace + follow
;   Win+Shift+9           throw active window up to current top workspace
;   Win+Shift+0           bring active window back down to the primary
;   Win+Shift+T           tile current top workspace (master left / stack right)
;   Win+Shift+D           debug: what is being tracked
;
; GENERAL
;   Win+B             NEW Brave window (every press)
;   Win+T / Win+E     Terminal / Explorer
;   Win+H / Win+V     clipboard history / emoji picker at cursor
;   Win+Q / Win+W     close window
;   Win+F             maximize / restore
;   Win+C             center window on its current monitor
;   Win+LMB / RMB     move / resize from anywhere
;   Ctrl+Shift+W      random wallpaper + sync lights
;   Ctrl+Shift+A      open wallhaven browser
;   Ctrl+Shift+L      open lights picker
;
; NOTE: run as administrator, otherwise WinHide silently fails on elevated
;       windows and top workspaces will look broken.

#Requires AutoHotkey v2.0
#SingleInstance Force

ProcessSetPriority "High"

; ──────────────────────────────────────────────
;  CONFIG & GLOBALS
; ──────────────────────────────────────────────

brave      := "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
terminal   := "wt.exe"
wallFolder := "C:\Users\catal\Pictures\Wallpapers\Spans"
vdaPath    := A_ScriptDir "\VirtualDesktopAccessor.dll"

; Top-monitor workspace state
global CurrentTopWorkspace := 1
global TopWorkspaces := Map()   ; hwnd -> workspace number

; Hue Sync state
global HueSyncState := "None"   ; "None", "Video", or "Game"

; Failsafe: unhide everything if the script exits or crashes
OnExit UnhideAllTopWindows
UnhideAllTopWindows(ExitReason, ExitCode) {
    global TopWorkspaces
    DetectHiddenWindows true     ; without this, WinShow can't even see them
    for hwnd, wksp in TopWorkspaces {
        try WinShow "ahk_id " hwnd
    }
}

; ──────────────────────────────────────────────
;  STARTUP — load VDA safely
; ──────────────────────────────────────────────

hVDA := DllCall("LoadLibrary", "Str", vdaPath, "Ptr")
if !hVDA {
    MsgBox("WARNING: VirtualDesktopAccessor.dll failed to load.`n`nExpected at:`n" vdaPath, "VDA Error")
}

; ──────────────────────────────────────────────
;  APPLICATIONS
; ──────────────────────────────────────────────

; Always a fresh window. Drop --new-window if you ever want the old
; focus-existing behaviour back.
#b:: {
    global brave
    Run '"' brave '" --new-window'
}

#t:: {
    global terminal
    Run terminal
    if hwnd := WinWait("ahk_exe WindowsTerminal.exe",, 3)
        WinActivate hwnd
}

#e:: {
    Run "shell:MyComputerFolder"
    if hwnd := WinWait("ahk_class CabinetWClass",, 3)
        WinActivate hwnd
}

; ──────────────────────────────────────────────
;  FIXED SYSTEM MENUS
; ──────────────────────────────────────────────

#h:: {
    MouseGetPos &mX, &mY
    Send "#v"
    try {
        if WinWait("ahk_exe TextInputHost.exe",, 1) {
            WinMove mX, mY,,, "ahk_exe TextInputHost.exe"
        }
    }
}

#v:: {
    MouseGetPos &mX, &mY
    Send "#."
    try {
        if WinWait("ahk_exe TextInputHost.exe",, 1) {
            WinMove mX, mY,,, "ahk_exe TextInputHost.exe"
        }
    }
}

; ──────────────────────────────────────────────
;  WINDOW ACTIONS
; ──────────────────────────────────────────────

#q:: WinClose "A"
#w:: WinClose "A"

#f:: {
    activeHwnd := WinGetID("A")
    if WinGetMinMax(activeHwnd) == 1 {
        WinRestore activeHwnd
    } else {
        WinMaximize activeHwnd
    }
}

#c:: CenterWindowOnCurrentMonitor()

; ──────────────────────────────────────────────
;  MOUSE — move / resize from anywhere
; ──────────────────────────────────────────────

#LButton:: {
    CoordMode "Mouse", "Screen"
    SetWinDelay -1
    MouseGetPos &startX, &startY, &hwnd
    WinGetPos &origWinX, &origWinY,,, "ahk_id " . hwnd
    WinActivate "ahk_id " . hwnd

    while GetKeyState("LButton", "P") {
        MouseGetPos &curX, &curY
        dx := curX - startX
        dy := curY - startY
        if (dx != 0 || dy != 0) {
            WinMove origWinX + dx, origWinY + dy,,, "ahk_id " . hwnd
        }
        Sleep 0
    }

    ; pin+track if it landed up top, unpin+untrack if it came back down
    ReconcileWindow(hwnd)
}

#RButton:: {
    CoordMode "Mouse", "Screen"
    SetWinDelay -1
    MouseGetPos &startX, &startY, &hwnd
    WinGetPos &origWinX, &origWinY, &origWinW, &origWinH, "ahk_id " . hwnd
    WinActivate "ahk_id " . hwnd
    while GetKeyState("RButton", "P") {
        MouseGetPos &curX, &curY
        dx := curX - startX
        dy := curY - startY
        if (dx != 0 || dy != 0) {
            WinMove ,, origWinW + dx, origWinH + dy, "ahk_id " . hwnd
        }
        Sleep 0
    }
}

; ──────────────────────────────────────────────
;  BOTTOM MONITOR (NATIVE VIRTUAL DESKTOPS)
; ──────────────────────────────────────────────

#1:: GoToDesktop(1)
#2:: GoToDesktop(2)
#3:: GoToDesktop(3)
#4:: GoToDesktop(4)

#+1:: MoveAndSwitch(1)
#+2:: MoveAndSwitch(2)
#+3:: MoveAndSwitch(3)
#+4:: MoveAndSwitch(4)

; ──────────────────────────────────────────────
;  TOP MONITOR (CUSTOM AHK WORKSPACES) — 5 and 6 only
; ──────────────────────────────────────────────

#5:: SwitchTopWorkspace(1)
#6:: SwitchTopWorkspace(2)

#+5:: MoveToTopWorkspace(1)
#+6:: MoveToTopWorkspace(2)

; Throw active window up to the top monitor (current top workspace)
#+9:: {
    global CurrentTopWorkspace
    MoveToTopWorkspace(CurrentTopWorkspace)
}

; Bring active window back down to the primary monitor
#+0:: SendWindowToBottom()

; Tile whatever is on the current top workspace
#+t:: TileTopWorkspace()

; Debug: what is being tracked?
#+d:: {
    global CurrentTopWorkspace, TopWorkspaces
    DetectHiddenWindows true
    out := "Current top workspace: " CurrentTopWorkspace "`n`n"
    if (TopWorkspaces.Count = 0) {
        out .= "(nothing tracked)"
    }
    for hwnd, wksp in TopWorkspaces {
        title := "<gone>"
        state := ""
        try {
            title := WinGetTitle("ahk_id " hwnd)
            state := WinExist("ahk_id " hwnd) ? "" : " [missing]"
        }
        out .= "ws" wksp "  " hwnd "  " title state "`n"
    }
    MsgBox(out, "Top monitor tracking")
}

; ──────────────────────────────────────────────
;  WALLPAPER & LIGHTS MANAGEMENT
; ──────────────────────────────────────────────

global lastWallpaper := ""

^+w:: Run('pythonw.exe "C:\Users\catal\Scripts\wallpicker.py"',, "Hide")
^+a:: Run('pythonw.exe "C:\Users\catal\Scripts\wallhaven.py"',, "Hide")
^+l:: Run('pythonw.exe "C:\Users\catal\Scripts\lights.py"',, "Hide")

; ──────────────────────────────────────────────
;  HUE SYNC AUTOMATION
; ──────────────────────────────────────────────

SetTimer AutoHueSync, 500

AutoHueSync() {
    global HueSyncState
    
    ; SAFELY get the active window. WinExist("A") does not throw if no window is active.
    activeHwnd := WinExist("A")
    if !activeHwnd
        return

    ; Aggressively ignore explorer, start menu, and taskbar overlays
    exeName := WinGetProcessName("ahk_id " activeHwnd)
    if (exeName = "explorer.exe" || exeName = "SearchHost.exe" || exeName = "StartMenuExperienceHost.exe" || exeName = "ShellExperienceHost.exe")
        return

    ; Ignore specific transparent borderless UI elements (like taskbar hover previews)
    class := WinGetClass("ahk_id " activeHwnd)
    if (class = "WorkerW" || class = "Progman" || class = "Shell_TrayWnd" || class = "Shell_SecondaryTrayWnd" || class = "TaskListThumbnailWnd" || class = "PopupHost" || class = "XamlExplorerHostIslandWindow")
        return

    isFull := false
    style := WinGetStyle("ahk_id " activeHwnd)

    ; A window is truly fullscreen if it lacks a titlebar (WS_CAPTION = 0x00C00000)
    ; and its physical dimensions match or exceed the monitor it sits on.
    if !(style & 0x00C00000) { 
        WinGetPos &wX, &wY, &wW, &wH, "ahk_id " activeHwnd
        
        Loop MonitorGetCount() {
            MonitorGet A_Index, &mLeft, &mTop, &mRight, &mBottom
            if (wX <= mLeft + 5 && wY <= mTop + 5 && (wX + wW) >= mRight - 5 && (wY + wH) >= mBottom - 5) {
                isFull := true
                break
            }
        }
    }

    if (isFull) {
        isBrowser := (exeName = "brave.exe" || exeName = "chrome.exe" || exeName = "firefox.exe" || exeName = "msedge.exe")
        
        if (isBrowser) {
            if (HueSyncState != "Video") {
                if (HueSyncState = "Game")
                    Send "^+{F11}"  ; Toggle Game off first if it was on
                HueSyncState := "Video"
                ; Kill ALL lights for a clean slate
                Run('pythonw.exe "C:\Users\catal\Scripts\lights.py" --video',, "Hide")
                Sleep 500
                Send "^+{F12}"      ; Toggle Video on
            }
        } else {
            if (HueSyncState != "Game") {
                if (HueSyncState = "Video")
                    Send "^+{F12}"  ; Toggle Video off first if it was on
                HueSyncState := "Game"
                ; Kill Room and PC, but leave the Keyboard active
                Run('pythonw.exe "C:\Users\catal\Scripts\lights.py" --game',, "Hide")
                Sleep 500
                Send "^+{F11}"      ; Toggle Game on
            }
        }
    } else {
        ; Window is not fullscreen, toggle off whatever is currently active
        if (HueSyncState != "None") {
            if (HueSyncState = "Video")
                Send "^+{F12}"
            else if (HueSyncState = "Game")
                Send "^+{F11}"
            HueSyncState := "None"
            ; Restore the room to the wallpaper colors
            Run('pythonw.exe "C:\Users\catal\Scripts\lights.py" --auto',, "Hide")
        }
    }
}

; ──────────────────────────────────────────────
;  MONITOR HELPERS  (mixed-DPI safe)
; ──────────────────────────────────────────────

GetTopMonitorIndex() {
    Loop MonitorGetCount() {
        MonitorGet A_Index,, &t
        if (t < 0)
            return A_Index
    }
    return 0
}

MoveWindowSafe(hwnd, x, y, w, h) {
    try {
        WinMove x, y, w, h, hwnd
        Sleep 80
        WinMove x, y, w, h, hwnd
    }
}

FillMonitor(hwnd, monIndex) {
    if (!monIndex || !hwnd)
        return false
    MonitorGetWorkArea monIndex, &WL, &WT, &WR, &WB
    MoveWindowSafe(hwnd, WL, WT, WR - WL, WB - WT)
    return true
}

FillTopMonitor(hwnd) {
    return FillMonitor(hwnd, GetTopMonitorIndex())
}

FillPrimaryMonitor(hwnd) {
    return FillMonitor(hwnd, MonitorGetPrimary())
}

IsTopWindow(hwnd) {
    try {
        if (WinGetMinMax(hwnd) = -1)
            return false
        WinGetPos &x, &y, &w, &h, hwnd
        if (w = 0 || h = 0)
            return false
        return ((y + h // 2) < 0)
    }
    return false
}

ReconcileWindow(hwnd) {
    global hVDA, CurrentTopWorkspace, TopWorkspaces
    if (!hVDA || !hwnd)
        return
    if IsTopWindow(hwnd) {
        try DllCall("VirtualDesktopAccessor\PinWindow", "Ptr", hwnd)
        if !TopWorkspaces.Has(hwnd)
            TopWorkspaces[hwnd] := CurrentTopWorkspace
    } else {
        try DllCall("VirtualDesktopAccessor\UnPinWindow", "Ptr", hwnd)
        if TopWorkspaces.Has(hwnd)
            TopWorkspaces.Delete(hwnd)
    }
}

; ──────────────────────────────────────────────
;  WORKSPACE FUNCTIONS
; ──────────────────────────────────────────────

GoToDesktop(n) {
    global hVDA
    if (!hVDA) {
        return
    }

    UpdateTopMonitorWindows()

    count := DllCall("VirtualDesktopAccessor\GetDesktopCount", "Int")
    if (n > count) {
        loop (n - count) {
            try DllCall("VirtualDesktopAccessor\CreateDesktop")
        }
    }
    DllCall("VirtualDesktopAccessor\GoToDesktopNumber", "Int", n - 1)
}

SwitchTopWorkspace(targetWksp) {
    global CurrentTopWorkspace, TopWorkspaces

    UpdateTopMonitorWindows()
    DetectHiddenWindows true

    for hwnd, wksp in TopWorkspaces.Clone() {
        if !WinExist("ahk_id " hwnd) {
            TopWorkspaces.Delete(hwnd)
            continue
        }
        if (wksp = targetWksp) {
            try WinShow "ahk_id " hwnd
        } else {
            try WinHide "ahk_id " hwnd
        }
    }

    CurrentTopWorkspace := targetWksp
    ShowOsd("TOP  ws " targetWksp)
}

MoveToTopWorkspace(n) {
    global hVDA, TopWorkspaces

    activeHwnd := WinGetID("A")
    if !activeHwnd
        return

    if (WinGetMinMax(activeHwnd) != 0)
        WinRestore activeHwnd

    if !IsTopWindow(activeHwnd) {
        if !FillTopMonitor(activeHwnd) {
            ShowOsd("No monitor above the primary")
            return
        }
    }

    if (hVDA)
        try DllCall("VirtualDesktopAccessor\PinWindow", "Ptr", activeHwnd)

    TopWorkspaces[activeHwnd] := n
    SwitchTopWorkspace(n)
    try WinActivate activeHwnd
}

SendWindowToBottom() {
    global hVDA, TopWorkspaces

    activeHwnd := WinGetID("A")
    if !activeHwnd
        return

    if (WinGetMinMax(activeHwnd) != 0)
        WinRestore activeHwnd

    if IsTopWindow(activeHwnd)
        FillPrimaryMonitor(activeHwnd)

    if (hVDA)
        try DllCall("VirtualDesktopAccessor\UnPinWindow", "Ptr", activeHwnd)
    if TopWorkspaces.Has(activeHwnd)
        TopWorkspaces.Delete(activeHwnd)

    try WinActivate activeHwnd
}

TileTopWorkspace() {
    global CurrentTopWorkspace, TopWorkspaces

    idx := GetTopMonitorIndex()
    if !idx {
        ShowOsd("No monitor above the primary")
        return
    }
    MonitorGetWorkArea idx, &WL, &WT, &WR, &WB

    wins := []
    for hwnd, wksp in TopWorkspaces {
        if (wksp != CurrentTopWorkspace)
            continue
        if !WinExist("ahk_id " hwnd)
            continue
        if (WinGetMinMax(hwnd) != 0)
            try WinRestore hwnd
        wins.Push(hwnd)
    }

    n := wins.Length
    if (n = 0) {
        ShowOsd("ws " CurrentTopWorkspace " is empty")
        return
    }

    if (n = 1) {
        MoveWindowSafe(wins[1], WL, WT, WR - WL, WB - WT)
        ShowOsd("tiled  1 window")
        return
    }

    masterW := (WR - WL) // 2
    stackW  := (WR - WL) - masterW
    stackH  := (WB - WT) // (n - 1)

    MoveWindowSafe(wins[1], WL, WT, masterW, WB - WT)
    Loop n - 1 {
        MoveWindowSafe(wins[A_Index + 1], WL + masterW, WT + (A_Index - 1) * stackH, stackW, stackH)
    }
    ShowOsd("tiled  " n " windows")
}

UpdateTopMonitorWindows() {
    global hVDA, CurrentTopWorkspace, TopWorkspaces
    if (!hVDA) {
        return
    }

    DetectHiddenWindows false

    for hwnd in WinGetList() {
        try {
            if (WinGetTitle(hwnd) = "")
                continue

            class := WinGetClass(hwnd)
            if (class = "WorkerW" || class = "Progman" || class = "Shell_TrayWnd" || class = "Shell_SecondaryTrayWnd")
                continue

            if IsTopWindow(hwnd) {
                try DllCall("VirtualDesktopAccessor\PinWindow", "Ptr", hwnd)
                if !TopWorkspaces.Has(hwnd)
                    TopWorkspaces[hwnd] := CurrentTopWorkspace
            } else if TopWorkspaces.Has(hwnd) {
                try DllCall("VirtualDesktopAccessor\UnPinWindow", "Ptr", hwnd)
                TopWorkspaces.Delete(hwnd)
            }
        }
    }
}

MoveAndSwitch(n) {
    global hVDA, TopWorkspaces
    if (!hVDA) {
        return
    }

    activeHwnd := WinGetID("A")
    if !activeHwnd
        return

    try DllCall("VirtualDesktopAccessor\UnPinWindow", "Ptr", activeHwnd)
    if TopWorkspaces.Has(activeHwnd)
        TopWorkspaces.Delete(activeHwnd)

    if IsTopWindow(activeHwnd) {
        if (WinGetMinMax(activeHwnd) != 0)
            WinRestore activeHwnd
        FillPrimaryMonitor(activeHwnd)
    }

    DllCall("VirtualDesktopAccessor\MoveWindowToDesktopNumber", "Ptr", activeHwnd, "Int", n - 1)
    GoToDesktop(n)
}

CenterWindowOnCurrentMonitor() {
    activeHwnd := WinGetID("A")
    if !activeHwnd {
        return
    }

    if (WinGetMinMax(activeHwnd) == 1) {
        WinRestore activeHwnd
    }

    WinGetPos &x, &y, &w, &h, activeHwnd
    cx := x + (w / 2)
    cy := y + (h / 2)

    targetMon := 1
    Loop MonitorGetCount() {
        MonitorGet A_Index, &L, &T, &R, &B
        if (cx >= L && cx <= R && cy >= T && cy <= B) {
            targetMon := A_Index
            break
        }
    }

    MonitorGetWorkArea targetMon, &WL, &WT, &WR, &WB

    newW := Min(1920, WR - WL)
    newH := Min(1080, WB - WT)
    newX := WL + ((WR - WL) - newW) // 2
    newY := WT + ((WB - WT) - newH) // 2

    MoveWindowSafe(activeHwnd, newX, newY, newW, newH)
}

; ──────────────────────────────────────────────
;  TINY OSD
; ──────────────────────────────────────────────

ShowOsd(text) {
    ToolTip text
    SetTimer () => ToolTip(), -900
}