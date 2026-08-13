#!/usr/bin/env python
"""
panel.py - open the desk panel on the top monitor.

Starts the backend if it isn't already running, then opens the dashboard as
a borderless Chromium app window positioned on your secondary display. No
tabs, no address bar, no browser chrome - it just looks like a display.

    panel.py                  # backend + window on the secondary monitor
    panel.py --monitor 0      # force a specific monitor
    panel.py --windowed       # normal window, handy while redesigning
    panel.py --server-only    # backend only, no window
    panel.py --stop           # close the window and stop the backend

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
PANEL_DIR = HERE / "panel"
SERVER = PANEL_DIR / "server.py"
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

    pyw = Path(sys.executable).with_name("pythonw.exe")
    exe = str(pyw) if pyw.exists() else sys.executable
    subprocess.Popen([exe, str(SERVER), "--port", str(port)],
                     cwd=str(PANEL_DIR),
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))

    for _ in range(40):
        if server_up(port):
            return True
        time.sleep(0.25)
    print("backend did not come up - run it directly to see why:")
    print(f"  python \"{SERVER}\"")
    return False


def find_browser():
    for path in BROWSERS:
        if Path(path).exists():
            return path
    return None


def open_window(monitor, windowed=False, port=PORT, fullscreen=False):
    browser = find_browser()
    if not browser:
        print("No Chromium browser found. Edit BROWSERS at the top of this file.")
        return False

    PROFILE.mkdir(parents=True, exist_ok=True)
    args = [
        browser,
        f"--app=http://127.0.0.1:{port}/",
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
                              cwd=str(PANEL_DIR)).returncode

    if args.stop:
        return stop(args.port)

    if args.restart:
        stop_server(args.port)

    if not start_server(args.port):
        return

    if args.server_only:
        print(f"backend running on http://127.0.0.1:{args.port}")
        return

    open_window(pick_monitor(args.monitor), args.windowed, args.port,
                args.fullscreen)


if __name__ == "__main__":
    main()
