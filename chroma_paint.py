#!/usr/bin/env python
"""
chroma_paint.py - paint the wallpaper across the Razer keyboard.

OpenRGB can't see the BlackWidow V4 75% on Windows (its Razer support there
goes through a stale openrazer-win32 wrapper), so this takes the official
route instead: Razer's Chroma SDK REST API, which any app can drive and
which supports a full 6x22 per-key grid.

IMPORTANT - this has to run as a daemon. The Chroma SDK hands lighting
control back to Synapse if it stops hearing from the controlling app for
15 seconds, so a script that sets a colour and exits gives you 15 seconds
of correct keyboard and then Synapse takes it back. The daemon holds the
session open; everything else just writes a request file for it to read.

Usage:
    chroma_paint.py --daemon          # run this at login
    chroma_paint.py --image path.png  # tell the daemon to paint an image
    chroma_paint.py --color 3ba4d9    # tell the daemon to go flat
    chroma_paint.py --off             # tell the daemon to go dark
    chroma_paint.py --status          # is the SDK up, is the daemon alive
    chroma_paint.py --once --image x  # no daemon: hold 20s then release

Requires: Razer Synapse installed with the Razer Chroma SDK Service running.
Shares %USERPROFILE%\\.config\\lightsync\\config.ini with the other scripts.
"""

import argparse
import json
import os
import signal
import sys
import time
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests
from PIL import Image

import rgb_paint_win as painter   # shared config, colour curve, sampling

CONFIG_DIR = Path.home() / ".config" / "lightsync"
REQUEST_FILE = CONFIG_DIR / "chroma.json"
PID_FILE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "lightsync" / "chroma.pid"

INIT_URL = "http://localhost:54235/razer/chromasdk"

# Every Razer keyboard is addressed as the same abstract 6x22 matrix
# regardless of its physical layout. Keys the 75% doesn't have are simply
# ignored by the SDK, so no per-model mapping is needed.
ROWS, COLS = 6, 22

HEARTBEAT = 3.0      # SDK times out at 15s; this is comfortably inside it
POLL = 0.5           # how often to check for a new request


def app_info():
    return {
        "title": "lightsync",
        "description": "Wallpaper-driven lighting",
        "author": {"name": "vinti", "contact": "localhost"},
        "device_supported": ["keyboard"],
        "category": "application",
    }


def to_bgr(rgb):
    """Chroma takes BGR integers, not RGB. Get this backwards and you ask
    for orange and receive blue."""
    r, g, b = (int(max(0, min(255, c))) for c in rgb)
    return (b << 16) | (g << 8) | r


# ──────────────────────────────────────────────
#  RENDERING
# ──────────────────────────────────────────────

def grid_from_image(cfg, path):
    """Sample the wallpaper across the key matrix, through the same
    saturation curve the case LEDs use so the keyboard matches them."""
    img = painter.load_source(cfg, path)
    grid = []
    for row in range(ROWS):
        v = row / max(1, ROWS - 1)
        line = []
        for col in range(COLS):
            u = col / max(1, COLS - 1)
            line.append(to_bgr(painter.shape(cfg, painter.sample(img, u, v))))
        grid.append(line)
    return grid


def grid_flat(cfg, rgb):
    value = to_bgr(painter.shape(cfg, rgb))
    return [[value] * COLS for _ in range(ROWS)]


def grid_off():
    return [[0] * COLS for _ in range(ROWS)]


def render(cfg, request):
    mode = request.get("mode", "off")
    if mode == "off":
        return grid_off()

    brightness = request.get("brightness", 100)
    cfg["paint_brightness"] = str(max(1, min(100, int(brightness))))

    if mode == "color":
        h = str(request.get("hex", "ffffff")).lstrip("#")
        rgb = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
        return grid_flat(cfg, rgb)

    path = request.get("path")
    if not path or not Path(path).is_file():
        return grid_off()
    return grid_from_image(cfg, Path(path))


# ──────────────────────────────────────────────
#  SESSION
# ──────────────────────────────────────────────

class Session:
    def __init__(self):
        self.uri = None

    def open(self):
        try:
            r = requests.post(INIT_URL, json=app_info(), timeout=5)
            data = r.json()
        except Exception as e:
            raise RuntimeError(f"Chroma SDK not reachable: {e}")
        self.uri = data.get("uri")
        if not self.uri:
            raise RuntimeError(f"Chroma SDK refused the session: {data}")
        # The SDK needs a moment before it accepts effects on a new session.
        time.sleep(1.0)
        return self.uri

    def heartbeat(self):
        requests.put(f"{self.uri}/heartbeat", timeout=3)

    def keyboard(self, grid):
        requests.put(f"{self.uri}/keyboard", timeout=5,
                     json={"effect": "CHROMA_CUSTOM", "param": grid})

    def close(self):
        if not self.uri:
            return
        try:
            requests.delete(self.uri, timeout=3)
        except Exception:
            pass
        self.uri = None


