#!/usr/bin/env python
"""
wallpaper.py - headless wallpaper helpers used by Control Center (and
optionally by external personal automation).

The thumbnail-grid window this used to open is retired - Control Center's
Scene view (YoursLibrary) replaced it, browsing/applying/favouriting from
the same wallpaper_dir setting. What's left here are the two actions that
never needed a window: applying a specific image (Control Center's backend
calls this) and picking one at random from the configured folder.

Usage:
    wallpaper.py --set PATH   # no window - apply this image
    wallpaper.py --random     # no window - pick one at random from wallpaper_dir
"""

import argparse
import json
import os
import sys
import random
import configparser
from pathlib import Path

# pythonw has no stdout, and wallpaper_span prints - that would kill the whole app.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import wallpaper_span
import ha_lights

CONFIG_DIR = Path.home() / ".config" / "control-center"
CONFIG_FILE = CONFIG_DIR / "config.ini"
STORE_FILE = CONFIG_DIR / "panel-store.json"
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def wallpaper_dir():
    """The user's configured wallpaper folder. Settings edited in Control
    Center's UI live in panel-store.json, not config.ini - check that
    first, same precedence backend/core.py's load_config() uses, then fall
    back to a hand-edited config.ini. No hardcoded personal default."""
    try:
        settings = json.loads(STORE_FILE.read_text(encoding="utf-8")).get("settings") or {}
        value = str(settings.get("wallpaper_dir") or "").strip()
        if value:
            return Path(value)
    except Exception:
        pass
    try:
        if CONFIG_FILE.exists():
            cfg = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
            cfg.read(CONFIG_FILE)
            if cfg.has_section("panel"):
                value = cfg["panel"].get("wallpaper_dir", "").strip()
                if value:
                    return Path(value)
    except Exception:
        pass
    return None


def wallpapers():
    folder = wallpaper_dir()
    if not folder or not folder.is_dir():
        return []
    return sorted((p for p in folder.iterdir() if p.suffix.lower() in EXTS),
                  key=lambda p: p.stat().st_mtime, reverse=True)


def set_wallpaper(path):
    # Light-sync isn't done here - both callers below are headless
    # (Control Center's backend for --set, external automation for
    # --random), and Control Center's own UI already triggers its own
    # light-sync action (matchLightsToWallpaper) as a separate explicit
    # step after applying, rather than this script deciding for it.
    out, _size = wallpaper_span.build(str(path), wallpaper_span.next_out_path())
    wallpaper_span.apply(out)
    ha_lights.save_state(last_source=str(path))


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
    # configured wallpaper_dir this script still reads. --set/--random
    # above are still real and still used (Control Center's backend calls
    # --set).
    print("wallpaper.py's grid window has been retired - use Control Center's Scene view instead "
          "(python control_center.py --view scene), or pass --set PATH / --random for a headless action.")


if __name__ == "__main__":
    main()
