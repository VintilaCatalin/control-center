#!/usr/bin/env python
"""
lights.py - swatch picker for Home Assistant, Windows edition.

The Windows counterpart to light_picker.py. Pulls a palette out of the
current wallpaper, shows it as actual swatches, pushes the choice to Home
Assistant. No OpenRGB here - everything on this machine goes through HA.

Usage:
    lights.py                    # the picker window
    lights.py --image path.png   # picker, palette from a specific image
    lights.py --auto [IMAGE]     # no window: dominant colour, boosted
    lights.py --colorful         # no window: palette across every light
    lights.py --color 3ba4d9     # no window: apply a hex directly
    lights.py --white            # work mode: everything white
    lights.py --bias             # everything off except the monitor bars
    lights.py --off              # everything off
    lights.py --video            # everything off (for Hue Sync)
    lights.py --game             # room/PC off, keyboard stays on (for Hue Sync)
    lights.py --entities         # what the groups expand to, + segments
    lights.py --test ff0000      # send one colour to every light, verbatim

Config:  %USERPROFILE%\\.config\\lightsync\\token
         %USERPROFILE%\\.config\\lightsync\\config.ini   (optional overrides)
"""

import argparse
import colorsys
import configparser
import ctypes
import json
import os
import re
import subprocess
import sys
import time
import winreg
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import requests
from PIL import Image, ImageFilter

CONFIG_DIR = Path.home() / ".config" / "lightsync"
TOKEN_FILE = CONFIG_DIR / "token"
CONFIG_FILE = CONFIG_DIR / "config.ini"
STATE_FILE = CONFIG_DIR / "state.json"

DEFAULTS = {
    "ha_url": "http://192.168.1.53:8123",
    "lights": "light.office_ambient_lights",
    "pc_lights": "light.office_pc_lights",
    "keep_lights": "light.left_monitor,light.right_monitor",

    "paint_path": str(Path.home() / "Scripts" / "rgb_paint_win.py"),
    "chroma_path": str(Path.home() / "Scripts" / "chroma_paint.py"),
    "palette_size": "6",
    "boost_count": "3",
    "transition": "1.5",
    "white_kelvin": "4500",
    "off_transition": "2.0",

    "ha_saturation_boost": "1.7",
    "ha_min_saturation": "0.58",

    "ha_force_hs": "light.h6062",
    "ha_force_hs_saturation": "100",

    "ha_segments": "true",
    "ha_gradient": "smooth",          
    "ha_segment_workers": "6",
    "ha_gradient_min_value": "0.18",
    "ha_gradient_min_saturation": "0.12",
    # Your Govee lamps exist twice in HA: once as the device that exposes
    # segment entities, once as light.h60xx. Both point at the same physical
    # lamp, so a whole-device write to either one flattens a 15-segment
    # gradient. The segment pass therefore runs LAST, and waits this long
    # first so the whole-device writes have already landed. Raise it if the
    # gradient still gets stomped; Govee's cloud latency varies.
    "ha_segment_delay": "0.8",
    "ha_skip_entities": "",

    # Two separate Windows settings, hence two flags. accent_taskbar tints
    # Start, the taskbar and the action centre; accent_titlebars tints
    # window borders and title bars, which looks like a Christmas tree.
    "accent_taskbar": "true",
    "accent_titlebars": "false",
}

BG = "#16181d"
FG = "#e6e8ee"
MUTED = "#7c8496"
LINE = "#252932"


def load_config():
    cfg = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
    cfg["lightsync"] = DEFAULTS
    if CONFIG_FILE.exists():
        cfg.read(CONFIG_FILE)
    section = cfg["lightsync"]
    for k, v in DEFAULTS.items():
        if k not in section:
            section[k] = v
    return section


def fail(message):
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showerror("Lights", message)
        root.destroy()
    except Exception:
        pass
    print(message)
    sys.exit(1)


def load_token():
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
        fail(f"The token file is empty:\n\n{TOKEN_FILE}")
    fail(f"No Home Assistant token found.\n\n"
         f"Create this file and paste your long-lived token into it:\n\n"
         f"{TOKEN_FILE}")


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(**kw):
    state = load_state()
    state.update(kw)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state), encoding="utf-8")


