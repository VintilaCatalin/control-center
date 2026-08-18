#!/usr/bin/env python
"""
control_center.py - launch Control Center.

Starts the backend if it isn't already running, then opens the dashboard as
a borderless Chromium app window positioned on your secondary display. No
tabs, no address bar, no browser chrome - it just looks like a display.
Also makes sure the Chroma keyboard daemon (system/chroma_paint.py
--daemon) is running - see start_chroma_daemon() - so there's nothing left
to separately keep in shell:startup.

    control_center.py                  # backend + keyboard daemon + window on the secondary monitor
    control_center.py --monitor 0      # force a specific monitor
    control_center.py --windowed       # normal window, handy while redesigning
    control_center.py --server-only    # backend + keyboard daemon only, no window
    control_center.py --stop           # close the window and stop the backend

The browser runs on its own profile directory, so this never disturbs your
main Brave session and app mode always behaves.
"""

import argparse
import ctypes
import os
import socket
import subprocess
import sys
import time
from ctypes import wintypes
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE / "backend"
SERVER = BACKEND_DIR / "server.py"
SYSTEM_DIR = HERE / "system"
PROFILE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "lightsync" / "panel-profile"
PORT = 8770

BROWSERS = [
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
    r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


# ──────────────────────────────────────────────
#  MONITORS
# ──────────────────────────────────────────────

class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


class MONITORINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", RECT),
                ("rcWork", RECT), ("dwFlags", ctypes.c_ulong)]


MonitorEnumProc = ctypes.WINFUNCTYPE(
    ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p,
    ctypes.POINTER(RECT), ctypes.c_void_p)


def monitors():
    # Without this the coordinates below are DPI-virtualised and the window
    # lands in the wrong place on any scaled display.
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass

    found = []

    def callback(hmon, _hdc, _lprect, _lparam):
        info = MONITORINFO()
        info.cbSize = ctypes.sizeof(MONITORINFO)
        ctypes.windll.user32.GetMonitorInfoW(hmon, ctypes.byref(info))
        r = info.rcMonitor
        found.append({
            "x": r.left, "y": r.top,
            "w": r.right - r.left, "h": r.bottom - r.top,
            "primary": bool(info.dwFlags & 1),
        })
        return True

    ctypes.windll.user32.EnumDisplayMonitors(None, None,
                                             MonitorEnumProc(callback), 0)
    return found


def pick_monitor(index=None):
    screens = monitors()
    if not screens:
        return None
    if index is not None and 0 <= index < len(screens):
        return screens[index]
    # Default to the first non-primary display - on this desk that's the one
    # above the ultrawide, which is the whole point of the panel.
    for screen in screens:
        if not screen["primary"]:
            return screen
    return screens[0]


# ──────────────────────────────────────────────
#  BACKEND
# ──────────────────────────────────────────────

def pythonw():
    candidate = Path(sys.executable).with_name("pythonw.exe")
    return str(candidate) if candidate.exists() else sys.executable


def server_up(port=PORT):
    with socket.socket() as probe:
        probe.settimeout(0.4)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def start_server(port=PORT):
    if server_up(port):
        return True
    if not SERVER.is_file():
        print(f"missing {SERVER}")
        return False

    subprocess.Popen([pythonw(), str(SERVER), "--port", str(port)],
                     cwd=str(BACKEND_DIR),
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))

    for _ in range(40):
        if server_up(port):
            return True
        time.sleep(0.25)
    print("backend did not come up - run it directly to see why:")
    print(f"  python \"{SERVER}\"")
    return False


# ──────────────────────────────────────────────
#  BACKGROUND HELPERS
#
# Of everything in system/, only the Chroma keyboard daemon is a genuine
# "must be running in the background" service - Razer's Chroma SDK hands
# control back to Synapse if nothing holds its session open for 15s (see
# chroma_paint.py's own docstring). Everything else there (lights.py,
# wallpicker.py, wallhaven.py, rgb_paint_win.py, spanwall.py) is one-shot:
# invoked per-action by the backend or a hotkey, does its thing, exits -
# nothing to manage, so nothing else gets auto-started here. This used to
# be a separate manual shell:startup shortcut for chroma_paint.py; folding
# it in here means there's exactly one thing to keep running (Control
# Center itself) instead of two independent startup entries that can
# silently drift out of sync (which is exactly what broke last time - the
# shortcut ran the script bare, without --daemon).
# ──────────────────────────────────────────────

