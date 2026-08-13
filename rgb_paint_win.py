#!/usr/bin/env python
"""
rgb_paint_win.py - paint an image across every OpenRGB device, per LED.

The Windows port of rgb_paint.py. Going through the Home Assistant OpenRGB
integration gives you one flat colour per controller, which wastes a Strimer
with 282 addressable LEDs on it. This talks to the OpenRGB SDK directly and
maps each device onto a region of the image instead:

  Strimer      each cable is a 2D patch - strip index across, LED index along
  Uni Hub      eight fan channels become eight vertical slices
  Motherboard  12V header plus both D_LED strips as vertical gradients
  RAM / GPU    horizontal samples across the middle

Usage:
    rgb_paint_win.py                     # paint the current wallpaper
    rgb_paint_win.py --image path.png    # paint a specific image
    rgb_paint_win.py --color 3ba4d9      # flat colour everywhere
    rgb_paint_win.py --preview           # print what it would send
    rgb_paint_win.py --off               # everything black
    rgb_paint_win.py --devices           # list what OpenRGB can see

Requires:  python -m pip install openrgb-python
Shares %USERPROFILE%\\.config\\lightsync\\config.ini with lights.py.
"""

import argparse
import colorsys
import configparser
import json
import os
import re
import sys
import time
import winreg
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

from PIL import Image, ImageFilter

CONFIG_DIR = Path.home() / ".config" / "lightsync"
CONFIG_FILE = CONFIG_DIR / "config.ini"
STATE_FILE = CONFIG_DIR / "state.json"
LOCK_FILE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "lightsync" / "paint.lock"

DEFAULTS = {
    "openrgb_host": "127.0.0.1",
    "openrgb_port": "6742",
    # LEDs need far more saturation than bulbs do - a bare LED at 40%
    # saturation just reads as white.
    "paint_saturation": "3.0",
    "paint_min_saturation": "0.80",
    "paint_saturation_knee": "0.20",   # fade the floor in, don't snap it on
    "paint_gamma": "0.85",
    "paint_brightness": "100",
    "paint_blur": "2.0",               # soften before sampling, kills noise
    "paint_write_delay": "0.06",
    "paint_min_value": "0.14",         # dark regions shouldn't kill a strip
    "openrgb_skip": "",                # regex of device names to leave alone
    "openrgb_mode_overrides": "",      # "razer:Static" style pairs
}


def load_config():
    # Values often carry trailing '# ...' notes; without this they'd be
    # parsed as part of the value and blow up on float().
    cfg = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
    cfg["lightsync"] = DEFAULTS
    if CONFIG_FILE.exists():
        cfg.read(CONFIG_FILE)
    section = cfg["lightsync"]
    for k, v in DEFAULTS.items():
        if k not in section:
            section[k] = v
    return section


def warn(msg):
    print(f"warning: {msg}", file=sys.stderr)


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def hexof(rgb):
    return "#%02x%02x%02x" % tuple(int(c) for c in rgb)


# ──────────────────────────────────────────────
#  SOURCE IMAGE
# ──────────────────────────────────────────────

def current_wallpaper():
    """Whatever lights.py last recorded, else the registry."""
    try:
        src = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_source")
        if src and Path(src).is_file():
            return Path(src)
    except Exception:
        pass
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop")
        path, _ = winreg.QueryValueEx(key, "WallPaper")
        winreg.CloseKey(key)
        if path and Path(path).is_file():
            return Path(path)
    except OSError:
        pass
    return None


def load_source(cfg, path):
    """Small, blurred copy - LEDs can't show detail anyway, and blurring
    stops a single bright pixel from deciding a whole fan."""
    img = Image.open(path).convert("RGB")
    img.thumbnail((320, 320))
    blur = float(cfg["paint_blur"])
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur > 0 else img


def sample(img, u, v):
    x = min(img.width - 1, max(0, int(u * (img.width - 1))))
    y = min(img.height - 1, max(0, int(v * (img.height - 1))))
    return img.getpixel((x, y))