# ──────────────────────────────────────────────
#  REQUESTS
# ──────────────────────────────────────────────

def write_request(**kw):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    kw["ts"] = time.time()
    REQUEST_FILE.write_text(json.dumps(kw), encoding="utf-8")


def read_request():
    try:
        return json.loads(REQUEST_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"mode": "off"}


def daemon_alive():
    try:
        pid = int(PID_FILE.read_text().strip())
    except Exception:
        return None
    try:
        import ctypes
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if handle:
            ctypes.windll.kernel32.CloseHandle(handle)
            return pid
    except Exception:
        pass
    return None


# ──────────────────────────────────────────────
#  DAEMON
# ──────────────────────────────────────────────

def run_daemon(cfg):
    if daemon_alive():
        sys.exit("a chroma daemon is already running")

    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))

    stopping = {"flag": False}
    signal.signal(signal.SIGTERM, lambda *_: stopping.update(flag=True))
    signal.signal(signal.SIGINT, lambda *_: stopping.update(flag=True))

    session = Session()
    session.open()
    print(f"session: {session.uri}")

    last_seen = None
    last_beat = 0.0

    try:
        while not stopping["flag"]:
            try:
                stamp = REQUEST_FILE.stat().st_mtime if REQUEST_FILE.exists() else 0
                if stamp != last_seen:
                    last_seen = stamp
                    request = read_request()
                    session.keyboard(render(cfg, request))
                    print(f"painted: {request.get('mode')}")

                if time.monotonic() - last_beat >= HEARTBEAT:
                    session.heartbeat()
                    last_beat = time.monotonic()

            except requests.RequestException:
                # Synapse restarted, or the session expired while we were
                # asleep. Rebuild it and repaint rather than dying quietly.
                print("session lost, reopening")
                try:
                    session.close()
                    session.open()
                    session.keyboard(render(cfg, read_request()))
                    last_beat = time.monotonic()
                except Exception as e:
                    print(f"could not reopen: {e}")
                    time.sleep(5)

            time.sleep(POLL)
    finally:
        session.close()
        PID_FILE.unlink(missing_ok=True)

    return 0


def status(cfg):
    try:
        r = requests.get(INIT_URL, timeout=4)
        print(f"chroma sdk : up ({r.text.strip()[:80]})")
    except Exception as e:
        print(f"chroma sdk : DOWN - {e}")
        print("             is Razer Synapse running?")

    pid = daemon_alive()
    print(f"daemon     : {'running, pid ' + str(pid) if pid else 'not running'}")
    print(f"request    : {read_request()}")


def run_once(cfg, request, seconds=20):
    """No daemon - hold the session just long enough to look at it."""
    session = Session()
    session.open()
    session.keyboard(render(cfg, request))
    print(f"holding for {seconds}s, then Synapse takes it back")
    end = time.monotonic() + seconds
    try:
        while time.monotonic() < end:
            session.heartbeat()
            time.sleep(HEARTBEAT)
    finally:
        session.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--daemon", action="store_true", help="hold the session open")
    ap.add_argument("--image", help="paint this image across the keys")
    ap.add_argument("--color", "--colour", dest="color", help="flat hex")
    ap.add_argument("--off", action="store_true")
    ap.add_argument("--brightness", type=int, default=100, metavar="PCT")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--once", action="store_true",
                    help="apply without a daemon, hold briefly, release")
    args = ap.parse_args()

    cfg = painter.load_config()

    if args.status:
        return status(cfg)

    if args.daemon:
        return run_daemon(cfg)

    if args.off:
        request = {"mode": "off"}
    elif args.color:
        request = {"mode": "color", "hex": args.color.lstrip("#"),
                   "brightness": args.brightness}
    elif args.image:
        request = {"mode": "image", "path": str(Path(args.image).resolve()),
                   "brightness": args.brightness}
    else:
        source = painter.current_wallpaper()
        if not source:
            sys.exit("no wallpaper found")
        request = {"mode": "image", "path": str(source),
                   "brightness": args.brightness}

    if args.once:
        return run_once(cfg, request)

    write_request(**request)
    if not daemon_alive():
        print("note: no daemon running, so nothing will change.\n"
              "      start it with:  chroma_paint.py --daemon")


if __name__ == "__main__":
    main()