CHROMA_SCRIPT = SYSTEM_DIR / "chroma_paint.py"
# Same path chroma_paint.py's own PID_FILE constant resolves to - not
# imported from there directly (that module also pulls in requests/PIL/
# rgb_paint_win, real dependencies this lightweight launcher shouldn't
# need just to ask "is it alive"), but it must stay in lockstep with it -
# see chroma_paint.py's own daemon_alive()/run_daemon() if this ever moves.
CHROMA_PID_FILE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "lightsync" / "chroma.pid"


def chroma_alive():
    """Mirrors chroma_paint.py's own daemon_alive() exactly: a PID file plus
    a liveness probe, not just "the file exists" - a stale PID left behind
    by a crashed or killed daemon must read as not-alive, not falsely block
    a real restart."""
    try:
        pid = int(CHROMA_PID_FILE.read_text().strip())
    except Exception:
        return None
    try:
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return pid
    except Exception:
        pass
    return None


def start_chroma_daemon():
    """Best-effort: the keyboard daemon is a nice-to-have, not something
    Control Center's own UI depends on, so any failure here is logged and
    swallowed - it must never take the backend/window down with it."""
    if not CHROMA_SCRIPT.is_file():
        print(f"system/chroma_paint.py not found at {CHROMA_SCRIPT} - skipping the keyboard daemon.")
        return
    if chroma_alive():
        return  # already running - chroma_paint.py's own run_daemon() would refuse a second one anyway

    try:
        subprocess.Popen([pythonw(), str(CHROMA_SCRIPT), "--daemon"],
                         cwd=str(SYSTEM_DIR),
                         creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
    except Exception as e:
        print(f"could not launch the Chroma keyboard daemon: {e}")
        return

    for _ in range(10):
        time.sleep(0.3)
        if chroma_alive():
            print("Chroma keyboard daemon started.")
            return
    print("Chroma keyboard daemon did not come up within 3s - Razer Synapse "
          "may not be running, or the Chroma SDK service isn't reachable. "
          "Keyboard colour sync won't work until it does; nothing else is affected.")


def find_browser():
    for path in BROWSERS:
        if Path(path).exists():
            return path
    return None


# The Chromium --app= window's OS title matches the page's own <title>
# (frontend/index.html says "Control Center"), so a plain title lookup is
# enough to tell "already open" from "needs launching" - no window-class
# guessing, no process-list scanning by command line.
WINDOW_TITLE = "Control Center"


def find_window():
    hwnd = ctypes.windll.user32.FindWindowW(None, WINDOW_TITLE)
    return hwnd or None


def focus_window(hwnd):
    """Bring an already-open Control Center window to the front instead of
    opening a second one. Doesn't force-navigate it to a specific view if
    one's requested (see --view) - reusing a window a user is already
    looking at and yanking it to a different screen would be more
    disruptive than just surfacing what's already there; --view only
    takes effect on a fresh launch."""
    SW_RESTORE = 9
    ctypes.windll.user32.ShowWindow(hwnd, SW_RESTORE)
    ctypes.windll.user32.SetForegroundWindow(hwnd)


def open_window(monitor, windowed=False, port=PORT, fullscreen=False, view=None):
    existing = find_window()
    if existing:
        focus_window(existing)
        return True

    url = f"http://127.0.0.1:{port}/" + (f"?view={view}" if view else "")

    browser = find_browser()
    if not browser:
        # No borderless app-mode window without a known Chromium install,
        # but the backend is already up - falling back to whatever the
        # user's default browser is means a second Windows PC without
        # Brave/Chrome/Edge at one of the BROWSERS paths still gets a
        # working app, just in an ordinary browser tab instead of a
        # dedicated window.
        print("No Chromium browser found at the usual install paths - opening in your default browser instead.")
        print("(Edit BROWSERS at the top of this file to add a borderless app window for it.)")
        import webbrowser
        webbrowser.open(url)
        return True

    PROFILE.mkdir(parents=True, exist_ok=True)
    args = [
        browser,
        f"--app={url}",
        # A dedicated profile keeps this out of your main session; without it
        # a running Brave just opens a tab and ignores the window flags.
        f"--user-data-dir={PROFILE}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate,TranslateUI",
    ]

    if monitor and not windowed:
        # Sized to fill the monitor but deliberately NOT fullscreen: Hue Sync
        # (and anything else watching for fullscreen apps) treats a fullscreen
        # window as media starting and begins syncing the lights. An app
        # window at monitor size looks the same and trips nothing.
        args += [
            f"--window-position={monitor['x']},{monitor['y']}",
            f"--window-size={monitor['w']},{monitor['h']}",
        ]
        if fullscreen:
            args.append("--start-fullscreen")
    elif monitor:
        args += [f"--window-position={monitor['x'] + 60},{monitor['y'] + 60}",
                 "--window-size=1600,1000"]

    subprocess.Popen(args, creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
    return True


def stop_server(port=PORT):
    """Kill whatever is listening on the port.

    wmic used to do this by command line, but Windows 11 removed it - and it
    failed silently, so a stale backend kept serving old data while every new
    version of server.py sat unused on disk. Match by port instead.
    """
    script = (f"Get-NetTCPConnection -LocalPort {port} -State Listen "
              f"-ErrorAction SilentlyContinue | "
              f"ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force }}")
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive",
                    "-Command", script], capture_output=True,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    for _ in range(20):
        if not server_up(port):
            return True
        time.sleep(0.2)
    return False


def stop(port=PORT):
    killed = stop_server(port)
    # The panel window runs on its own profile directory, so this only ever
    # closes the panel and never your main browser.
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                    "Get-CimInstance Win32_Process | Where-Object "
                    "{ $_.CommandLine -like '*panel-profile*' } | "
                    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"],
                   capture_output=True,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    print("backend stopped" if killed else "backend still up - check port " + str(port))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--monitor", type=int, help="monitor index (see --list)")
    ap.add_argument("--list", action="store_true", help="show monitors and exit")
    ap.add_argument("--windowed", action="store_true",
                    help="small floating window, handy while redesigning")
    ap.add_argument("--fullscreen", action="store_true",
                    help="true fullscreen. Off by default because Hue Sync "
                         "starts syncing when it sees a fullscreen app")
    ap.add_argument("--view", help="open straight to this app (e.g. scene) instead of "
                                    "whatever 'Open on launch' has saved - see App.tsx's "
                                    "?view= query-param handling. No effect if a Control "
                                    "Center window is already open (see focus_window).")
    ap.add_argument("--server-only", action="store_true")
    ap.add_argument("--stop", action="store_true")
    ap.add_argument("--restart", action="store_true",
                    help="kill the running backend first, then start fresh")
    ap.add_argument("--diag", action="store_true",
                    help="run server.py --diag (it lives there, not here)")
    ap.add_argument("--port", type=int, default=PORT)
    args = ap.parse_args()

    if args.list:
        for i, screen in enumerate(monitors()):
            tag = " [primary]" if screen["primary"] else ""
            print(f"[{i}]{tag} {screen['w']}x{screen['h']} "
                  f"at ({screen['x']}, {screen['y']})")
        return

    if args.diag:
        # --diag belongs to the backend; forward it rather than erroring out.
        return subprocess.run([sys.executable, str(SERVER), "--diag"],
                              cwd=str(BACKEND_DIR)).returncode

    if args.stop:
        return stop(args.port)

    if args.restart:
        stop_server(args.port)

    if not start_server(args.port):
        return

    start_chroma_daemon()

    if args.server_only:
        print(f"backend running on http://127.0.0.1:{args.port}")
        return

    open_window(pick_monitor(args.monitor), args.windowed, args.port,
                args.fullscreen, args.view)


if __name__ == "__main__":
    main()