def shape(cfg, rgb):
    h, s, val = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))

    # A bare LED needs far more saturation than the source pixel has, or the
    # whole case reads as white. The floor fades in across the knee so
    # near-grey pixels don't get handed a vivid hue they never had.
    floor = float(cfg["paint_min_saturation"])
    knee = max(0.001, float(cfg["paint_saturation_knee"]))
    ramp = max(0.0, min(1.0, s / knee))
    s = min(1.0, max(floor * ramp, s * float(cfg["paint_saturation"])))

    val = val ** float(cfg["paint_gamma"])
    val = max(float(cfg["paint_min_value"]), val)
    val *= float(cfg["paint_brightness"]) / 100.0

    r, g, b = colorsys.hsv_to_rgb(h, s, max(0.0, min(1.0, val)))
    return (int(r * 255), int(g * 255), int(b * 255))


# ──────────────────────────────────────────────
#  DEVICE MAPPING
# ──────────────────────────────────────────────

def strimer_groups(dev):
    """Group the 12 strips into their two cables, in strip order."""
    groups = {}
    for zi, zone in enumerate(dev.zones):
        m = re.match(r"(.+?)\s+Strip\s+(\d+)$", zone.name)
        if not m:
            groups.setdefault("other", []).append((zi, 0))
            continue
        groups.setdefault(m.group(1), []).append((zi, int(m.group(2))))
    for key in groups:
        groups[key].sort(key=lambda t: t[1])
    return groups


def keyboard_rows(dev):
    """Rebuild the key grid from LED names - the matrix dimensions aren't
    exposed, but the underglow markers delimit rows."""
    rows, current = [], []
    for idx, led in enumerate(dev.leds):
        name = getattr(led, "name", "") or ""
        if name.startswith("Left Underglow"):
            if current:
                rows.append(current)
            current = [idx]
        else:
            current.append(idx)
    if current:
        rows.append(current)
    return [r for r in rows if len(r) > 1]


def plan_device(cfg, dev, img):
    """[(led_index, rgb)] for one device."""
    name = dev.name.lower()
    total = len(dev.leds)
    out = [None] * total

    def put(idx, u, v):
        if 0 <= idx < total:
            out[idx] = shape(cfg, sample(img, u, v))

    # ── Strimer: each cable is a 2D patch ──
    if "strimer" in name:
        groups = strimer_groups(dev)
        keys = sorted(k for k in groups if k != "other")
        # ATX cable takes the left half of the image, GPU cable the right.
        spans = {k: (i / max(1, len(keys)), (i + 1) / max(1, len(keys)))
                 for i, k in enumerate(keys)}

        offsets, base = {}, 0
        for zi, zone in enumerate(dev.zones):
            offsets[zi] = base
            base += len(zone.leds)

        for key, strips in groups.items():
            lo, hi = spans.get(key, (0.0, 1.0))
            for si, (zi, _num) in enumerate(strips):
                u = lo + (hi - lo) * (si / max(1, len(strips) - 1))
                count = len(dev.zones[zi].leds)
                for li in range(count):
                    put(offsets[zi] + li, u, li / max(1, count - 1))
        return out

    # ── Keyboard: image across the key grid ──
    if "razer" in name or "keyboard" in name:
        rows = keyboard_rows(dev)
        if rows:
            for ri, row in enumerate(rows):
                v = ri / max(1, len(rows) - 1)
                for ci, idx in enumerate(row):
                    put(idx, ci / max(1, len(row) - 1), v)
            return out

    # ── Multi-zone linear devices: one vertical slice per zone ──
    zones = getattr(dev, "zones", None) or []
    if len(zones) > 1:
        base = 0
        for zi, zone in enumerate(zones):
            count = len(zone.leds)
            u = zi / max(1, len(zones) - 1)
            for li in range(count):
                put(base + li, u, li / max(1, count - 1) if count > 1 else 0.5)
            base += count
        return out

    # ── Single linear zone: horizontal sweep through the middle ──
    for i in range(total):
        put(i, i / max(1, total - 1), 0.5)
    return out


# ──────────────────────────────────────────────
#  WRITING
# ──────────────────────────────────────────────

def pick_mode(dev, cfg=None):
    modes = {m.name.strip().lower(): m.name for m in dev.modes}

    if cfg:
        for pair in cfg.get("openrgb_mode_overrides", "").split(","):
            if ":" not in pair:
                continue
            needle, wanted = pair.split(":", 1)
            if needle.strip().lower() in dev.name.lower():
                found = modes.get(wanted.strip().lower())
                if found:
                    return found

    for pref in ("direct", "custom", "static"):
        if pref in modes:
            return modes[pref]
    return None