def truthy(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def csv_set(value):
    return {e.strip() for e in str(value).split(",") if e.strip()}


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(r, g, b):
    return "%02x%02x%02x" % (int(r), int(g), int(b))


def hsv_of(h):
    return colorsys.rgb_to_hsv(*(c / 255 for c in hex_to_rgb(h)))


def from_hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h, max(0.0, min(1.0, s)), max(0.0, min(1.0, v)))
    return rgb_to_hex(r * 255, g * 255, b * 255)


def readable_on(h):
    r, g, b = hex_to_rgb(h)
    return "#101216" if (r * 299 + g * 587 + b * 114) / 1000 > 140 else "#f2f4f8"


def tint(hex_colour, saturation_pct):
    h, s, v = hsv_of(hex_colour)
    return from_hsv(h, s * saturation_pct / 100.0, v)


HUES = [(0.03, "Red"), (0.06, "Vermilion"), (0.10, "Orange"), (0.14, "Amber"),
        (0.19, "Yellow"), (0.26, "Lime"), (0.38, "Green"), (0.46, "Teal"),
        (0.52, "Cyan"), (0.58, "Azure"), (0.68, "Blue"), (0.74, "Indigo"),
        (0.80, "Violet"), (0.88, "Magenta"), (0.95, "Pink"), (1.01, "Red")]


def colour_name(hex_colour):
    h, s, v = hsv_of(hex_colour)
    if s < 0.10:
        return "Warm White" if v > 0.7 else ("Grey" if v > 0.3 else "Near Black")
    base = next(name for edge, name in HUES if h < edge)
    if v < 0.35:
        return f"Deep {base}"
    if s < 0.35:
        return f"Soft {base}"
    if v > 0.85 and s > 0.7:
        return f"Bright {base}"
    return base


def light_friendly(hex_colour):
    h, s, v = hsv_of(hex_colour)
    if s < 0.14:
        return None
    return from_hsv(h, min(0.92, max(0.55, s * 1.30)),
                    min(1.00, max(0.88, v * 1.45)))


def boosted_palette(colours, limit):
    out = []
    for c in colours:
        boosted = light_friendly(c)
        if not boosted:
            continue
        bh = hsv_of(boosted)[0]
        if any(min(abs(bh - h), 1 - abs(bh - h)) < 0.05
               for h in (hsv_of(x)[0] for x in out)):
            continue
        out.append(boosted)
        if len(out) >= limit:
            break
    return out


def palette_from(image_path, count=6):
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((240, 240))
    quant = img.quantize(colors=count * 3, method=Image.Quantize.MEDIANCUT)
    pal = quant.getpalette()

    candidates = []
    for _freq, idx in sorted(quant.getcolors(), reverse=True):
        rgb = tuple(pal[idx * 3:idx * 3 + 3])
        h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        candidates.append((rgb, h, s, v))

    def hue_gap(h, chosen):
        return min((min(abs(h - o), 1 - abs(h - o)) for o in chosen), default=1.0)

    picked, hues = [], []
    for min_sat, min_val, spacing in ((0.30, 0.20, 0.09),
                                      (0.18, 0.12, 0.04),
                                      (0.00, 0.00, 0.00)):
        for rgb, h, s, v in candidates:
            if len(picked) >= count:
                break
            if s < min_sat or v < min_val:
                continue
            if spacing and hue_gap(h, hues) < spacing:
                continue
            if any(sum(abs(a - b) for a, b in zip(rgb, seen)) < 45 for seen in picked):
                continue
            picked.append(rgb)
            hues.append(h)
        if len(picked) >= count:
            break

    return [rgb_to_hex(*rgb) for rgb in picked]


def image_gradient(image, count):
    if not image or count < 1:
        return []
    try:
        img = Image.open(image).convert("RGB")
        img.thumbnail((320, 320))
        img = img.filter(ImageFilter.GaussianBlur(2.0))
    except Exception:
        return []
    mid = img.height // 2
    return [rgb_to_hex(*img.getpixel(
        (int((i / max(1, count - 1)) * (img.width - 1)), mid)))
        for i in range(count)]


