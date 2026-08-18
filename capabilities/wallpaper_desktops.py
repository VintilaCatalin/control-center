#!/usr/bin/env python
"""
wallpaper_desktops.py - Windows virtual-desktop wallpaper recovery.

The browse/search/apply Wallhaven window this used to open is retired -
Control Center's Scene view (WallhavenLibrary) replaced it, with its own
independent search/download/apply implementation
(backend/collectors/wallpapers.py's wallhaven_search()/download_wallpaper())
rather than calling back into this file - it never needed the Wallhaven
class here, only this file's own registry-recovery action.

What's left is fix_desktops(): Windows 11 sometimes leaves a stale
per-virtual-desktop wallpaper registered after a monitor/resolution change,
and this is the fix - force-flush the registry values and restart
Explorer. Control Center's own "Fix desktop wallpapers..." action (Scene's
overflow menu) still calls this exact function the same way it always did,
via `wallpaper_desktops.py --fix-desktops` as a detached subprocess.

Usage:
    wallpaper_desktops.py --fix-desktops
"""

import os
import subprocess
import sys
import winreg

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")


def fix_desktops():
    """Force flush Windows per-desktop wallpaper cache."""
    try:
        vd_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops\Desktops"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, vd_path, 0, winreg.KEY_READ) as hkey:
            num_subkeys = winreg.QueryInfoKey(hkey)[0]
            for i in range(num_subkeys):
                subkey_name = winreg.EnumKey(hkey, i)
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, rf"{vd_path}\{subkey_name}", 0, winreg.KEY_ALL_ACCESS) as subkey:
                    try:
                        winreg.DeleteValue(subkey, "Wallpaper")
                    except FileNotFoundError:
                        pass
    except FileNotFoundError:
        pass
    subprocess.run(["taskkill", "/f", "/im", "explorer.exe"], capture_output=True)
    subprocess.Popen(["explorer.exe"])


if __name__ == "__main__":
    if "--fix-desktops" in sys.argv:
        fix_desktops()
    else:
        print("wallpaper_desktops.py's browser window has been retired - use Control Center's Scene view "
              "instead (python control_center.py --view scene), or pass --fix-desktops for the "
              "registry-recovery action.")
    sys.exit(0)
