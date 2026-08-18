"""Home Assistant lights collector + live brightness/saturation.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import subprocess
import sys
import requests

from backend.core import HERE, _persist_state, csv_list, load_token



def collect_lights(cfg, _shared):
    # `configured` added for the same reason every other optional
    # integration exposes it (see the INTEGRATIONS list in
    # frontend/src/widgets/Settings/integrations.ts) - this one is gated
    # on the paired ha_url setting + the separately-issued HA token
    # (load_token()), not just one or the other.
    if not str(cfg["ha_url"]).strip(): return {"configured": False, "lights": []}
    token = load_token()
    if not token: return {"configured": False, "error": "no token", "lights": []}
    headers = {"Authorization": f"Bearer {token}", "content-type": "application/json"}
    base = cfg["ha_url"].rstrip("/")
    out = []
    for entity in csv_list(cfg["panel_lights"]):
        try:
            r = requests.get(f"{base}/api/states/{entity}", headers=headers, timeout=5)
            data = r.json()
            attrs = data.get("attributes") or {}
            rgb = attrs.get("rgb_color")
            out.append({"entity": entity, "name": attrs.get("friendly_name") or entity,
                        "on": data.get("state") == "on", "hex": "#%02x%02x%02x" % tuple(rgb) if rgb else None,
                        "brightness": attrs.get("brightness")})
        except Exception: continue
    return {"configured": True, "lights": out}

def _rerun_colorful_background():
    # OpenRGB/Chroma have no live-adjust path (rgb_paint_win.py has no
    # persistent daemon like chroma_paint.py's - every paint re-connects to
    # OpenRGB, re-samples the wallpaper and rewrites every device, which is
    # most of where the old 10-20s slider lag came from). Catching them up
    # still means re-running lights.py --colorful, but firing it detached
    # (Popen never blocks this request) means it no longer gates the HA
    # response below - the room lights react immediately, the PC/keyboard
    # catch up a couple of seconds later in the background.
    script = HERE.parent / "system" / "lights.py"
    if not script.is_file(): return False
    # DETACHED_PROCESS alone only stops the child from inheriting this
    # process's console - sys.executable is still the console-subsystem
    # python.exe, so without CREATE_NO_WINDOW too it opens a brand new
    # visible console of its own (the "a terminal opens" bug).
    subprocess.Popen([sys.executable, str(script), "--colorful"],
                      creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return True

def _patch_ha_lights(cfg, build_payload):
    """Runs `build_payload(entity, headers, base) -> dict | None` across
    every panel_lights entity in parallel and POSTs whatever it returns.
    This is the actual live-adjust path for HA/Govee/Hue: it touches each
    light's *current* state directly (brightness only, or current colour
    re-hsv'd for saturation) instead of recomputing anything from the
    wallpaper, so it's a handful of small concurrent HTTP calls - a few
    hundred ms, not a 10-20s image-to-device pipeline. panel_lights are
    each painted their own flat colour by apply_colorful() (never a
    per-segment gradient, that's a separate entity set - see
    segment_groups() in lights.py), so re-sending each one's own current
    colour can never flatten a gradient it was never part of."""
    import concurrent.futures
    token = load_token()
    if not token: return False
    headers = {"Authorization": f"Bearer {token}", "content-type": "application/json"}
    base = cfg["ha_url"].rstrip("/")

    def run(entity):
        try:
            payload = build_payload(entity, headers, base)
            if payload: requests.post(f"{base}/api/services/light/turn_on", headers=headers, timeout=5, json=payload)
        except Exception: pass

    entities = csv_list(cfg["panel_lights"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(entities))) as pool:
        list(pool.map(run, entities))
    return True

def set_brightness(cfg, percent, mode=None):
    _persist_state(brightness=int(percent))
    level = max(1, min(255, int(255 * int(percent) / 100)))
    ok = _patch_ha_lights(cfg, lambda entity, headers, base: {"entity_id": entity, "brightness": level, "transition": 1.0})
    if mode == "colorful": _rerun_colorful_background()
    return ok

def set_saturation(cfg, percent, mode=None):
    """The live-adjust half of lights.py's own saturation concept
    (lights.py:184-186's tint()) - re-reads each light's current colour and
    re-sends it at the new saturation, the same way set_brightness() nudges
    brightness without recomputing colour. Also persisted to STATE_FILE
    under the same "saturation" key lights.py's main() already reads on
    every invocation (lights.py:864), so the next mode/colour applied
    (from here or from lights.py directly) picks it up as the baseline."""
    import colorsys
    _persist_state(saturation=int(percent))
    factor = max(0.0, min(1.0, int(percent) / 100))

    def build(entity, headers, base):
        r = requests.get(f"{base}/api/states/{entity}", headers=headers, timeout=5)
        attrs = (r.json() or {}).get("attributes") or {}
        rgb = attrs.get("rgb_color")
        if not rgb: return None
        h, _s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        nr, ng, nb = colorsys.hsv_to_rgb(h, factor, v)
        return {"entity_id": entity, "rgb_color": [int(nr * 255), int(ng * 255), int(nb * 255)], "transition": 1.0}

    ok = _patch_ha_lights(cfg, build)
    if mode == "colorful": _rerun_colorful_background()
    return ok
    return True