def smooth_gradient(cfg, image, count):
    if not image or count < 1:
        return []
    try:
        stops = palette_from(image, int(cfg["palette_size"]))
    except Exception:
        return []
    if not stops:
        return []

    min_v = float(cfg["ha_gradient_min_value"])
    min_s = float(cfg["ha_gradient_min_saturation"])
    usable = [c for c in stops if hsv_of(c)[2] >= min_v and hsv_of(c)[1] >= min_s]
    stops = sorted(usable or stops, key=lambda c: hsv_of(c)[0])

    if len(stops) == 1 or count == 1:
        return [stops[0]] * count

    out = []
    for i in range(count):
        pos = (i / (count - 1)) * (len(stops) - 1)
        lo = min(int(pos), len(stops) - 2)
        frac = pos - lo
        h1, s1, v1 = hsv_of(stops[lo])
        h2, s2, v2 = hsv_of(stops[lo + 1])
        out.append(from_hsv(h1 + (h2 - h1) * frac,
                            s1 + (s2 - s1) * frac,
                            v1 + (v2 - v1) * frac))
    return out


def current_wallpaper():
    src = load_state().get("last_source")
    if src and Path(src).is_file():
        return Path(src)
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop")
        path, _ = winreg.QueryValueEx(key, "WallPaper")
        winreg.CloseKey(key)
        if path and Path(path).is_file():
            return Path(path)
    except OSError:
        pass
    return None


def headers(token):
    return {"Authorization": f"Bearer {token}", "content-type": "application/json"}


def call(cfg, token, service, payload):
    try:
        requests.post(f"{cfg['ha_url'].rstrip('/')}/api/services/light/{service}",
                      headers=headers(token), json=payload, timeout=6)
        return True
    except Exception:
        return False


def all_states(cfg, token):
    try:
        r = requests.get(f"{cfg['ha_url'].rstrip('/')}/api/states",
                         headers=headers(token), timeout=8)
        return r.json()
    except Exception:
        return []


def expand(cfg, token, entities, seen=None):
    seen = seen if seen is not None else set()
    out = []
    for entity in entities:
        if entity in seen:
            continue
        seen.add(entity)
        try:
            r = requests.get(f"{cfg['ha_url'].rstrip('/')}/api/states/{entity}",
                             headers=headers(token), timeout=6)
            members = r.json().get("attributes", {}).get("entity_id") or []
        except Exception:
            members = []
        if members:
            out.extend(expand(cfg, token, list(members), seen))
        else:
            out.append(entity)
    return out


def segment_groups(cfg, token):
    groups = {}
    for item in all_states(cfg, token):
        m = re.match(r"^(light\..+)_segment_(\d+)$", item.get("entity_id", ""))
        if m:
            groups.setdefault(m.group(1), []).append((int(m.group(2)), m.group(0)))
    return {base: [e for _n, e in sorted(pairs)] for base, pairs in groups.items()}


def bulb_colour(cfg, hex_colour):
    h, s, v = hsv_of(hex_colour)
    if s < 0.06:
        return hex_colour
    return from_hsv(h, min(1.0, max(float(cfg["ha_min_saturation"]),
                                    s * float(cfg["ha_saturation_boost"]))), v)


def colour_payload(cfg, entity, hex_colour, brightness):
    payload = {"entity_id": entity, "brightness": brightness,
               "transition": float(cfg["transition"])}
    if entity in csv_set(cfg["ha_force_hs"]):
        h, s, _v = hsv_of(hex_colour)
        floor = float(cfg["ha_force_hs_saturation"])
        payload["hs_color"] = [round(h * 360, 1),
                               max(0.0, min(100.0, max(s * 100, floor)))]
    else:
        payload["rgb_color"] = list(hex_to_rgb(bulb_colour(cfg, hex_colour)))
    return payload


def painter_of(cfg):
    raw = cfg.get("paint_path", "").strip()
    if not raw:
        return None
    path = Path(os.path.expanduser(raw))
    return path if path.is_file() else None


def paint(cfg, *args):
    for key in ("paint_path", "chroma_path"):
        raw = cfg.get(key, "").strip()
        if not raw:
            continue
        script = Path(os.path.expanduser(raw))
        if not script.is_file():
            continue
        try:
            done = subprocess.run([sys.executable, str(script), *args],
                                  capture_output=True, text=True, timeout=90)
        except (OSError, subprocess.SubprocessError) as e:
            pass


def groups_of(cfg):
    if painter_of(cfg):
        return csv_set(cfg["lights"])
    return csv_set(cfg["lights"]) | csv_set(cfg["pc_lights"])


def level_of(brightness_pct):
    return max(1, min(255, int(255 * brightness_pct / 100)))


# ──────────────────────────────────────────────
#  WINDOWS OS ACCENT COLOUR
# ──────────────────────────────────────────────

