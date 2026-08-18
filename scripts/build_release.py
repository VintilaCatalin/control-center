#!/usr/bin/env python
"""build_release.py - assemble the portable v0.1 package.

Builds the React frontend (needs Node, but only on THIS machine - the
resulting release folder needs nothing but Python + a Chromium browser to
run), then copies exactly what control_center.py/server.py need at runtime
into release/ControlCenter/: the launcher(s), the backend package, the
built frontend, and the generic capability scripts server.py
subprocess-invokes by relative path (capabilities/ha_lights.py etc.) - not
a git clone, not node_modules, not source .tsx, not the legacy/ reference
UI or any personal Windows tooling (that lives in a separate sibling repo,
never copied here).

    python scripts/build_release.py

The output folder is self-contained: copy it to another Windows PC,
`pip install -r requirements.txt`, `python control_center.py`.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / "release" / "ControlCenter"

# Root-level files the product runtime actually needs alongside
# control_center.py. control_center_tray.py is the product's own tray
# launcher; VirtualDesktopAccessor.dll is the third-party binary
# backend/collectors/desktops.py loads directly.
ROOT_FILES = ["control_center.py", "control_center_tray.py", "VirtualDesktopAccessor.dll"]


def run_frontend_build():
    print("-> building React frontend (frontend/)...")
    result = subprocess.run(["npm", "run", "build"], cwd=str(ROOT / "frontend"), shell=True)
    if result.returncode != 0:
        print("Frontend build failed - fix that before packaging.")
        sys.exit(1)


def copy_tree(src: Path, dst: Path, ignore=None):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore)


def main():
    dist = ROOT / "frontend" / "dist"
    if not dist.is_dir():
        run_frontend_build()
    if not dist.is_dir():
        print(f"Still no {dist} after building - aborting.")
        sys.exit(1)

    if RELEASE.exists():
        shutil.rmtree(RELEASE)
    RELEASE.mkdir(parents=True)

    print("-> copying backend package (backend/)...")
    copy_tree(ROOT / "backend", RELEASE / "backend", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    print("-> copying built frontend (frontend/dist/)...")
    copy_tree(dist, RELEASE / "frontend" / "dist")

    print("-> copying generic capability scripts (capabilities/)...")
    copy_tree(ROOT / "capabilities", RELEASE / "capabilities", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    print("-> copying root launcher(s) and runtime binary...")
    for name in ROOT_FILES:
        src = ROOT / name
        if src.is_file():
            shutil.copy2(src, RELEASE / name)
        else:
            print(f"   (skipped, not found: {name})")

    print("-> copying requirements.txt and README...")
    shutil.copy2(ROOT / "requirements.txt", RELEASE / "requirements.txt")
    shutil.copy2(ROOT / "README.md", RELEASE / "README.md")

    print(f"\nDone: {RELEASE}")
    print("Zip that folder and hand it to another Windows PC. On that PC:")
    print("  pip install -r requirements.txt")
    print("  python control_center.py")


if __name__ == "__main__":
    main()
