#!/usr/bin/env python
"""
tray.py - one tray icon for the whole lighting setup.

Everything already works from keybinds; this just means you don't have to
remember which Ctrl+Shift+letter does what. The icon itself takes on the
current light colour, so it doubles as a status indicator.

Everything is launched as a detached subprocess rather than called inline,
so a slow Govee round trip can never freeze the menu.

Usage:
    pythonw tray.py          # run it (put a shortcut in shell:startup)

Requires: python -m pip install pystray
"""

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pystray
from PIL import Image, ImageDraw

import chroma_paint
import lights

SCRIPTS = Path(__file__).resolve().parent
STATE_FILE = Path.home() / ".config" / "lightsync" / "state.json"

ICON_SIZE = 64


# ──────────────────────────────────────────────
#  LAUNCHING
# ──────────────────────────────────────────────

def pythonw():
    candidate = Path(sys.executable).with_name("pythonw.exe")
    return str(candidate) if candidate.exists() else sys.executable


def run(script, *args, hidden=True):
    """Detached, so the tray stays responsive while lights transition."""
    target = SCRIPTS / script
    if not target.is_file():
        return
    exe = pythonw() if hidden else sys.executable
    subprocess.Popen([exe, str(target), *args],
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))


# ──────────────────────────────────────────────
#  ICON
# ──────────────────────────────────────────────

def current_colour():
    try:
        value = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_colour")
        if value:
            return lights.hex_to_rgb(value)
    except Exception:
        pass
    return (124, 132, 150)


def make_icon(rgb):
    """A filled rounded square in the current colour, with a dark ring so it
    stays visible against both light and dark taskbars."""
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = 6
    draw.rounded_rectangle([pad, pad, ICON_SIZE - pad, ICON_SIZE - pad],
                           radius=16, fill=rgb + (255,),
                           outline=(16, 18, 22, 200), width=3)
    return img


def watch_colour(icon):
    """Repaint the tray icon when the light colour changes, whatever changed
    it - the picker, a keybind, or the wallpaper chooser."""
    last = None
    while True:
        try:
            stamp = STATE_FILE.stat().st_mtime if STATE_FILE.exists() else 0
            if stamp != last:
                last = stamp
                icon.icon = make_icon(current_colour())
        except Exception:
            pass
        time.sleep(2)


# ──────────────────────────────────────────────
#  KEYBOARD DAEMON
# ──────────────────────────────────────────────

def keyboard_running():
    try:
        return chroma_paint.daemon_alive() is not None
    except Exception:
        return False


def toggle_keyboard(_icon, _item):
    pid = None
    try:
        pid = chroma_paint.daemon_alive()
    except Exception:
        pass

    if pid:
        subprocess.run(["taskkill", "/pid", str(pid), "/f"], capture_output=True)
    else:
        run("chroma_paint.py", "--daemon")
        time.sleep(1.5)
        run("chroma_paint.py")          # seed it with the current wallpaper


# ──────────────────────────────────────────────
#  MENU
# ──────────────────────────────────────────────

def build_menu():
    item = pystray.MenuItem
    sep = pystray.Menu.SEPARATOR

    return pystray.Menu(
        item("Desk panel", lambda: run("panel.py"), default=True),
        item("Panel (windowed)", lambda: run("panel.py", "--windowed")),
        sep,
        item("Wallpaper\u2026", lambda: run("wallpicker.py")),
        item("Browse Wallhaven\u2026", lambda: run("wallhaven.py")),
        item("Random wallpaper", lambda: run("wallpicker.py", "--random")),
        sep,
        item("Lights\u2026", lambda: run("lights.py")),
        item("Colourful", lambda: run("lights.py", "--colorful")),
        item("Work white", lambda: run("lights.py", "--white")),
        item("Bias only", lambda: run("lights.py", "--bias")),
        sep,
        item("Game mode", lambda: run("lights.py", "--game")),
        item("Video mode", lambda: run("lights.py", "--video")),
        item("All off", lambda: run("lights.py", "--off")),
        sep,
        item(lambda _i: f"Keyboard: {'on' if keyboard_running() else 'off'}",
             toggle_keyboard, checked=lambda _i: keyboard_running()),
        sep,
        item("Stop panel", lambda: run("panel.py", "--stop")),
        item("Quit tray", lambda icon, _item: icon.stop()),
    )


def main():
    icon = pystray.Icon("lightsync", make_icon(current_colour()),
                        "Lightsync", build_menu())
    threading.Thread(target=watch_colour, args=(icon,), daemon=True).start()
    icon.run()


if __name__ == "__main__":
    main()