def accent_palette(hex_colour):
    """Windows reads an eight-shade palette for a lot of Start and taskbar
    surfaces, not just the single AccentColor value - which is why writing
    only AccentColor updates some chrome and leaves the rest stale.

    Darkest to lightest, packed as R G B 00 per entry. The exact index
    semantics are undocumented, so if a surface picks a shade that looks
    wrong, the fix is reordering these rather than changing the maths.
    """
    h, s, v = hsv_of(hex_colour)
    shades = []
    for i in range(8):
        t = i / 7.0
        val = max(0.10, min(1.00, v * (0.40 + 0.90 * t)))
        # Ease saturation off toward the light end, the way Windows' own
        # generated palettes do - otherwise the pale shades look radioactive.
        sat = max(0.00, min(1.00, s * (1.08 - 0.40 * t)))
        shades.append(hex_to_rgb(from_hsv(h, sat, val)))

    blob = bytearray()
    for r, g, b in shades:
        blob += bytes((r, g, b, 0x00))
    return bytes(blob), shades


def set_windows_accent(cfg, hex_colour):
    """Point the Windows accent colour at the chosen light colour."""
    try:
        r, g, b = hex_to_rgb(hex_colour)
        # DWM stores colours as ABGR, not RGB.
        def abgr(rgb):
            rr, gg, bb = rgb
            return (0xFF << 24) | (bb << 16) | (gg << 8) | rr

        main = abgr((r, g, b))
        blob, shades = accent_palette(hex_colour)

        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,
                              r"Software\Microsoft\Windows\DWM") as key:
            winreg.SetValueEx(key, "AccentColor", 0, winreg.REG_DWORD, main)
            winreg.SetValueEx(key, "AccentColorInactive", 0, winreg.REG_DWORD, main)
            winreg.SetValueEx(key, "ColorizationColor", 0, winreg.REG_DWORD, main)
            winreg.SetValueEx(key, "ColorizationAfterglow", 0, winreg.REG_DWORD, main)
            # This one is title bars and window borders only.
            winreg.SetValueEx(key, "ColorPrevalence", 0, winreg.REG_DWORD,
                              1 if truthy(cfg["accent_titlebars"]) else 0)

        # ...and this separate one is Start, taskbar and action centre. Two
        # different keys with the same name, which is why setting only the
        # DWM one appears to do nothing.
        with winreg.CreateKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as key:
            winreg.SetValueEx(key, "ColorPrevalence", 0, winreg.REG_DWORD,
                              1 if truthy(cfg["accent_taskbar"]) else 0)

        with winreg.CreateKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\Accent") as key:
            winreg.SetValueEx(key, "AccentPalette", 0, winreg.REG_BINARY, blob)
            winreg.SetValueEx(key, "AccentColor", 0, winreg.REG_DWORD, main)
            winreg.SetValueEx(key, "AccentColorMenu", 0, winreg.REG_DWORD,
                              abgr(shades[2]))
            winreg.SetValueEx(key, "StartColorMenu", 0, winreg.REG_DWORD,
                              abgr(shades[1]))

        # WM_DWMCOLORIZATIONCOLORCHANGED, then WM_SETTINGCHANGE to make
        # Explorer redraw rather than waiting for a sign-out.
        ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x0320, main, 0, 2, 100, None)
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x001A, 0, ctypes.c_wchar_p("ImmersiveColorSet"), 2, 100, None)
    except Exception as e:
        print(f"Failed to set Windows accent color: {e}")


# ──────────────────────────────────────────────
#  APPLICATION ROUTINES
# ──────────────────────────────────────────────

