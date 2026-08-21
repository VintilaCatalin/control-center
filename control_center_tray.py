#!/usr/bin/env python
"""
control_center_tray.py - a tray icon for Control Center itself.

Deliberately separate from system/tray.py (the personal Home
Assistant/OpenRGB/Chroma lighting tray) - that one is tooling specific to
this machine's own hardware, this one is the product's own launcher. A
friend running Control Center on their own PC gets this tray icon, never
lighting controls for hardware they don't have.

Usage:
    pythonw control_center_tray.py   # run it (put a shortcut in shell:startup)

Requires: python -m pip install pystray
"""

import os
import subprocess
import sys
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import pystray
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
LAUNCHER = HERE / "control_center.py"
ICON_SIZE = 64
ACCENT = (58, 164, 217)  # a fixed product colour - no live-state to follow here


def pythonw():
    candidate = Path(sys.executable).with_name("pythonw.exe")
    return str(candidate) if candidate.exists() else sys.executable


def run(*args, hidden=True):
    """Detached, so the tray stays responsive while the backend starts."""
    if not LAUNCHER.is_file():
        return
    exe = pythonw() if hidden else sys.executable
    subprocess.Popen([exe, str(LAUNCHER), *args],
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))


def make_icon():
    """A filled rounded square in the product accent, dark ring so it stays
    visible against both light and dark taskbars - same recipe system/tray.py
    uses, just a fixed colour instead of one that tracks light state."""
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = 6
    draw.rounded_rectangle([pad, pad, ICON_SIZE - pad, ICON_SIZE - pad],
                           radius=16, fill=ACCENT + (255,),
                           outline=(16, 18, 22, 200), width=3)
    return img


def build_menu():
    item = pystray.MenuItem
    sep = pystray.Menu.SEPARATOR

    return pystray.Menu(
        item("Open Control Center", lambda: run(), default=True),
        item("Open (windowed)", lambda: run("--windowed")),
        sep,
        item("Stop Control Center", lambda: run("--stop")),
        item("Restart Control Center", lambda: run("--restart")),
        sep,
        item("Quit tray", lambda icon, _item: icon.stop()),
    )


def main():
    icon = pystray.Icon("control-center", make_icon(), "Control Center", build_menu())
    icon.run()


if __name__ == "__main__":
    main()
