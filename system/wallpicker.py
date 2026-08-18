#!/usr/bin/env python
"""
wallpicker.py - headless wallpaper helpers used by Control Center and
shortcuts.ahk's automation.

The thumbnail-grid window this used to open is retired - Control Center's
Scene view (YoursLibrary) replaced it, browsing/applying/favouriting from
this same WALL_FOLDER. What's left here are the two actions that never
needed a window: applying a specific image (Control Center's backend calls
this) and picking one at random.

Usage:
    wallpicker.py --set PATH   # no window - apply this image
    wallpicker.py --random     # no window - pick one at random
"""

import argparse
import os
import sys
import random
from pathlib import Path

# pythonw has no stdout, and spanwall prints - that would kill the whole app.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import spanwall
import lights

WALL_FOLDER = Path(r"C:\Users\catal\Pictures\Wallpapers\Spans")
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def wallpapers():
    if not WALL_FOLDER.is_dir():
        return []
    return sorted((p for p in WALL_FOLDER.iterdir() if p.suffix.lower() in EXTS),
                  key=lambda p: p.stat().st_mtime, reverse=True)


def set_wallpaper(path):
    # Light-sync isn't done here - both callers below are headless
    # (Control Center's backend for --set, the automation for --random),
    # and Control Center's own UI already triggers its own light-sync
    # action (matchLightsToWallpaper) as a separate explicit step after
    # applying, rather than this script deciding for it.
    out, _size = spanwall.build(str(path), spanwall.next_out_path())
    spanwall.apply(out)
    lights.save_state(last_source=str(path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", action="store_true",
                    help="no window - pick one at random")
    ap.add_argument("--set", metavar="PATH",
                    help="no window - apply this image (used by the panel)")
    args = ap.parse_args()

    if args.set:
        path = Path(args.set)
        if path.is_file():
            set_wallpaper(path)
        return

    if args.random:
        files = wallpapers()
        if files:
            set_wallpaper(random.choice(files))
        return

    # The thumbnail-grid window this used to open when called with no flags
    # is retired - Control Center's Scene view (YoursLibrary) is the real
    # replacement now, browsing/applying/favouriting from the same
    # WALL_FOLDER this script still reads. --set/--random above are still
    # real and still used (Control Center's backend calls --set).
    print("wallpicker.py's grid window has been retired - use Control Center's Scene view instead "
          "(python control_center.py --view scene), or pass --set PATH / --random for a headless action.")


if __name__ == "__main__":
    main()