def paint_segments(cfg, token, image, brightness_pct, saturation_pct):
    if not truthy(cfg["ha_segments"]):
        return set()

    groups = segment_groups(cfg, token)
    if not groups:
        return set()

    level = level_of(brightness_pct)
    workers = max(1, int(cfg["ha_segment_workers"]))

    for base, segs in groups.items():
        if cfg["ha_gradient"].strip().lower() == "image":
            ramp = image_gradient(image, len(segs))
        else:
            ramp = smooth_gradient(cfg, image, len(segs))
        if not ramp:
            continue

        call(cfg, token, "turn_on",
             colour_payload(cfg, base, tint(ramp[len(ramp) // 2], saturation_pct),
                            level))
        time.sleep(0.3)

        def send(pair):
            entity, colour = pair
            call(cfg, token, "turn_on",
                 colour_payload(cfg, entity, colour, level))

        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(send, [(e, tint(ramp[i % len(ramp)], saturation_pct))
                                 for i, e in enumerate(segs)]))

    return set(groups)


def apply_colour(cfg, token, hex_colour, brightness_pct=100, saturation_pct=100,
                 image=None):
    colour = tint(hex_colour, saturation_pct)
    level = level_of(brightness_pct)

    skip = csv_set(cfg["ha_skip_entities"])
    groups = segment_groups(cfg, token)
    for parent in groups:
        skip.discard(parent)

    targets = [e for e in expand(cfg, token, sorted(groups_of(cfg))) if e not in skip]

    def send(entity):
        call(cfg, token, "turn_on", colour_payload(cfg, entity, colour, level))

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(send, targets))

    paint(cfg, "--color", colour, "--brightness", str(brightness_pct))
    set_windows_accent(cfg, hex_colour)
    save_state(last_colour=hex_colour)


def apply_colorful(cfg, token, palette, brightness_pct=100, saturation_pct=100,
                   image=None):
    if not palette:
        return
    level = level_of(brightness_pct)

    source = image or current_wallpaper()

    # Every entity that speaks for a segment-capable lamp - the segment
    # parent itself plus any duplicate entity from a second integration.
    # These are excluded from the flat pass; the gradient handles them.
    skip = csv_set(cfg["ha_skip_entities"]) | set(segment_groups(cfg, token))

    targets = [e for e in expand(cfg, token, sorted(groups_of(cfg)))
               if e not in skip]

    def send(pair):
        i, entity = pair
        colour = tint(palette[i % len(palette)], saturation_pct)
        call(cfg, token, "turn_on", colour_payload(cfg, entity, colour, level))

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(send, list(enumerate(targets))))

    # The PC and the keyboard are independent hardware - fire them off now
    # rather than making them wait behind Govee's cloud round trips.
    if source:
        paint(cfg, "--image", str(source), "--brightness", str(brightness_pct))

    # Segments LAST, deliberately. Painting them first meant any later
    # whole-device write - a duplicate entity for the same lamp, a group
    # that still contains it - wiped all 15 segments in one call. Going
    # last, the gradient always has the final say.
    time.sleep(float(cfg["ha_segment_delay"]))
    paint_segments(cfg, token, source, brightness_pct, saturation_pct)

    set_windows_accent(cfg, palette[0])


def apply_white(cfg, token, brightness_pct=100):
    level = level_of(brightness_pct)
    targets = expand(cfg, token, sorted(groups_of(cfg)))
    
    def send(entity):
        call(cfg, token, "turn_on", {
            "entity_id": entity,
            "color_temp_kelvin": int(cfg["white_kelvin"]),
            "brightness": level,
            "transition": float(cfg["transition"]),
        })
        
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(send, targets))
        
    paint(cfg, "--color", "fff1e0", "--brightness", str(brightness_pct))
    set_windows_accent(cfg, "808080")


def apply_off(cfg, token):
    targets = sorted(groups_of(cfg)) + sorted(csv_set(cfg["pc_lights"]))
    
    def send(entity):
        call(cfg, token, "turn_off",
             {"entity_id": entity, "transition": float(cfg["off_transition"])})
             
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(send, targets))
        
    paint(cfg, "--off")


def apply_game(cfg, token):
    """Room and PC dark, but the monitor bars are left exactly as they are
    so Hue Sync can drive them, and the keyboard is left to its daemon.

    This used to turn off the ambient group wholesale and rely on Hue Sync
    grabbing the bars back a moment later - which is a race, and loses if
    Sync isn't running yet.
    """
    keep = csv_set(cfg["keep_lights"])
    targets = [e for e in expand(cfg, token, sorted(groups_of(cfg)))
               if e not in keep]
    targets += sorted(csv_set(cfg["pc_lights"]))

    def send(entity):
        call(cfg, token, "turn_off",
             {"entity_id": entity, "transition": float(cfg["off_transition"])})

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(send, targets))

    # Only the case painter - chroma_paint keeps the keyboard alive.
    raw = cfg.get("paint_path", "").strip()
    if raw:
        script = Path(os.path.expanduser(raw))
        if script.is_file():
            try:
                subprocess.run([sys.executable, str(script), "--off"],
                               capture_output=True, timeout=15)
            except Exception:
                pass