def paint(cfg, img, preview=False, black=False, flat=None, quiet=False):
    try:
        from openrgb import OpenRGBClient
        from openrgb.utils import RGBColor
    except ImportError:
        die("openrgb-python not installed -\n"
            "  python -m pip install openrgb-python")

    try:
        client = OpenRGBClient(cfg["openrgb_host"], int(cfg["openrgb_port"]),
                               name="rgbpaint")
    except Exception as e:
        die(f"OpenRGB server unreachable: {e}\n"
            f"Is OpenRGB running with the SDK server enabled?")

    delay = float(cfg["paint_write_delay"])
    skip_raw = cfg.get("openrgb_skip", "").strip()
    skip = re.compile(skip_raw) if skip_raw else None

    try:
        for idx, dev in enumerate(client.devices):
            if skip and skip.search(dev.name):
                if not quiet:
                    print(f"[{idx}] {dev.name}  -> skipped")
                continue

            if black:
                colours = [(0, 0, 0)] * len(dev.leds)
            elif flat:
                colours = [shape(cfg, flat)] * len(dev.leds)
            else:
                colours = [c or (0, 0, 0) for c in plan_device(cfg, dev, img)]

            mode = pick_mode(dev, cfg)
            if not quiet:
                print(f"[{idx}] {dev.name}  leds={len(colours)}  mode={mode}")

            if preview:
                step = max(1, len(colours) // 12)
                print("     " + "  ".join(hexof(c) for c in colours[::step][:12]))
                continue

            try:
                if mode:
                    dev.set_mode(mode)
                    time.sleep(delay)
                dev.set_colors([RGBColor(*c) for c in colours])
                # Bigger buffers need longer to drain - the Strimer taught
                # us that the hard way.
                time.sleep(delay + len(colours) / 4000.0)
            except Exception as e:
                warn(f"{dev.name}: {e}")
    finally:
        try:
            client.disconnect()
        except Exception:
            pass


def acquire_lock(timeout=8.0):
    """One painter at a time. Changing wallpaper twice quickly used to start
    two runs that interleaved their writes to the same controllers - which
    looks exactly like the hardware glitching between two palettes."""
    import msvcrt
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    handle = open(LOCK_FILE, "w")
    deadline = time.monotonic() + timeout
    while True:
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            return handle
        except OSError:
            if time.monotonic() >= deadline:
                die("another paint is still running (lock held)")
            time.sleep(0.15)


def list_devices(cfg):
    try:
        from openrgb import OpenRGBClient
    except ImportError:
        die("openrgb-python not installed -\n"
            "  python -m pip install openrgb-python")
    try:
        client = OpenRGBClient(cfg["openrgb_host"], int(cfg["openrgb_port"]),
                               name="rgbpaint")
    except Exception as e:
        die(f"OpenRGB server unreachable: {e}")
    for idx, dev in enumerate(client.devices):
        zones = ", ".join(z.name for z in dev.zones)
        print(f"[{idx}] {dev.name}")
        print(f"     leds={len(dev.leds)}  mode={pick_mode(dev, cfg)}")
        print(f"     zones: {zones}")
    client.disconnect()


def main():
    ap = argparse.ArgumentParser(description="Paint an image across OpenRGB devices.")
    ap.add_argument("--image", help="image to paint (default: current wallpaper)")
    ap.add_argument("--color", "--colour", dest="color",
                    help="flat hex colour everywhere instead of an image")
    ap.add_argument("--preview", action="store_true",
                    help="print what would be sent, write nothing")
    ap.add_argument("--off", action="store_true", help="everything black")
    ap.add_argument("--devices", action="store_true", help="list OpenRGB devices")
    ap.add_argument("--brightness", type=int, metavar="PCT")
    args = ap.parse_args()

    cfg = load_config()
    if args.brightness is not None:
        cfg["paint_brightness"] = str(max(1, min(100, args.brightness)))

    if args.devices:
        return list_devices(cfg)

    lock = acquire_lock()          # released when the process exits

    if args.off:
        return paint(cfg, None, preview=args.preview, black=True)

    if args.color:
        h = args.color.lstrip("#")
        rgb = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
        return paint(cfg, None, preview=args.preview, flat=rgb)

    path = Path(os.path.expanduser(args.image)) if args.image else current_wallpaper()
    if not path or not path.is_file():
        die("no image found - pass --image or set a wallpaper")

    print(f"source: {path}\n")
    paint(cfg, load_source(cfg, path), preview=args.preview)


if __name__ == "__main__":
    main()
