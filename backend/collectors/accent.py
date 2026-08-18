"""Accent-colour / wallpaper-palette collector.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import json
import re
from pathlib import Path
import requests

from backend.core import STATE_FILE


_accent_cache = {"key": None, "hex": None}
def _wallpaper_accent(path):
    import colorsys
    from PIL import Image
    key = f"{path}|{Path(path).stat().st_mtime_ns}"
    if _accent_cache["key"] == key: return _accent_cache["hex"]
    img = Image.open(path).convert("RGB")
    img.thumbnail((160, 160))
    quant = img.quantize(colors=12, method=Image.Quantize.MEDIANCUT)
    palette = quant.getpalette()
    best, best_score = None, -1
    for count, index in quant.getcolors():
        rgb = tuple(palette[index * 3:index * 3 + 3])
        h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        score = (s ** 1.4) * (0.35 + v) * (count ** 0.35)
        if score > best_score: best, best_score = (h, s, v), score
    if best is None: return None
    h, s, v = best
    s = min(0.85, max(0.45, s * 1.15))
    v = min(1.0, max(0.72, v * 1.3))
    for _ in range(14):
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum >= 0.42: break
        if v < 1.0: v = min(1.0, v + 0.06)
        else: s = max(0.18, s - 0.07)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    hexed = "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))
    _accent_cache.update(key=key, hex=hexed)
    return hexed

_palette_cache = {"key": None, "swatches": None}
def _wallpaper_palette(path, count=7):
    """The swatches the Scene view offers you. Same quantise as the accent, but
    kept as a spread instead of collapsed to one winner - sorted by how much of
    the image they cover, so the first swatch is the one you'd call 'the colour
    of that wallpaper'."""
    import colorsys
    from PIL import Image
    key = f"{path}|{Path(path).stat().st_mtime_ns}|{count}"
    if _palette_cache["key"] == key: return _palette_cache["swatches"]
    img = Image.open(path).convert("RGB")
    img.thumbnail((200, 200))
    quant = img.quantize(colors=18, method=Image.Quantize.MEDIANCUT)
    palette = quant.getpalette()
    entries = []
    for pixels, index in quant.getcolors():
        rgb = tuple(palette[index * 3:index * 3 + 3])
        h, sat, val = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        entries.append({"h": h, "s": sat, "v": val, "pixels": pixels})
    entries.sort(key=lambda e: -e["pixels"])

    out, taken = [], []
    for entry in entries:
        # Skip near-duplicates: six swatches of the same blue is not a palette.
        if any(abs(entry["h"] - other) < 0.045 for other in taken) and entry["s"] > 0.1:
            continue
        h, sat, val = entry["h"], entry["s"], entry["v"]
        # A bulb needs the lift; a wallpaper's own murky teal reads as off.
        sat = min(0.95, sat * 1.25) if sat > 0.08 else sat
        val = min(1.0, max(0.55, val * 1.25))
        r, g, b = colorsys.hsv_to_rgb(h, sat, val)
        out.append("#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255)))
        taken.append(entry["h"])
        if len(out) >= count: break
    _palette_cache.update(key=key, swatches=out)
    return out


def collect_accent(cfg, _shared):
    result = _collect_accent_auto(cfg)
    # A manual pin from Settings > Appearance - wins for the accent colour
    # itself, but bg/palette/source (Scene's hero background, the swatch
    # picker) still come from whatever the wallpaper actually is. Pinning
    # accent was never meant to also freeze the wallpaper preview.
    override = str(cfg.get("accent_override") or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", override):
        result = {**result, "hex": override, "from": "override"}
    return result

def _collect_accent_auto(cfg):
    source = None
    try: source = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_source")
    except Exception: pass
    if source and Path(source).is_file():
        try:
            stamp = Path(source).stat().st_mtime_ns
            bg = ("/api/bg?path=" + requests.utils.quote(str(source)) + f"&v={stamp}")
            found = _wallpaper_accent(source)
            if found:
                return {"hex": found, "from": "wallpaper", "bg": bg,
                        "palette": _wallpaper_palette(source), "source": str(source)}
        except Exception: pass
    try:
        colour = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_colour")
        if colour: return {"hex": "#" + str(colour).lstrip("#"), "from": "lights"}
    except Exception: pass
    return {"hex": None}