def apply_bias(cfg, token):
    keep = csv_set(cfg["keep_lights"])
    targets = [e for e in expand(cfg, token, sorted(groups_of(cfg))) if e not in keep]
    
    def send(entity):
        call(cfg, token, "turn_off",
             {"entity_id": entity, "transition": float(cfg["off_transition"])})
             
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(send, targets))
        
    paint(cfg, "--off")


# ──────────────────────────────────────────────
#  GUI
# ──────────────────────────────────────────────

def run_gui(cfg, token, image):
    import tkinter as tk
    from tkinter import colorchooser

    raw = palette_from(image, int(cfg["palette_size"])) if image else []
    boost = boosted_palette(raw, int(cfg["boost_count"]))

    state = load_state()
    chosen = {"value": None,
              "brightness": state.get("brightness", 100),
              "saturation": state.get("saturation", 100)}

    root = tk.Tk()
    root.title("Lights")
    root.configure(bg=BG)
    root.resizable(False, False)
    root.attributes("-topmost", True)

    wrap = tk.Frame(root, bg=BG, padx=22, pady=20)
    wrap.pack()

    tk.Label(wrap, text="Room colour", bg=BG, fg=FG,
             font=("Segoe UI Semibold", 14), anchor="w").pack(fill="x")
    tk.Label(wrap, text="Tuned for bulbs, or straight from the wallpaper",
             bg=BG, fg=MUTED, font=("Segoe UI", 9), anchor="w").pack(
                 fill="x", pady=(0, 14))

    def finish(value):
        chosen["value"] = value
        root.destroy()

    def flat_button(parent, text, bg, fg, **kw):
        return tk.Button(parent, text=text, bg=bg, fg=fg, bd=0, relief="flat",
                         cursor="hand2", activebackground=bg,
                         activeforeground=fg, highlightthickness=0, **kw)

    presets = tk.Frame(wrap, bg=BG)
    presets.pack(fill="x")
    for col, (label, key, bg, fg) in enumerate((
            ("Work\nWhite", "__white__", "#f3ece0", "#20232a"),
            ("Bias only\nBars stay", "__bias__", "#232833", FG),
            ("Off\nDark", "__off__", "#1b1e25", MUTED))):
        b = flat_button(presets, label, bg, fg, font=("Segoe UI", 9),
                        width=14, height=2, command=lambda k=key: finish(k))
        b.grid(row=0, column=col, padx=(0 if col == 0 else 8, 0), sticky="ew")
        presets.grid_columnconfigure(col, weight=1)

    flat_button(wrap, "Colourful  \u00b7  wallpaper across everything",
                "#242a36", FG, font=("Segoe UI", 9), height=2,
                command=lambda: finish("__colorful__")).pack(fill="x", pady=(8, 0))

    def section(title, colours, start_index):
        if not colours:
            return
        tk.Label(wrap, text=title, bg=BG, fg=MUTED,
                 font=("Segoe UI Semibold", 8), anchor="w").pack(
                     fill="x", pady=(16, 6))
        grid = tk.Frame(wrap, bg=BG)
        grid.pack(fill="x")
        for i, c in enumerate(colours):
            b = flat_button(grid, f"{colour_name(c)}\n#{c}", f"#{c}",
                            readable_on(c), font=("Segoe UI", 8),
                            command=lambda v=c: finish(v))
            b.configure(width=15, height=3)
            b.grid(row=i // 3, column=i % 3,
                   padx=(0 if i % 3 == 0 else 8, 0),
                   pady=(0 if i < 3 else 8, 0), sticky="ew")
            root.bind(str(start_index + i + 1), lambda _e, v=c: finish(v))
        for col in range(3):
            grid.grid_columnconfigure(col, weight=1)

    section("LIGHT FRIENDLY", boost, 0)
    section("FROM WALLPAPER", raw, len(boost))

    if not raw:
        tk.Label(wrap, text="No wallpaper found - pick a custom colour",
                 bg=BG, fg=MUTED, font=("Segoe UI", 9)).pack(pady=(12, 0))

    def custom():
        rgb, _hexval = colorchooser.askcolor(parent=root, title="Pick a colour")
        if rgb:
            finish(rgb_to_hex(*rgb))

    flat_button(wrap, "Custom colour\u2026", "#1f232c", FG,
                font=("Segoe UI", 9), height=2, command=custom).pack(
                    fill="x", pady=(16, 0))

    tk.Frame(wrap, bg=LINE, height=1).pack(fill="x", pady=(16, 12))

    def slider(label, key):
        row = tk.Frame(wrap, bg=BG)
        row.pack(fill="x", pady=2)
        tk.Label(row, text=label, bg=BG, fg=MUTED, font=("Segoe UI", 9),
                 width=9, anchor="w").pack(side="left")
        readout = tk.Label(row, text=f"{chosen[key]}%", bg=BG, fg=FG,
                           font=("Segoe UI", 9), width=5, anchor="e")
        readout.pack(side="right")

        def on_move(v):
            chosen[key] = int(float(v))
            readout.configure(text=f"{chosen[key]}%")

        s = tk.Scale(row, from_=5, to=100, orient="horizontal", showvalue=False,
                     bg=BG, fg=FG, troughcolor="#1f232c", activebackground=FG,
                     highlightthickness=0, bd=0, sliderrelief="flat",
                     command=on_move)
        s.set(chosen[key])
        s.pack(side="left", fill="x", expand=True, padx=8)

    slider("Brightness", "brightness")
    slider("Saturation", "saturation")

    root.bind("<Escape>", lambda _e: root.destroy())
    root.bind("w", lambda _e: finish("__white__"))
    root.bind("g", lambda _e: finish("__bias__"))
    root.bind("o", lambda _e: finish("__off__"))
    root.bind("c", lambda _e: finish("__colorful__"))

    root.update_idletasks()
    root.geometry(f"+{(root.winfo_screenwidth() - root.winfo_width()) // 2}"
                  f"+{(root.winfo_screenheight() - root.winfo_height()) // 2}")
    root.focus_force()
    root.mainloop()

    value = chosen["value"]
    if not value:
        return

    save_state(brightness=chosen["brightness"], saturation=chosen["saturation"])
    bright, sat = chosen["brightness"], chosen["saturation"]

    if value == "__white__":
        apply_white(cfg, token, bright)
    elif value == "__off__":
        apply_off(cfg, token)
    elif value == "__bias__":
        apply_bias(cfg, token)
    elif value == "__colorful__":
        palette = boost + [c for c in raw if c not in boost]
        apply_colorful(cfg, token, palette, bright, sat, image)
    else:
        apply_colour(cfg, token, value, bright, sat, image)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", help="use this image for the palette")
    ap.add_argument("--auto", metavar="IMAGE", nargs="?", const=True,
                    help="no window: apply the dominant colour")
    ap.add_argument("--color", "--colour", dest="color", help="apply a hex")
    ap.add_argument("--colorful", "--colourful", dest="colorful",
                    action="store_true",
                    help="no window: palette spread across every light")
    ap.add_argument("--white", action="store_true")
    ap.add_argument("--bias", action="store_true")
    ap.add_argument("--off", action="store_true")
    ap.add_argument("--video", action="store_true", help="kill everything for Hue Sync")
    ap.add_argument("--game", action="store_true", help="kill room/pc, keep keyboard for Hue Sync")
    ap.add_argument("--entities", action="store_true")
    ap.add_argument("--test", metavar="HEX")
    args = ap.parse_args()

    cfg = load_config()
    token = load_token()
    state = load_state()
    bright = state.get("brightness", 100)
    sat = state.get("saturation", 100)

    image = Path(args.image) if args.image else current_wallpaper()

    if args.video:
        return apply_off(cfg, token)
    if args.game:
        return apply_game(cfg, token)

    if args.off:
        return apply_off(cfg, token)
    if args.white:
        return apply_white(cfg, token, bright)
    if args.bias:
        return apply_bias(cfg, token)
    if args.color:
        return apply_colour(cfg, token, args.color.lstrip("#"), bright, sat, image)

    if args.colorful or args.auto:
        if args.auto and args.auto is not True:
            image = Path(args.auto)
        if not image:
            return
        raw = palette_from(image, int(cfg["palette_size"]))
        palette = boosted_palette(raw, int(cfg["boost_count"]))
        palette += [c for c in raw if c not in palette]
        if args.colorful:
            return apply_colorful(cfg, token, palette, bright, sat, image)
        if palette:
            return apply_colour(cfg, token, palette[0], bright, sat, image)
        return

    run_gui(cfg, token, image)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass