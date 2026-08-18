#!/usr/bin/env python
"""
server.py - the data backend for the desk panel.
"""

import argparse
import asyncio
import base64
import configparser
import ctypes
import hashlib
import html as html_entities
import json
import mimetypes
import os
import random
import re
import socket
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urljoin

import requests
import icalendar
import recurring_ical_events

HERE = Path(__file__).resolve().parent
CONFIG_DIR = Path.home() / ".config" / "lightsync"
CONFIG_FILE = CONFIG_DIR / "config.ini"
TOKEN_FILE = CONFIG_DIR / "token"
STATE_FILE = CONFIG_DIR / "state.json"

# Everything you change from inside the panel lives here rather than in
# config.ini: shelves, tile order, per-game covers, manually added games.
# config.ini stays hand-edited; this file is owned by the UI.
STORE_FILE = CONFIG_DIR / "panel-store.json"
COVER_DIR = CONFIG_DIR / "covers"
# Extracted article full-text, one JSON file per reading item id - see
# _extract_article(). Disk-backed (not just in-memory) so the cache
# survives a backend restart, same reasoning as COVER_DIR.
ARTICLE_DIR = CONFIG_DIR / "articles"

DEFAULTS = {
    "latitude": "44.3302", "longitude": "23.7949", "place": "Craiova", "units": "celsius",
    "ha_url": "http://192.168.1.53:8123",
    "panel_lights": ("light.office_ambient_lights, light.office_pc_lights, light.left_monitor, light.right_monitor, light.bottom_monitors"),
    "plex_url": "http://192.168.1.53:32400", "plex_token": "", "plex_open": "app", "plex_limit": "40",
    "steam_path": r"C:\Program Files (x86)\Steam", "games_limit": "18", "extra_games": "",
    "games_ignore": "228980, 1070560, 1391110, 1826330, 1493710",
    "xbox_enabled": "true", "xbox_paths": r"C:\XboxGames",
    "battlenet_enabled": "true", "battlenet_paths": r"D:\Battlenet Games",
    "battlenet_exe_hints": "League of Legends|LeagueClient.exe, VALORANT|VALORANT.exe, Diablo IV|Diablo IV.exe",
    "riot_enabled": "true", "riot_paths": r"C:\Riot Games",
    "riot_products": "League of Legends|league_of_legends, VALORANT|valorant",
    "griddb_key": "",
    "feeds": "Hacker News | https://hnrss.org/frontpage", "feed_items": "12", "art_overrides": "",
    "wallpaper_dir": r"C:\Users\catal\Pictures\Wallpapers\Spans", "wallpaper_limit": "300",
    "wallhaven_atleast": "3440x2880", "wallhaven_key": "",
    "lhm_url": "http://localhost:8085/data.json",
    # Notes: the Obsidian vault, read and written in place.
    "notes_dir": r"C:\Users\vinti\Notes", "notes_limit": "300",
    # Homelab: "Label | url | port" per line. Falls back to the old hardcoded
    # three if left empty, so the view is never blank on first run.
    "services": "",
    "qbit_url": "", "qbit_user": "", "qbit_pass": "",
    "sonarr_url": "", "sonarr_key": "",
    "radarr_url": "", "radarr_key": "",
    "immich_url": "", "immich_key": "", "immich_album": "",
    "overseerr_url": "", "overseerr_key": "",
    # Additive data sources for the Homelab dashboard - neither replaces the
    # TCP-probe service grid, both are optional (Homelab degrades to
    # probe-only data if left empty).
    "netdata_url": "", "portainer_url": "", "portainer_token": "", "portainer_endpoint_id": "",
    "vda_dll": r"C:\Users\catal\Scripts\VirtualDesktopAccessor.dll",
    "calendar_ics": "",
    "screenshots_dir": str(Path.home() / "Pictures" / "Screenshots"),
    "downloads_dir": str(Path.home() / "Downloads"),
    "accent_override": "", "reduced_motion": "false", "sidebar_default_collapsed": "false",
    "default_app": "overview",
    "background_mode": "wallpaper", "background_color": "#0b0d12", "background_image": "",
}

INTERVALS = {
    "media": 2, "hardware": 4, "lights": 10, "plex": 30,
    "weather": 900, "games": 600, "wallpapers": 60, "feeds": 900,
    "homelab": 15, "downloads": 8, "upcoming": 900, "notes": 20, "ui": 5, "tasks": 10,
    "photo": 20, "popular": 1800, "audio": 15, "desktops": 3, "calendar": 900,
    "files": 20, "reading": 900,
}

WEATHER_CODES = {
    0: ("Clear", "clear"), 1: ("Mainly clear", "clear"), 2: ("Partly cloudy", "cloud"), 3: ("Overcast", "cloud"),
    45: ("Fog", "fog"), 48: ("Freezing fog", "fog"), 51: ("Light drizzle", "rain"), 53: ("Drizzle", "rain"),
    61: ("Light rain", "rain"), 63: ("Rain", "rain"), 65: ("Heavy rain", "rain"), 71: ("Light snow", "snow"),
    80: ("Showers", "rain"), 95: ("Thunderstorm", "storm"),
}

SETTINGS_SCHEMA = [
    {"group": "You", "keys": [
        {"key": "_profile_name", "label": "Name", "type": "text", "hint": "Shown in the greeting"},
        {"key": "_profile_photo", "label": "Photo", "type": "image"},
        {"key": "place", "label": "Place", "type": "text"},
        {"key": "latitude", "label": "Latitude", "type": "text"},
        {"key": "longitude", "label": "Longitude", "type": "text"},
        {"key": "units", "label": "Temperature", "type": "select",
         "options": ["celsius", "fahrenheit"]},
        {"key": "_profile_theme", "label": "Theme", "type": "select",
         "options": ["dark", "light"]},
        {"key": "calendar_ics", "label": "Calendar (ICS)", "type": "text",
         "hint": "Google Calendar: Settings → your calendar → Integrate calendar → 'Secret address "
                 "in iCal format' (has a private-… token). The plain 'public/basic.ics' link 404s "
                 "unless you've made the whole calendar public."},
    ]},
    {"group": "Interface", "keys": [
        {"key": "accent_override", "label": "Accent colour", "type": "text",
         "hint": "#rrggbb — leave blank to follow your current wallpaper automatically"},
        {"key": "sidebar_default_collapsed", "label": "Collapse sidebar by default", "type": "bool"},
        {"key": "reduced_motion", "label": "Reduce motion", "type": "bool",
         "hint": "Turns off decorative animation across the app (charts, transitions, hover motion)"},
        {"key": "default_app", "label": "Open on launch", "type": "select",
         "options": ["overview", "games", "scene", "notes", "plex", "reading", "homelab"],
         "hint": "Which application is showing the moment Control Center starts"},
        {"key": "background_mode", "label": "App background", "type": "select",
         "options": ["wallpaper", "color", "image"],
         "hint": "Wallpaper (default, follows Scene) — Color (flat) — Image (a picture you choose)"},
        {"key": "background_color", "label": "Background colour", "type": "text",
         "hint": "#rrggbb — used when App background is set to Color"},
        {"key": "background_image", "label": "Background image", "type": "image",
         "hint": "Used when App background is set to Image"},
    ]},
    {"group": "Lights", "keys": [
        {"key": "ha_url", "label": "Home Assistant", "type": "text"},
        {"key": "panel_lights", "label": "Entities to show", "type": "text",
         "hint": "Comma separated"},
    ]},
    {"group": "Plex", "keys": [
        {"key": "plex_url", "label": "Server", "type": "text"},
        {"key": "plex_token", "label": "Token", "type": "secret",
         "hint": "X-Plex-Token from any Plex web URL"},
        {"key": "plex_open", "label": "Open items in", "type": "select",
         "options": ["app", "web"]},
        {"key": "plex_limit", "label": "Items per library", "type": "number"},
    ]},
    {"group": "Games", "keys": [
        {"key": "griddb_key", "label": "SteamGridDB key", "type": "secret",
         "hint": "Free from steamgriddb.com/profile/preferences/api — this is what fills in Diablo, LoL and VALORANT covers"},
        {"key": "steam_path", "label": "Steam folder", "type": "folder"},
        {"key": "art_overrides", "label": "Manual covers", "type": "lines",
         "hint": "Game name | image url"},
        {"key": "games_ignore", "label": "Ignore app ids", "type": "text"},
        {"key": "xbox_enabled", "label": "Scan Xbox games", "type": "bool"},
        {"key": "battlenet_enabled", "label": "Scan Battle.net", "type": "bool"},
        {"key": "battlenet_paths", "label": "Battle.net folder", "type": "folder"},
        {"key": "riot_enabled", "label": "Scan Riot", "type": "bool"},
        {"key": "riot_paths", "label": "Riot folder", "type": "folder"},
    ]},
    {"group": "Scene", "keys": [
        {"key": "wallpaper_dir", "label": "Wallpaper folder", "type": "folder"},
        {"key": "wallpaper_limit", "label": "Thumbnails to load", "type": "number"},
        {"key": "wallhaven_atleast", "label": "Minimum resolution", "type": "text"},
        {"key": "wallhaven_key", "label": "Wallhaven key", "type": "secret",
         "hint": "Only needed for NSFW results"},
    ]},
    {"group": "Notes", "keys": [
        {"key": "notes_dir", "label": "Vault folder", "type": "folder",
         "hint": "Edited in place — the same files Obsidian opens"},
    ]},
    {"group": "Reading", "keys": [
        {"key": "feeds", "label": "Feeds", "type": "lines",
         "hint": "Label | feed url. YouTube channels work as https://www.youtube.com/feeds/videos.xml?channel_id=…"},
        {"key": "feed_items", "label": "Items per feed", "type": "number"},
    ]},
    {"group": "Homelab", "keys": [
        {"key": "immich_url", "label": "Immich", "type": "text",
         "hint": "Server root, e.g. https://photos.example.com — not an /albums/… link from the browser"},
        {"key": "immich_key", "label": "Immich API key", "type": "secret",
         "hint": "Immich > Account Settings > API Keys"},
        {"key": "immich_album", "label": "Album id", "type": "text",
         "hint": "Optional. Leave empty to pull from your whole library"},
        {"key": "overseerr_url", "label": "Overseerr", "type": "text"},
        {"key": "overseerr_key", "label": "Overseerr API key", "type": "secret",
         "hint": "Overseerr > Settings > General > API Key"},
        {"key": "services", "label": "Services", "type": "lines",
         "hint": "Label | url | port | group   (groups: home, media, network, infra)"},
        {"key": "qbit_url", "label": "qBittorrent", "type": "text"},
        {"key": "qbit_user", "label": "qBittorrent user", "type": "text"},
        {"key": "qbit_pass", "label": "qBittorrent password", "type": "secret"},
        {"key": "sonarr_url", "label": "Sonarr", "type": "text"},
        {"key": "sonarr_key", "label": "Sonarr key", "type": "secret"},
        {"key": "radarr_url", "label": "Radarr", "type": "text"},
        {"key": "radarr_key", "label": "Radarr key", "type": "secret"},
        {"key": "netdata_url", "label": "Netdata", "type": "text",
         "hint": "Server root, e.g. http://192.168.1.53:19999 — powers live host CPU/RAM/disk/network graphs"},
        {"key": "portainer_url", "label": "Portainer", "type": "text",
         "hint": "Server root, e.g. http://192.168.1.53:9000 — powers real container cards"},
        {"key": "portainer_token", "label": "Portainer access token", "type": "secret",
         "hint": "Portainer > My account > Access tokens"},
        {"key": "portainer_endpoint_id", "label": "Portainer environment id", "type": "text",
         "hint": "Optional. Leave empty to use the first Docker environment Portainer manages"},
    ]},
    {"group": "Machine", "keys": [
        {"key": "lhm_url", "label": "LibreHardwareMonitor", "type": "text",
         "hint": "The only way to read CPU temperature on Windows"},
        {"key": "vda_dll", "label": "VirtualDesktopAccessor.dll", "type": "text",
         "hint": "Powers the virtual desktop switcher"},
    ]},
    {"group": "Files", "keys": [
        {"key": "screenshots_dir", "label": "Screenshots folder", "type": "folder"},
        {"key": "downloads_dir", "label": "Downloads folder", "type": "folder"},
    ]},
]

SECRET_KEYS = {"plex_token", "griddb_key", "wallhaven_key",
               "qbit_pass", "sonarr_key", "radarr_key", "portainer_token"}

# Where each setting came from, so --diag can prove it rather than guess.
CONFIG_ORIGIN = {}

def read_config_file():
    """Just the [panel] section of config.ini, or {} plus a reason."""
    if not CONFIG_FILE.exists():
        return {}, "no config.ini (that's fine now, settings live in the panel)"
    cfg = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
    try:
        cfg.read(CONFIG_FILE)
    except Exception as e:
        return {}, f"config.ini could not be parsed: {type(e).__name__}: {e}"
    if not cfg.has_section("panel"):
        return {}, "config.ini has no [panel] section"
    return {k: v for k, v in cfg["panel"].items()}, None

def load_config():
    """DEFAULTS < config.ini < the panel's own settings.

    Settings edited in the panel win, always. config.ini is now only ever read,
    never written, and is optional - it exists so nothing you'd already set up
    is lost. This is the fix for pasting a block of keys into config.ini and
    silently losing the ones the block didn't mention.
    """
    CONFIG_ORIGIN.clear()
    merged = dict(DEFAULTS)
    for k in merged: CONFIG_ORIGIN[k] = "default"

    from_file, problem = read_config_file()
    CONFIG_ORIGIN["_file_problem"] = problem
    for k, v in from_file.items():
        merged[k] = v
        CONFIG_ORIGIN[k] = "config.ini"

    for k, v in (load_store().get("settings") or {}).items():
        if v is None: continue
        merged[k] = str(v)
        CONFIG_ORIGIN[k] = "panel"
    return merged

def load_token():
    try: return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except Exception: return ""

def truthy(value): return str(value).strip().lower() in {"1", "true", "yes", "on"}
def csv_list(value): return [v.strip() for v in str(value).split(",") if v.strip()]

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

def collect_weather(cfg, _shared):
    unit = "fahrenheit" if cfg["units"].strip().lower().startswith("f") else "celsius"
    r = requests.get("https://api.open-meteo.com/v1/forecast", timeout=10, params={
        "latitude": cfg["latitude"], "longitude": cfg["longitude"],
        "current": "temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "temperature_unit": unit, "timezone": "auto", "forecast_days": "4",
    })
    r.raise_for_status()
    data = r.json()
    now = data.get("current", {})
    daily = data.get("daily", {})
    code = int(now.get("weather_code") or 0)
    label, icon = WEATHER_CODES.get(code, ("\u2014", "cloud"))
    days = []
    for i, date in enumerate((daily.get("time") or [])[:4]):
        d_code = int((daily.get("weather_code") or [0])[i] or 0)
        days.append({"date": date, "label": datetime.fromisoformat(date).strftime("%a"),
                     "high": round((daily.get("temperature_2m_max") or [0])[i]),
                     "low": round((daily.get("temperature_2m_min") or [0])[i]),
                     "icon": WEATHER_CODES.get(d_code, ("", "cloud"))[1]})
    return {"place": cfg["place"], "temp": round(now.get("temperature_2m", 0)),
            "feels": round(now.get("apparent_temperature", 0)), "humidity": round(now.get("relative_humidity_2m", 0)),
            "wind": round(now.get("wind_speed_10m", 0)), "label": label, "icon": icon,
            "unit": "F" if unit == "fahrenheit" else "C", "days": days}

_art_cache = {"key": None, "data": None}
def _media_imports():
    try:
        from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager
        from winrt.windows.storage.streams import DataReader
        return MediaManager, DataReader
    except ImportError:
        from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager
        from winsdk.windows.storage.streams import DataReader
        return MediaManager, DataReader

async def _media_candidates(manager):
    candidates = []
    try:
        sessions = manager.get_sessions()
        size = getattr(sessions, "size", None)
        if size is None: size = len(sessions)
        for i in range(int(size)): candidates.append(sessions.get_at(i))
    except Exception:
        try: candidates = list(manager.get_sessions())
        except Exception: candidates = []
    current = manager.get_current_session()
    if current is not None and current not in candidates: candidates.append(current)
    return candidates

async def _media_best(candidates):
    """The same picking logic backs both the display and the transport
    controls, so play/pause/skip always act on whatever the panel is
    actually showing you - not whatever Windows separately calls 'current',
    which can be a different app than the one with a title on screen."""
    best, best_score, best_props = None, -1, None
    for candidate in candidates:
        try: props = await candidate.try_get_media_properties_async()
        except Exception: continue
        if props is None or not (props.title or "").strip(): continue
        status = 0
        try: status = int(getattr(candidate.get_playback_info(), "playback_status", 0) or 0)
        except Exception: pass
        score = 2 if status == 4 else 1
        if score > best_score: best, best_score, best_props = candidate, score, props
    return best, best_score, best_props

async def _media_snapshot():
    MediaManager, DataReader = _media_imports()
    manager = await MediaManager.request_async()
    candidates = await _media_candidates(manager)
    if not candidates: return {"title": None, "sessions": 0}

    best, best_score, best_props = await _media_best(candidates)
    if best is None:
        return {"title": None, "sessions": len(candidates), "apps": [str(c.source_app_user_model_id or "?") for c in candidates]}

    session, props = best, best_props
    timeline = session.get_timeline_properties()
    out = {"title": props.title or "", "artist": props.artist or "", "album": props.album_title or "",
           "app": session.source_app_user_model_id or "", "playing": best_score == 2, "sessions": len(candidates),
           "position": 0, "duration": 0, "art": None}
    try:
        pos = timeline.position.total_seconds()
        end = timeline.end_time.total_seconds()
        if end > 0: out["position"], out["duration"] = int(pos), int(end)
    except Exception: pass

    key = f"{out['artist']}|{out['album']}|{out['title']}"
    if _art_cache["key"] == key:
        out["art"] = _art_cache["data"]
    elif props.thumbnail:
        try:
            stream = await props.thumbnail.open_read_async()
            reader = DataReader(stream)
            await reader.load_async(stream.size)
            raw = bytes(reader.read_buffer(stream.size)) if hasattr(reader, "read_buffer") else bytes(reader.read_bytes(stream.size))
            encoded = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
            _art_cache.update(key=key, data=encoded)
            out["art"] = encoded
        except Exception: _art_cache.update(key=key, data=None)
    return out

def collect_media(_cfg, _shared):
    try: return asyncio.run(_media_snapshot()) or {"title": None}
    except Exception as e: return {"title": None, "error": str(e)[:120]}

async def _media_control(action, position=None):
    MediaManager, _ = _media_imports()
    manager = await MediaManager.request_async()
    candidates = await _media_candidates(manager)
    if not candidates: return {"ok": False, "error": "nothing is playing"}
    session, _score, _props = await _media_best(candidates)
    if session is None: return {"ok": False, "error": "nothing is playing"}

    if action == "toggle": await session.try_toggle_play_pause_async()
    elif action == "play": await session.try_play_async()
    elif action == "pause": await session.try_pause_async()
    elif action == "next": await session.try_skip_next_async()
    elif action == "prev": await session.try_skip_previous_async()
    elif action == "seek":
        # WinRT TimeSpan is 100ns ticks; the panel sends whole seconds.
        await session.try_change_playback_position_async(int((position or 0) * 10_000_000))
    else:
        return {"ok": False, "error": "unknown action"}
    return {"ok": True}

def media_control(action, position=None):
    try: return asyncio.run(_media_control(action, position))
    except Exception as e: return {"ok": False, "error": str(e)[:140]}


# ──────────────────────────────────────────────
#  AUDIO - system volume and output device
# ──────────────────────────────────────────────

def _audio_endpoint():
    from pycaw.pycaw import AudioUtilities
    return AudioUtilities.GetSpeakers().EndpointVolume

def collect_audio(_cfg, _shared):
    try:
        ev = _audio_endpoint()
        volume = round(ev.GetMasterVolumeLevelScalar() * 100)
        muted = bool(ev.GetMute())
    except Exception as e:
        return {"error": str(e)[:140], "devices": []}

    devices = []
    try:
        # AudioDeviceCmdlets, not raw COM - switching the *default* endpoint
        # goes through an undocumented interface (IPolicyConfig) with a
        # vtable that varies by Windows build, which is a bad thing to get
        # wrong blind. This PowerShell module already does it correctly.
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' } | "
             "Select-Object Index,Name,Default | ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        raw = json.loads(out.stdout or "[]")
        if isinstance(raw, dict): raw = [raw]
        devices = [{"index": d.get("Index"), "name": d.get("Name"), "default": bool(d.get("Default"))}
                   for d in raw if d.get("Index") is not None]
    except Exception:
        pass
    return {"volume": volume, "muted": muted, "devices": devices}

def set_volume_level(percent):
    ev = _audio_endpoint()
    ev.SetMasterVolumeLevelScalar(max(0, min(100, int(percent))) / 100, None)

def set_mute(muted):
    ev = _audio_endpoint()
    ev.SetMute(1 if muted else 0, None)

def set_audio_device(index):
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command",
         f"Set-AudioDevice -Index {int(index)}"],
        capture_output=True, text=True, timeout=8,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _walk_lhm(node, found):
    text = (node.get("Text") or "").strip()
    value = (node.get("Value") or "").strip()
    if text and value: found.append((text, value))
    for child in node.get("Children") or []: _walk_lhm(child, found)

def _lhm_number(value):
    match = re.search(r"-?\d+(?:[.,]\d+)?", value or "")
    return float(match.group().replace(",", ".")) if match else None

_prev_disk_io = {}

def collect_hardware(cfg, _shared):
    out = {"cpu_temp": None, "cpu_load": None, "gpu_temp": None,
           "gpu_load": None, "ram_used": None, "ram_total": None, "ram_pct": None,
           "vram_used": None, "vram_total": None, "uptime": None, "disk_io": []}
    try:
        import psutil
        out["cpu_load"] = round(psutil.cpu_percent(interval=None))
        mem = psutil.virtual_memory()
        out["ram_used"] = round(mem.used / 1024 ** 3, 1)
        out["ram_total"] = round(mem.total / 1024 ** 3, 1)
        out["ram_pct"] = round(mem.used / mem.total * 100) if mem.total else None
        out["uptime"] = int(time.time() - psutil.boot_time())
        disks = []
        for part in psutil.disk_partitions(all=False):
            if "cdrom" in (part.opts or "") or not part.fstype: continue
            try: usage = psutil.disk_usage(part.mountpoint)
            except OSError: continue
            disks.append({"drive": part.device.rstrip("\\"), "used": round(usage.used / 1024 ** 3),
                          "total": round(usage.total / 1024 ** 3), "pct": round(usage.percent)})
        out["disks"] = disks
    except Exception: pass

    # Real per-drive read/write throughput (KiB/s) - psutil only reports
    # cumulative byte counters, so the rate is a delta against the last
    # poll (same idea Netdata's own disk_io chart uses), recorded into the
    # same in-memory history ring buffer everything else on this machine
    # already uses.
    try:
        now_t = time.time()
        disk_io = []
        for device, counters in psutil.disk_io_counters(perdisk=True).items():
            prev = _prev_disk_io.get(device)
            _prev_disk_io[device] = (counters.read_bytes, counters.write_bytes, now_t)
            if not prev: continue
            prev_read, prev_write, prev_t = prev
            dt = now_t - prev_t
            if dt <= 0: continue
            read_kibs = round(max(0, counters.read_bytes - prev_read) / 1024 / dt, 1)
            write_kibs = round(max(0, counters.write_bytes - prev_write) / 1024 / dt, 1)
            _record_metric(f"local_dio_r_{device}", read_kibs)
            _record_metric(f"local_dio_w_{device}", write_kibs)
            reads = _metric_series(f"local_dio_r_{device}")
            writes = _metric_series(f"local_dio_w_{device}")
            if not any(r["v"] for r in reads) and not any(w["v"] for w in writes): continue
            history = [{"t": r["t"], "read": r["v"], "write": writes[i]["v"] if i < len(writes) else 0} for i, r in enumerate(reads)]
            disk_io.append({"device": device, "read_kibs": read_kibs, "write_kibs": write_kibs, "history": history})
        disk_io.sort(key=lambda d: -(d["read_kibs"] + d["write_kibs"]))
        out["disk_io"] = disk_io[:3]
    except Exception: pass

    try:
        import pynvml
        pynvml.nvmlInit()
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            out["gpu_temp"] = pynvml.nvmlDeviceGetTemperature(handle, 0)
            out["gpu_load"] = pynvml.nvmlDeviceGetUtilizationRates(handle).gpu
            vram = pynvml.nvmlDeviceGetMemoryInfo(handle)
            out["vram_used"] = round(vram.used / 1024 ** 3, 1)
            out["vram_total"] = round(vram.total / 1024 ** 3, 1)
        finally: pynvml.nvmlShutdown()
    except Exception: pass

    # This machine's own trend, not the remote homelab server's (Netdata
    # already retains that separately, see the METRIC HISTORY note below) -
    # the "few numbers nothing else already retains" case that mechanism is
    # meant for, just fed from psutil/pynvml instead of a Netdata poll.
    _record_metric("local_cpu_load", out["cpu_load"])
    _record_metric("local_ram_pct", out["ram_pct"])
    _record_metric("local_gpu_load", out["gpu_load"])
    out["cpu_history"] = _metric_series("local_cpu_load")
    out["ram_history"] = _metric_series("local_ram_pct")
    out["gpu_history"] = _metric_series("local_gpu_load")

    try:
        r = requests.get(cfg["lhm_url"], timeout=3)
        found = []
        _walk_lhm(r.json(), found)
        temps = [(label, value) for label, value in found if "°" in value]
        wanted = ("cpu package", "core (tctl", "core average", "cpu die", "core max", "package", "cpu core", "cpu total")
        for needle in wanted:
            if out["cpu_temp"] is not None: break
            for label, value in temps:
                if needle in label.lower():
                    out["cpu_temp"] = round(_lhm_number(value) or 0) or None
                    break
        out["lhm"] = True
    except Exception:
        out["lhm"] = False

    if out["cpu_temp"] is None:
        try:
            import wmi
            w = wmi.WMI(namespace="root\\wmi")
            temperature_info = w.MSAcpi_ThermalZoneTemperature()
            if temperature_info:
                temp_c = round((temperature_info[0].CurrentTemperature - 2732) / 10.0)
                if 10 <= temp_c <= 115: out["cpu_temp"] = temp_c
        except Exception: pass

    return out


# ──────────────────────────────────────────────
#  VIRTUAL DESKTOPS - the same DLL shortcuts.ahk already drives
# ──────────────────────────────────────────────

_vda = {"dll": None, "path": None}

def _vda_dll(cfg):
    """Talks to VirtualDesktopAccessor.dll directly via ctypes rather than
    going through the running AHK script - it's a plain DLL with no IPC of
    its own, and shortcuts.ahk never added one, so this loads a second,
    independent handle to the same DLL rather than trying to bolt an IPC
    channel onto a script that's already doing its job."""
    path = str(cfg["vda_dll"]).strip()
    if not path: return None
    if _vda["dll"] is not None and _vda["path"] == path:
        return _vda["dll"]
    try:
        dll = ctypes.WinDLL(path)
        dll.GetDesktopCount()  # prove the export table is what we expect before trusting it
    except Exception:
        return None
    _vda.update(dll=dll, path=path)
    return dll

def collect_desktops(cfg, _shared):
    dll = _vda_dll(cfg)
    if not dll: return {"configured": False}
    try:
        return {"configured": True, "count": int(dll.GetDesktopCount()),
                "current": int(dll.GetCurrentDesktopNumber()) + 1}   # 1-indexed for display
    except Exception as e:
        return {"configured": True, "error": str(e)[:140]}

class _RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

class _MONITORINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", _RECT),
                ("rcWork", _RECT), ("dwFlags", ctypes.c_ulong)]

_MONITOR_DEFAULTTONEAREST = 2
_MONITORINFOF_PRIMARY = 1
_EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

def _pin_non_primary_windows(dll):
    """Windows virtual desktops are one global concept, not per-monitor -
    switching desktops hides every window that isn't on the new one, on
    every monitor at once, unless a window is pinned (visible on all
    desktops). shortcuts.ahk already solves exactly this for its own
    top-monitor workaround by pinning whatever sits on the secondary
    monitor before every switch (see UpdateTopMonitorWindows in that
    script) - this does the same thing, generalized to "not the primary
    monitor" instead of a hardcoded screen position, so a switch triggered
    from the panel (which itself lives on the secondary monitor) doesn't
    drag that monitor's windows along with it."""
    try:
        user32 = ctypes.windll.user32
        pin = dll.PinWindow
        pin.argtypes = [ctypes.c_void_p]

        def callback(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd): return True
            rect = _RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)): return True
            if rect.right <= rect.left or rect.bottom <= rect.top: return True
            mon = user32.MonitorFromWindow(hwnd, _MONITOR_DEFAULTTONEAREST)
            info = _MONITORINFO()
            info.cbSize = ctypes.sizeof(_MONITORINFO)
            if not user32.GetMonitorInfoW(mon, ctypes.byref(info)): return True
            if not (info.dwFlags & _MONITORINFOF_PRIMARY):
                try: pin(hwnd)
                except Exception: pass
            return True

        user32.EnumWindows(_EnumWindowsProc(callback), 0)
    except Exception:
        pass

def go_to_desktop(cfg, n):
    dll = _vda_dll(cfg)
    if not dll: return False
    try:
        _pin_non_primary_windows(dll)
        dll.GoToDesktopNumber(max(0, int(n) - 1))
        return True
    except Exception:
        return False

DEFAULT_SERVICES = """
Home Assistant | https://ha.vinti.cloud | 8123 | home
Plex | http://192.168.1.53:32400/web | 32400 | media
Overseerr | https://serr.vinti.cloud | 5055 | media
Sonarr | http://192.168.1.53:8989 | 8989 | media
Radarr | http://192.168.1.53:7878 | 7878 | media
Prowlarr | http://192.168.1.53:9696 | 9696 | media
Bazarr | http://192.168.1.53:6767 | 6767 | media
qBittorrent | http://192.168.1.53:8080 | 8080 | media
AdGuard Home | http://192.168.1.53:3000 | 3000 | network
Nginx Proxy Manager | http://192.168.1.53:81 | 81 | network
Portainer | http://192.168.1.53:9000 | 9000 | infra
Immich | http://192.168.1.53:2283 | 2283 | infra
Homarr | http://192.168.1.53:7575 | 7575 | infra
Glance | http://192.168.1.53:8080 | 8081 | infra
Portfolio | https://catalinvintila.design | 8090 | infra
"""

GROUP_ORDER = ["home", "media", "network", "infra", "other"]

def _service_lines(cfg):
    raw = str(cfg.get("services") or "").strip() or DEFAULT_SERVICES
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or "|" not in line: continue
        parts = [p.strip() for p in line.split("|")]
        name, url = parts[0], parts[1] if len(parts) > 1 else ""
        try: port = int(parts[2]) if len(parts) > 2 and parts[2] else None
        except ValueError: port = None
        group = (parts[3].lower() if len(parts) > 3 and parts[3] else "other")
        if name and port: out.append({"name": name, "url": url, "port": port, "group": group})
    return out

def _probe(host, port, timeout=1.2):
    """Latency as well as up/down - a service that answers in 900ms is a
    different kind of fine than one that answers in 4."""
    began = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, round((time.monotonic() - began) * 1000)
    except Exception:
        return False, None


# ──────────────────────────────────────────────
#  METRIC HISTORY - a small in-memory ring buffer for the few numbers
#  nothing else already retains (service latency, up-count, qBittorrent
#  throughput). Deliberately NOT used for host CPU/RAM/disk/network -
#  Netdata already retains that history server-side (see below), so
#  re-recording it here would just be a second, laggier copy of the same
#  numbers. Process-memory only (not persisted) - a backend restart loses
#  the last ~45 minutes, same tradeoff every other in-memory collector
#  state in this file already makes.
# ──────────────────────────────────────────────

_METRIC_HISTORY_MAXLEN = 180  # ~45 min at the homelab collector's 15s cadence
_metric_history = {}

def _record_metric(key, value):
    if value is None: return
    _metric_history.setdefault(key, deque(maxlen=_METRIC_HISTORY_MAXLEN)).append(
        {"t": time.time(), "v": value})

def _metric_series(key):
    return list(_metric_history.get(key, ()))


# ──────────────────────────────────────────────
#  NETDATA - live + historical metrics for the actual homelab server.
#  collect_hardware (psutil/pynvml) reports THIS machine's stats, not
#  the server's - Netdata is the only thing in this file that ever
#  talks to the server's own resource usage. A pure read-only REST
#  client against Netdata's own chart retention, so no ring buffer of
#  our own is needed for these values. Every metric block is its own
#  try/except - Netdata's exact chart ids/dimensions vary by version and
#  by what's actually monitored on that box, so one missing chart (no
#  temperature sensor wired up, say) degrades to "no data for that
#  metric" rather than losing CPU/RAM/disk/network too.
# ──────────────────────────────────────────────

_netdata_charts_cache = {"at": 0.0, "charts": None}

def _netdata_get(cfg, path, **params):
    base = str(cfg.get("netdata_url") or "").strip().rstrip("/")
    if not base: return None
    r = requests.get(f"{base}{path}", params=params, timeout=3)
    r.raise_for_status()
    return r.json()

def _netdata_charts(cfg):
    """Which chart ids exist (disk mount, temperature sensor, ...) is
    environment-specific - discovered once and cached for 5 minutes
    rather than re-listing on every 15s poll."""
    cache = _netdata_charts_cache
    if cache["charts"] is not None and time.monotonic() - cache["at"] < 300:
        return cache["charts"]
    try:
        data = _netdata_get(cfg, "/api/v1/charts") or {}
        charts = data.get("charts") or {}
    except Exception:
        charts = cache["charts"] or {}
    cache.update(at=time.monotonic(), charts=charts)
    return charts

def _netdata_series(cfg, chart, after=-1800, points=90):
    """One chart's recent history as [{"t", "v": {dimension: value}}],
    oldest first, or None if the chart doesn't exist / isn't reachable."""
    if not chart: return None
    try:
        data = _netdata_get(cfg, "/api/v1/data", chart=chart, after=after, points=points,
                            format="json", group="average")
        labels = (data or {}).get("labels") or []
        rows = (data or {}).get("data") or []
    except Exception:
        return None
    if not labels or not rows: return None
    out = []
    # Netdata's /api/v1/data returns rows newest-first - reversed here so
    # every consumer of this function actually gets what the docstring
    # above promises (oldest first / chronological), instead of each
    # chart having to know to undo Netdata's own ordering itself.
    for row in reversed(rows):
        if not row: continue
        point = dict(zip(labels, row))
        ts = point.pop(labels[0], None)
        if ts is None: continue
        out.append({"t": ts, "v": point})
    return out or None

def collect_netdata_metrics(cfg):
    if not str(cfg.get("netdata_url") or "").strip():
        return {"configured": False}
    out = {"configured": True}
    charts = _netdata_charts(cfg)

    try:
        cpu = _netdata_series(cfg, "system.cpu")
        if cpu:
            def used_pct(point): return round(sum(v for k, v in point.items() if k != "idle" and v is not None), 1)
            out["cpu"] = {"pct": used_pct(cpu[-1]["v"]),
                          "history": [{"t": p["t"], "v": used_pct(p["v"])} for p in cpu]}
    except Exception: pass

    try:
        ram = _netdata_series(cfg, "system.ram")
        if ram:
            def ram_pct(point):
                total = sum(v for v in point.values() if v is not None)
                used = point.get("used")
                return round(used / total * 100, 1) if total and used is not None else None
            latest = ram[-1]["v"]
            total_mb = sum(v for v in latest.values() if v is not None)
            out["ram"] = {"pct": ram_pct(latest),
                          "used_gb": round((latest.get("used") or 0) / 1024, 1),
                          "total_gb": round(total_mb / 1024, 1) if total_mb else None,
                          "history": [{"t": p["t"], "v": ram_pct(p["v"])} for p in ram if ram_pct(p["v"]) is not None]}
    except Exception: pass

    # Every real mounted filesystem Netdata tracks, not just one "shortest
    # match" guess - a box with a separate data volume (the common
    # homelab shape: a small OS disk plus a big media/storage disk) gets
    # a real per-mount reading for each, not just whichever mount Netdata
    # happened to chart first. tmpfs-ish /run and anything under 4GB
    # total (stray /boot partitions etc.) are filtered out as noise, not
    # because they're being hidden - they're just not "a drive" in any
    # sense a person cares about here.
    try:
        disks = []
        for cid in charts:
            if not cid.startswith("disk_space."): continue
            mount = cid[len("disk_space."):]
            if mount == "/run": continue
            series = _netdata_series(cfg, cid, points=60)
            if not series: continue
            def disk_pct(point):
                used, avail = point.get("used"), point.get("avail")
                total = (used or 0) + (avail or 0)
                return round(used / total * 100, 1) if total and used is not None else None
            latest = series[-1]["v"]
            total_gb = (latest.get("used") or 0) + (latest.get("avail") or 0)
            if total_gb < 4: continue
            disks.append({
                "mount": mount, "pct": disk_pct(latest),
                "used_gb": round(latest.get("used") or 0, 1), "total_gb": round(total_gb, 1),
                "history": [{"t": p["t"], "v": disk_pct(p["v"])} for p in series if disk_pct(p["v"]) is not None],
            })
        disks.sort(key=lambda d: -d["total_gb"])
        out["disks"] = disks[:4]
    except Exception: pass

    # Real per-device read/write throughput (KiB/s) - the genuinely live
    # "drive activity" number a capacity bar can never show. A device
    # that saw zero I/O across the whole window (an unused/empty disk)
    # doesn't get a slot - not a fabricated flat line.
    try:
        disk_io = []
        for cid in charts:
            if not cid.startswith("disk."): continue
            device = cid[len("disk."):]
            # device-mapper/LVM volumes (dm-N) double-count the same I/O
            # their underlying physical device already reports - real
            # activity, just not a second real drive.
            if device.startswith("dm-"): continue
            series = _netdata_series(cfg, cid, points=60)
            if not series: continue
            latest = series[-1]["v"]
            read_kibs = round(abs(latest.get("reads") or 0), 1)
            write_kibs = round(abs(latest.get("writes") or 0), 1)
            history = [{"t": p["t"], "read": round(abs(p["v"].get("reads") or 0), 1),
                        "write": round(abs(p["v"].get("writes") or 0), 1)} for p in series]
            if not any(h["read"] or h["write"] for h in history): continue
            disk_io.append({"device": device, "read_kibs": read_kibs, "write_kibs": write_kibs, "history": history})
        disk_io.sort(key=lambda d: -(d["read_kibs"] + d["write_kibs"]))
        out["disk_io"] = disk_io[:3]
    except Exception: pass

    try:
        net = _netdata_series(cfg, "system.net")
        if net:
            latest = net[-1]["v"]
            out["net"] = {"in_kbps": round(abs(latest.get("received") or 0), 1),
                          "out_kbps": round(abs(latest.get("sent") or 0), 1),
                          "history": [{"t": p["t"], "in": round(abs(p["v"].get("received") or 0), 1),
                                       "out": round(abs(p["v"].get("sent") or 0), 1)} for p in net]}
    except Exception: pass

    try:
        # "shortest match containing temperature" used to land on
        # sensors.temperature_histogram (a bucket histogram, not a reading -
        # every value came back 0). Real per-sensor charts all end in
        # _input (as opposed to _alarm, a 0/1 threshold state); among
        # those, prefer the CPU package sensor since that's the one
        # reading someone actually means by "the machine's temperature".
        temp_candidates = [cid for cid in charts if "temperature" in cid.lower() and cid.lower().endswith("_input")]
        def _temp_rank(cid):
            low = cid.lower()
            if "coretemp" in low and "package" in low: return (0, len(cid))
            if "coretemp" in low: return (1, len(cid))
            return (2, len(cid))
        temp_candidates.sort(key=_temp_rank)
        temp_chart = temp_candidates[0] if temp_candidates else None
        temp = _netdata_series(cfg, temp_chart, points=60) if temp_chart else None
        if temp:
            def first_val(point):
                vals = [v for v in point.values() if v is not None]
                return round(vals[0], 1) if vals else None
            out["temp"] = {"c": first_val(temp[-1]["v"]),
                           "history": [{"t": p["t"], "v": first_val(p["v"])} for p in temp if first_val(p["v"]) is not None]}
    except Exception: pass

    return out


# ──────────────────────────────────────────────
#  PORTAINER - real Docker container state, additive to (not a
#  replacement for) the TCP-probe service grid below. Uses a static
#  Portainer access token (Portainer > My account > Access tokens), not
#  the username/password JWT flow - simpler and it's exactly what a
#  read-only dashboard integration should hold.
# ──────────────────────────────────────────────

_portainer_endpoint_cache = {"at": 0.0, "id": None, "base": None, "token": None}

def _portainer_get(cfg, path, **params):
    base = str(cfg.get("portainer_url") or "").strip().rstrip("/")
    token = str(cfg.get("portainer_token") or "").strip()
    if not base or not token: return None
    r = requests.get(f"{base}{path}", headers={"X-API-Key": token}, params=params, timeout=4)
    r.raise_for_status()
    return r.json()

def _portainer_endpoint_id(cfg):
    configured = str(cfg.get("portainer_endpoint_id") or "").strip()
    if configured: return configured
    base = str(cfg.get("portainer_url") or "").strip()
    token = str(cfg.get("portainer_token") or "").strip()
    cache = _portainer_endpoint_cache
    if cache["id"] and cache["base"] == base and cache["token"] == token and time.monotonic() - cache["at"] < 300:
        return cache["id"]
    try:
        endpoints = _portainer_get(cfg, "/api/endpoints") or []
        eid = endpoints[0]["Id"] if endpoints else None
    except Exception:
        eid = None
    cache.update(at=time.monotonic(), id=eid, base=base, token=token)
    return eid

def collect_docker_containers(cfg):
    base = str(cfg.get("portainer_url") or "").strip()
    token = str(cfg.get("portainer_token") or "").strip()
    if not base or not token:
        return {"configured": False, "containers": [], "running": 0, "total": 0}
    try:
        eid = _portainer_endpoint_id(cfg)
        if not eid:
            return {"configured": True, "error": "Portainer has no Docker environment to read",
                    "containers": [], "running": 0, "total": 0}
        rows = _portainer_get(cfg, f"/api/endpoints/{eid}/docker/containers/json", all="true") or []
        containers = []
        for c in rows:
            state = c.get("State") or "unknown"
            containers.append({
                "id": (c.get("Id") or "")[:12],
                "name": (c.get("Names") or ["?"])[0].lstrip("/"),
                "image": c.get("Image"), "state": state, "status": c.get("Status"),
            })
        containers.sort(key=lambda c: (c["state"] != "running", c["name"].lower()))
        running = sum(1 for c in containers if c["state"] == "running")
        return {"configured": True, "error": None, "containers": containers,
                "running": running, "total": len(containers)}
    except Exception as e:
        return {"configured": True, "error": str(e)[:160], "containers": [], "running": 0, "total": 0}


_NAME_NOISE_RE = re.compile(r"[\s\-_]+")

def _name_key(s):
    return _NAME_NOISE_RE.sub("", s or "").lower()

def collect_homelab(cfg, _shared):
    server_ip = "192.168.1.53"
    ssh_online, ssh_ms = _probe(server_ip, 22, 1.5)

    services = _service_lines(cfg)
    results = [None] * len(services)
    def check(i, svc):
        host = urlparse(svc["url"]).hostname if svc["url"].startswith("http") else None
        online, ms = _probe(server_ip, svc["port"])
        results[i] = {**svc, "online": online, "ms": ms, "host": host or server_ip}

    # Netdata and Portainer each make several outbound HTTP calls of their
    # own - run them as siblings of the service probes, not after them, and
    # cap the whole batch at one join timeout. collect_homelab runs
    # synchronously inside Snapshot.loop()'s single scheduling thread (see
    # Snapshot.loop), so if this function ran calls serially, a slow/down
    # Netdata or Portainer would stall every OTHER collector's cadence too,
    # not just this one's.
    netdata_box = {"value": {"configured": False}}
    def fetch_netdata(): netdata_box["value"] = collect_netdata_metrics(cfg)

    docker_box = {"value": {"configured": False, "containers": [], "running": 0, "total": 0}}
    def fetch_docker(): docker_box["value"] = collect_docker_containers(cfg)

    threads = [threading.Thread(target=check, args=(i, svc), daemon=True) for i, svc in enumerate(services)]
    threads.append(threading.Thread(target=fetch_netdata, daemon=True))
    threads.append(threading.Thread(target=fetch_docker, daemon=True))
    for t in threads: t.start()
    for t in threads: t.join(timeout=5)

    found = [r for r in results if r]

    # A service whose name matches a container's name gets that
    # container's live state attached - purely additive enrichment, the
    # TCP probe's "online" stays the source of truth for the status dot
    # either way (a container can be "running" while the app inside it
    # is still starting up and not yet answering its port).
    containers = docker_box["value"].get("containers") or []
    container_keys = [(c, _name_key(c["name"])) for c in containers]
    for svc in found:
        needle = _name_key(svc["name"])
        match = next((c for c, key in container_keys if needle and key and (needle in key or key in needle)), None)
        if match:
            svc["container"] = {"name": match["name"], "state": match["state"], "status": match["status"]}

    groups = []
    for name in GROUP_ORDER:
        members = [r for r in found if r["group"] == name]
        if members:
            groups.append({"group": name, "services": members,
                           "up": sum(1 for m in members if m["online"]), "count": len(members)})

    up, count = sum(1 for r in found if r["online"]), len(found)
    latencies = [r["ms"] for r in found if r["online"] and r["ms"] is not None]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    _record_metric("hl_up_count", up)
    _record_metric("hl_latency_ms", avg_latency)

    return {"server_ip": server_ip, "ssh_online": ssh_online, "ssh_ms": ssh_ms,
            "services": found, "groups": groups, "up": up, "count": count,
            "netdata": netdata_box["value"], "docker": docker_box["value"],
            "history": {"up_count": _metric_series("hl_up_count"),
                        "latency_ms": _metric_series("hl_latency_ms"),
                        "qbit_dl": _metric_series("qbit_dl"),
                        "qbit_up": _metric_series("qbit_up")}}


# ──────────────────────────────────────────────
#  NOTES - the Obsidian vault, live
# ──────────────────────────────────────────────

def notes_root(cfg):
    return Path(os.path.expandvars(str(cfg["notes_dir"]).strip()))

def note_path(cfg, wanted):
    """Resolve and prove it's inside the vault. This is the only place in the
    panel that writes files you care about, so nothing else gets to skip it."""
    root = notes_root(cfg).resolve()
    target = (root / str(wanted).lstrip("/\\")).resolve()
    if not str(target).startswith(str(root)): raise ValueError("outside the notes folder")
    if target.suffix.lower() not in (".md", ".markdown", ".txt"): raise ValueError("not a note")
    return target

def collect_notes(cfg, _shared):
    root = notes_root(cfg)
    if not root.is_dir():
        return {"dir": str(root), "notes": [], "error": "folder not found"}
    limit = int(cfg.get("notes_limit", "300"))
    # Pinning is a panel-store annotation, not vault content - Obsidian
    # owns these files, so "pinned" lives in store.json (same pattern as
    # wallpaper_favorites) rather than as invented frontmatter nothing
    # else would recognise.
    pinned_set = set(load_store().get("pinned_notes") or [])
    notes = []
    for path in root.rglob("*"):
        if path.suffix.lower() not in (".md", ".markdown", ".txt") or not path.is_file(): continue
        if any(part.startswith(".") for part in path.relative_to(root).parts): continue
        try: stat = path.stat()
        except OSError: continue
        preview = ""
        try:
            head = path.read_text(encoding="utf-8", errors="ignore")[:400]
            lines = [l.strip() for l in head.splitlines()
                     if l.strip() and not l.strip().startswith(("#", "---", "```"))]
            preview = lines[0][:120] if lines else ""
        except Exception: pass
        rel = path.relative_to(root)
        rel_str = str(rel).replace("\\", "/")
        notes.append({"name": path.stem, "rel": rel_str,
                      "folder": str(rel.parent).replace("\\", "/") if str(rel.parent) != "." else "",
                      "when": stat.st_mtime, "size": stat.st_size, "preview": preview,
                      "pinned": rel_str in pinned_set})
    notes.sort(key=lambda n: -n["when"])
    folders = sorted({n["folder"] for n in notes if n["folder"]}, key=str.lower)
    return {"dir": str(root), "notes": notes[:limit], "total": len(notes),
            "folders": folders}

def read_note(cfg, rel):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    return {"ok": True, "rel": rel, "text": target.read_text(encoding="utf-8", errors="replace"),
            "when": target.stat().st_mtime}

def write_note(cfg, rel, text):
    target = note_path(cfg, rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".panel-tmp")
    tmp.write_text(str(text), encoding="utf-8", newline="\n")
    tmp.replace(target)      # never leave a half-written note in the vault
    return {"ok": True, "rel": rel, "when": target.stat().st_mtime}

def delete_note(cfg, rel):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    target.unlink()
    return {"ok": True}

def rename_note(cfg, rel, new_name):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    stem = re.sub(r'[<>:"/\\|?*]', "", str(new_name or "").strip())
    if not stem: return {"ok": False, "error": "name can't be empty"}
    dest = target.with_name(stem + target.suffix)
    if dest.exists() and dest != target: return {"ok": False, "error": "a note with that name already exists"}
    target.rename(dest)
    rel_dest = dest.relative_to(notes_root(cfg).resolve())
    return {"ok": True, "rel": str(rel_dest).replace("\\", "/")}

def new_note(cfg, name, folder=""):
    stem = re.sub(r'[<>:"/\\|?*]', "", str(name or "").strip()) or datetime.now().strftime("Note %Y-%m-%d %H%M")
    rel = f"{folder}/{stem}.md" if folder else f"{stem}.md"
    target = note_path(cfg, rel)
    if target.exists():
        rel = f"{folder}/{stem} 2.md" if folder else f"{stem} 2.md"
        target = note_path(cfg, rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"# {stem}\n\n", encoding="utf-8", newline="\n")
    return {"ok": True, "rel": rel}

def pin_note(cfg, rel, pinned):
    rel = str(rel or "")
    if not rel: return {"ok": False, "error": "no rel"}
    def mutate(store):
        others = [r for r in store.get("pinned_notes") or [] if r != rel]
        store["pinned_notes"] = others + ([rel] if pinned else [])
    edit_store(mutate)
    return {"ok": True}


# ──────────────────────────────────────────────
#  QUICK TASKS
# ──────────────────────────────────────────────
# A small action-oriented task layer, deliberately separate from Notes -
# not tied to any markdown file, so it stays simple (no file writes, no
# vault path guards) and can surface in Overview later without dragging
# the whole notes collector along. Lives in the same store.json every
# other lightweight annotation (favorites, hidden panels, ...) already
# uses - no new persistence mechanism.

def collect_tasks(_cfg, _shared):
    store = load_store()
    tasks = store.get("tasks") or []
    tasks = sorted(tasks, key=lambda t: (not t.get("pinned"), t.get("done", False), -float(t.get("created") or 0)))
    return {"tasks": tasks}

def add_task(text, priority="normal", notes=""):
    import uuid
    text = str(text or "").strip()
    if not text: return {"ok": False, "error": "empty task"}
    if priority not in ("low", "normal", "high"): priority = "normal"
    notes = str(notes or "").strip()[:2000] or None
    task = {"id": uuid.uuid4().hex[:12], "text": text[:280], "done": False,
            "priority": priority, "pinned": False, "created": time.time(), "completed": None,
            "notes": notes}
    def mutate(store):
        store.setdefault("tasks", []).append(task)
    edit_store(mutate)
    return {"ok": True, "task": task}

def edit_task(task_id, text=None, priority=None, notes=None, pinned=None):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for t in store.get("tasks") or []:
            if t.get("id") != task_id: continue
            if text is not None:
                clean = str(text).strip()
                if not clean:
                    result = {"ok": False, "error": "empty task"}
                    return
                t["text"] = clean[:280]
            if priority is not None and priority in ("low", "normal", "high"):
                t["priority"] = priority
            if notes is not None:
                t["notes"] = str(notes).strip()[:2000] or None
            if pinned is not None:
                t["pinned"] = bool(pinned)
            result = {"ok": True, "task": t}
    edit_store(mutate)
    return result

def toggle_task(task_id, done):
    def mutate(store):
        for t in store.get("tasks") or []:
            if t.get("id") == task_id:
                t["done"] = bool(done)
                t["completed"] = time.time() if done else None
    edit_store(mutate)
    return {"ok": True}

def pin_task(task_id, pinned):
    def mutate(store):
        for t in store.get("tasks") or []:
            if t.get("id") == task_id:
                t["pinned"] = bool(pinned)
    edit_store(mutate)
    return {"ok": True}

def delete_task(task_id):
    def mutate(store):
        store["tasks"] = [t for t in store.get("tasks") or [] if t.get("id") != task_id]
    edit_store(mutate)
    return {"ok": True}


# ──────────────────────────────────────────────
#  HOMELAB EXTRAS
# ──────────────────────────────────────────────

_qbit = {"session": None, "base": None, "user": None, "blocked_until": 0, "why": None}

def _qbit_login(base, user, password):
    """qBittorrent bans an IP after a handful of failed logins, and the old code
    logged in fresh on EVERY poll - eight seconds apart. So one wrong password
    turned into a ban, and the ban then reported itself as 'login refused'
    forever, even after the password was corrected.

    Now the cookie is kept and reused, login only happens when there isn't a
    valid session, and a failure backs off instead of hammering."""
    session = requests.Session()
    # Both headers: qBittorrent's CSRF check rejects a mismatched Origin with a
    # bare 403 and no explanation.
    session.headers.update({"Referer": base, "Origin": base})
    if not user:
        return session, None            # auth bypassed for this subnet
    try:
        r = session.post(f"{base}/api/v2/auth/login", timeout=8,
                         data={"username": user, "password": password})
    except Exception as e:
        return None, f"can't reach the Web UI: {str(e)[:90]}"
    if r.status_code == 403:
        return None, ("qBittorrent returned 403. Either the IP is temporarily "
                      "banned after failed logins (restart qBittorrent or wait "
                      "out Options > Web UI > ban duration), or Web UI "
                      "'Enable Host header validation' is rejecting this address.")
    # Neither the status code nor the SID cookie is a reliable signal: a bare
    # 204 with no cookie is what qBittorrent sends when the requesting IP is
    # on Options > Web UI > "Bypass authentication for clients on
    # localhost/whitelisted subnets" - login is a no-op because it isn't
    # needed, and every later request will work without a cookie too. So the
    # only real proof is calling an endpoint that actually requires auth.
    try:
        check = session.get(f"{base}/api/v2/app/version", timeout=6)
    except Exception as e:
        return None, f"logged in but can't reach the Web UI: {str(e)[:90]}"
    if check.status_code == 200:
        return session, None
    body = (r.text or "").strip()
    return None, f"login returned HTTP {r.status_code}: {body[:70] or 'credentials rejected'}"

def _qbit_session(cfg):
    base = str(cfg["qbit_url"]).strip().rstrip("/")
    user = str(cfg["qbit_user"]).strip()
    password = str(cfg["qbit_pass"])
    # Settings changed? Throw the old session and the old backoff away.
    if _qbit["base"] != base or _qbit["user"] != user:
        _qbit.update(session=None, base=base, user=user, blocked_until=0, why=None)
    if _qbit["session"] is not None:
        return _qbit["session"], None
    if time.monotonic() < _qbit["blocked_until"]:
        return None, _qbit["why"]
    session, why = _qbit_login(base, user, password)
    if session is None:
        _qbit.update(blocked_until=time.monotonic() + 60, why=why)
        return None, why
    _qbit.update(session=session, blocked_until=0, why=None)
    return session, None

def collect_downloads(cfg, _shared):
    base = str(cfg["qbit_url"]).strip().rstrip("/")
    if not base: return {"configured": False, "torrents": []}

    session, why = _qbit_session(cfg)
    if session is None: return {"configured": True, "torrents": [], "error": why}

    try:
        r = session.get(f"{base}/api/v2/torrents/info", timeout=8,
                        params={"filter": "all", "sort": "priority"})
        if r.status_code in (401, 403):
            # Cookie expired. Drop it and let the next poll log in again.
            _qbit["session"] = None
            return {"configured": True, "torrents": [], "error": "session expired, reconnecting"}
        r.raise_for_status()
        rows = r.json() or []
        info = session.get(f"{base}/api/v2/transfer/info", timeout=6).json() or {}
    except Exception as e:
        _qbit["session"] = None
        return {"configured": True, "torrents": [], "error": str(e)[:140]}

    done_states = ("pausedUP", "stoppedUP", "uploading", "stalledUP", "queuedUP", "checkingUP")
    active = [t for t in rows if t.get("state") not in done_states]
    active.sort(key=lambda t: (-(t.get("dlspeed") or 0), -(t.get("progress") or 0)))
    torrents = [{
        "name": t.get("name"), "progress": round((t.get("progress") or 0) * 100, 1),
        "state": t.get("state"), "dl": t.get("dlspeed") or 0, "up": t.get("upspeed") or 0,
        "eta": t.get("eta") if (t.get("eta") or 0) < 8640000 else None,
        "size": t.get("size") or 0, "category": t.get("category") or "",
    } for t in active[:12]]
    dl, up = info.get("dl_info_speed") or 0, info.get("up_info_speed") or 0
    _record_metric("qbit_dl", dl)
    _record_metric("qbit_up", up)
    return {"configured": True, "torrents": torrents, "active": len(active), "total": len(rows),
            "dl": dl, "up": up}

def _arr_calendar(base, key, kind):
    base = str(base).strip().rstrip("/")
    if not base or not str(key).strip(): return []
    today = datetime.now().date()
    try:
        # Without includeSeries the calendar returns episodes with no series
        # object at all, which is why every row read "null - S3E8".
        r = requests.get(f"{base}/api/v3/calendar", timeout=8,
                         params={"apikey": key, "unmonitored": "false",
                                 "includeSeries": "true", "includeEpisodeFile": "true",
                                 "start": today.isoformat(),
                                 "end": (today + timedelta(days=8)).isoformat()})
        r.raise_for_status()
        rows = r.json() or []
    except Exception:
        return []
    out = []
    for item in rows[:24]:
        when = item.get("airDateUtc") or item.get("digitalRelease") or item.get("inCinemas") or item.get("physicalRelease")
        stamp = None
        if when:
            try: stamp = datetime.fromisoformat(str(when).replace("Z", "+00:00")).timestamp()
            except Exception: pass
        # Radarr/Sonarr ship a poster with every calendar row via a remoteUrl
        # (a plain image host, not the Arr server) - the browser can load that
        # directly without an API key, unlike the /MediaCover path.
        images = item.get("series", {}).get("images") if kind == "tv" else item.get("images")
        poster = next((i.get("remoteUrl") for i in (images or []) if i.get("coverType") == "poster" and i.get("remoteUrl")), None)
        if kind == "tv":
            # Belt and braces: series object, then the flat seriesTitle some
            # versions send, then the series id, before ever showing "null".
            series = item.get("series") or {}
            show = (series.get("title") or item.get("seriesTitle")
                    or (f"Series {item.get('seriesId')}" if item.get("seriesId") else "Unknown series"))
            season, episode = item.get("seasonNumber"), item.get("episodeNumber")
            code = f"S{season}E{episode}" if season is not None and episode is not None else ""
            name = item.get("title") or ""
            title, sub = show, " · ".join(bit for bit in (code, name) if bit)
        else:
            title = item.get("title") or "Unknown film"
            sub = str(item.get("year") or "")
        out.append({"kind": kind, "title": title, "sub": sub, "when": stamp, "poster": poster,
                    "has_file": bool(item.get("hasFile") or item.get("hasFile") is None and item.get("movieFile"))})
    out.sort(key=lambda i: i["when"] or 0)
    return out

# ──────────────────────────────────────────────
#  IMMICH - one random photo, rotated slowly
# ──────────────────────────────────────────────

_IMMICH_ALBUM_URL = re.compile(r"^(https?://[^/]+).*?/albums/([0-9a-fA-F-]{36})")

def _immich_base_and_album(cfg):
    """The 'Immich' field wants the bare server URL - but the natural thing to
    paste in is the album link copied straight out of the browser (Immich >
    open an album > copy address bar), which points at the web app's /albums
    route, not the API. Salvage both the real base and the album id out of
    that instead of quietly 406ing/404ing against a URL that was never an
    API endpoint to begin with."""
    raw = str(cfg["immich_url"]).strip().rstrip("/")
    album = str(cfg["immich_album"]).strip()
    m = _IMMICH_ALBUM_URL.match(raw)
    if m:
        return m.group(1), album or m.group(2)
    return raw, album

def _immich(cfg, path, method="GET", **kw):
    base, _ = _immich_base_and_album(cfg)
    key = str(cfg["immich_key"]).strip()
    if not base or not key: return None
    # A 406 here almost always means a reverse proxy/WAF in front of Immich
    # (Cloudflare, NPM, etc.) is rejecting the request before it reaches
    # Immich - not that a URL field is wrong. Immich itself doesn't do Accept
    # negotiation. requests' default "python-requests/x.y" User-Agent is a
    # common trigger for that, so send a browser-shaped one too.
    headers = {"x-api-key": key, "Accept": "application/json, */*",
               "User-Agent": "Mozilla/5.0 (compatible; HomePanel/1.0)"}
    fn = requests.post if method == "POST" else requests.get
    return fn(f"{base}{path}", headers=headers, timeout=12, **kw)

_photo_pin = {"on": False, "photo": None}

def collect_photo(cfg, _shared):
    """Immich needs an API key on every request, so the browser can't fetch the
    image itself - the panel proxies the thumbnail through /api/photo instead."""
    if not str(cfg["immich_url"]).strip() or not str(cfg["immich_key"]).strip():
        return {"configured": False}

    # Pinned means "stop rotating, keep showing this one" - skip the fetch
    # entirely and just keep re-serving whatever was last chosen. /api/photo
    # /next clears the cached photo (see below) so the next call falls
    # through to a real fetch even while pinned, landing a fresh photo that
    # then becomes the new pinned one.
    if _photo_pin["on"] and _photo_pin["photo"]:
        return dict(_photo_pin["photo"], pinned=True)

    _, album = _immich_base_and_album(cfg)
    try:
        if album:
            r = _immich(cfg, f"/api/albums/{album}")
            r.raise_for_status()
            assets = [a for a in (r.json() or {}).get("assets", []) if a.get("type") == "IMAGE"]
            chosen = random.choice(assets) if assets else None
        else:
            # /api/search/random is the current endpoint; older servers only
            # have /api/assets/random, so fall back rather than showing nothing.
            r = _immich(cfg, "/api/search/random", method="POST",
                        json={"size": 24, "type": "IMAGE", "withExif": True})
            if r is not None and r.status_code == 404:
                r = _immich(cfg, "/api/assets/random", params={"count": 24})
            r.raise_for_status()
            payload = r.json()
            assets = payload if isinstance(payload, list) else (payload.get("assets") or {}).get("items", [])
            assets = [a for a in assets if a.get("type") == "IMAGE"] or assets
            chosen = random.choice(assets) if assets else None
    except requests.HTTPError as e:
        # The status line alone ("406 Client Error: ...") hides the actual
        # reason - surface whatever body came back (a WAF/proxy block page
        # usually says so in plain text) so this is self-diagnosing.
        body = ""
        try: body = (e.response.text or "").strip().replace("\n", " ")[:160]
        except Exception: pass
        return {"configured": True, "error": (str(e)[:100] + (" — " + body if body else ""))[:220]}
    except json.JSONDecodeError:
        # A 2xx that isn't JSON - almost always means the URL is pointing at
        # the Immich web app (which serves an HTML page for any route) rather
        # than its API, or a proxy/login page in front of it.
        got = ""
        try: got = (r.text or "").strip().replace("\n", " ")[:120]
        except Exception: pass
        return {"configured": True, "error": f"got HTTP {r.status_code} but not JSON - "
                f"check the Immich URL is the server root, not a web app link"
                f"{(': ' + got) if got else ''}"[:220]}
    except Exception as e:
        return {"configured": True, "error": str(e)[:140]}

    if not chosen: return {"configured": True, "error": "no photos came back"}
    exif = chosen.get("exifInfo") or {}
    when = chosen.get("fileCreatedAt") or chosen.get("localDateTime")
    result = {"configured": True, "id": chosen.get("id"),
              "url": "/api/photo?id=" + str(chosen.get("id")),
              "when": str(when)[:10] if when else None,
              "place": ", ".join(bit for bit in (exif.get("city"), exif.get("country")) if bit),
              "camera": " ".join(bit for bit in (exif.get("make"), exif.get("model")) if bit),
              "name": chosen.get("originalFileName")}
    _photo_pin["photo"] = result
    return dict(result, pinned=_photo_pin["on"])


# ──────────────────────────────────────────────
#  OVERSEERR - what the house actually wants
# ──────────────────────────────────────────────

def _overseerr(cfg, path, **params):
    base = str(cfg["overseerr_url"]).strip().rstrip("/")
    key = str(cfg["overseerr_key"]).strip()
    if not base or not key: return None
    r = requests.get(f"{base}/api/v1{path}", timeout=12,
                     headers={"X-Api-Key": key, "Accept": "application/json"},
                     params=params)
    r.raise_for_status()
    return r.json()

_OVERSEERR_MEDIA_STATUS = {1: "unknown", 2: "pending", 3: "processing", 4: "partial", 5: "available"}

def collect_popular(cfg, _shared):
    """This used to tally Overseerr's own /request log - which, on a house with
    one requester, is just a mirror of your own history wearing a trenchcoat.
    What's wanted is the wider pool: what's popular out in the world right
    now, via Overseerr's /discover charts (backed by TMDB popularity), with
    each row's availability on this server attached."""
    if not str(cfg["overseerr_url"]).strip() or not str(cfg["overseerr_key"]).strip():
        return {"configured": False, "movies": [], "shows": []}

    base = str(cfg["overseerr_url"]).strip().rstrip("/")
    def poster(item):
        path = (item or {}).get("posterPath") or (item or {}).get("poster_path")
        return f"https://image.tmdb.org/t/p/w300{path}" if path else None

    out = {"configured": True, "movies": [], "shows": [], "error": None}
    for key, kind, path in (("movies", "movie", "/discover/movies"), ("shows", "tv", "/discover/tv")):
        try:
            data = _overseerr(cfg, path, page=1)
            rows = []
            for rank, item in enumerate((data or {}).get("results", [])[:12], start=1):
                info = item.get("mediaInfo") or {}
                rows.append({
                    "tmdb": item.get("id"), "rank": rank,
                    "popularity": item.get("popularity"),
                    "status": _OVERSEERR_MEDIA_STATUS.get(info.get("status"), "unknown"),
                    "title": item.get("title") or item.get("name") or f"#{item.get('id')}",
                    "poster": poster(item),
                    "year": str(item.get("releaseDate") or item.get("firstAirDate") or "")[:4],
                    "url": f"{base}/{kind}/{item.get('id')}",
                })
            out[key] = rows
        except Exception as e:
            out["error"] = str(e)[:140]

    return out


def collect_upcoming(cfg, _shared):
    items = _arr_calendar(cfg["sonarr_url"], cfg["sonarr_key"], "tv") + \
            _arr_calendar(cfg["radarr_url"], cfg["radarr_key"], "movie")
    items.sort(key=lambda i: i["when"] or 0)
    configured = bool(str(cfg["sonarr_url"]).strip() or str(cfg["radarr_url"]).strip())
    return {"configured": configured, "items": items[:20]}




# ──────────────────────────────────────────────
#  CALENDAR - any plain ICS feed (Google, Outlook, Apple all export one)
# ──────────────────────────────────────────────

def collect_calendar(cfg, _shared):
    url = str(cfg["calendar_ics"]).strip()
    if not url: return {"configured": False, "items": []}
    # webcal:// is just the "open this in a calendar app" spelling of https://
    url = re.sub(r"^webcal://", "https://", url, flags=re.I)
    try:
        r = requests.get(url, timeout=10,
                         headers={"User-Agent": "Mozilla/5.0 (compatible; HomePanel/1.0)"})
        r.raise_for_status()
        cal = icalendar.Calendar.from_ical(r.content)
    except Exception as e:
        return {"configured": True, "items": [], "error": str(e)[:160]}

    now = datetime.now()
    try:
        # recurring_ical_events expands RRULEs (daily standups, birthdays,
        # anniversaries…) into real occurrences - without it a calendar
        # widget would only ever show one-off events, which is most feeds.
        events = recurring_ical_events.of(cal).between(now - timedelta(days=60), now + timedelta(days=180))
    except Exception as e:
        return {"configured": True, "items": [], "error": str(e)[:160]}

    items = []
    for event in events:
        start = event.get("DTSTART")
        if not start: continue
        start = start.dt
        all_day = not isinstance(start, datetime)
        when = datetime.combine(start, datetime.min.time()) if all_day else start
        try: ts = when.timestamp()
        except Exception: continue
        end_field = event.get("DTEND")
        ongoing = False
        if not all_day and end_field:
            try:
                now_cmp = now.astimezone(start.tzinfo) if start.tzinfo else now
                ongoing = start <= now_cmp <= end_field.dt
            except Exception:
                ongoing = False
        items.append({
            "title": str(event.get("SUMMARY") or "Untitled"),
            "location": str(event.get("LOCATION") or "") or None,
            "when": ts, "all_day": all_day, "ongoing": ongoing,
        })
    items.sort(key=lambda i: i["when"])
    return {"configured": True, "items": items[:120]}


def collect_lights(cfg, _shared):
    token = load_token()
    if not token: return {"error": "no token", "lights": []}
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
    return {"lights": out}

def _plex_get(cfg, path, **params):
    base = cfg["plex_url"].rstrip("/")
    params["X-Plex-Token"] = cfg["plex_token"].strip()
    r = requests.get(f"{base}{path}", params=params, timeout=8, headers={"Accept": "application/json"})
    r.raise_for_status()
    return r.json().get("MediaContainer", {})

PLEX_TYPE = {"movie": 1, "show": 2, "season": 3, "episode": 4, "artist": 8, "album": 9, "track": 10}

def _plex_machine(cfg):
    try: return _plex_get(cfg, "/identity").get("machineIdentifier")
    except Exception: return None

def _plex_launch(cfg, machine, item):
    key = item.get("key") or ""
    kind = PLEX_TYPE.get(item.get("type") or "", 1)
    mode = cfg.get("plex_open", "app").strip().lower()
    if mode == "web" or not machine:
        base = cfg["plex_url"].rstrip("/")
        return f"{base}/web/index.html#!/server/{machine}/details?key={requests.utils.quote(key)}" if machine else None
    return f"plex://preplay/?metadataKey={requests.utils.quote(key)}&metadataType={kind}&server={machine}"

def collect_plex(cfg, _shared):
    if not cfg["plex_url"].strip() or not cfg["plex_token"].strip():
        return {"configured": False, "playing": [], "recent": [], "sections": []}
    base = cfg["plex_url"].rstrip("/")
    token = cfg["plex_token"].strip()
    def art(item):
        thumb = item.get("thumb") or item.get("parentThumb") or item.get("grandparentThumb")
        return f"{base}{thumb}?X-Plex-Token={token}" if thumb else None
    # Plex's "art" field is the wide fanart/backdrop image (distinct from
    # "thumb", the poster) - a cheap additive lookup, same URL-building
    # pattern as art() above, so the Home hero has real backdrop imagery
    # instead of stretching a portrait poster across a wide banner.
    def backdrop(item):
        key = item.get("art") or item.get("parentArt") or item.get("grandparentArt")
        return f"{base}{key}?X-Plex-Token={token}" if key else None
    out = {"configured": True, "playing": [], "recent": [], "sections": [], "error": None}

    try:
        sessions = _plex_get(cfg, "/status/sessions").get("Metadata") or []
        for item in sessions:
            out["playing"].append({
                "ratingKey": item.get("ratingKey"),
                "title": item.get("title"), "show": item.get("grandparentTitle") or item.get("parentTitle"),
                "type": item.get("type"), "user": ((item.get("User") or {}).get("title")),
                "art": art(item), "backdrop": backdrop(item), "launch": None,
                "duration": item.get("duration"), "viewOffset": item.get("viewOffset"),
            })
    except Exception as e: out["error"] = f"sessions: {e}"[:160]

    machine = _plex_machine(cfg)
    limit = int(cfg.get("plex_limit", "40"))
    def pack(item):
        return {"ratingKey": item.get("ratingKey"),
                "title": item.get("title"), "show": item.get("grandparentTitle") or item.get("parentTitle"),
                "type": item.get("type"), "year": item.get("year"), "art": art(item), "backdrop": backdrop(item),
                "launch": _plex_launch(cfg, machine, item),
                "summary": item.get("summary") or None,
                "duration": item.get("duration"), "viewOffset": item.get("viewOffset"),
                "viewCount": item.get("viewCount"),
                "index": item.get("index"), "parentIndex": item.get("parentIndex")}

    try:
        deck = []
        cw_data = _plex_get(cfg, "/hubs/continueWatching")
        if "Metadata" in cw_data: deck = cw_data["Metadata"]
        elif "Hub" in cw_data:
            for hub in cw_data["Hub"]:
                if hub.get("hubIdentifier") == "continueWatching" or hub.get("type") == "continueWatching":
                    deck = hub.get("Metadata") or []
                    break
            if not deck and len(cw_data["Hub"]) > 0: deck = cw_data["Hub"][0].get("Metadata") or []
        if not deck: deck = _plex_get(cfg, "/library/onDeck").get("Metadata") or []
        recent_items = [pack(i) for i in deck[:16]]
        out["recent"] = recent_items
        if recent_items:
            out["sections"].insert(0, {"key": "continueWatching", "title": "Continue Watching", "type": "hub",
                                       "count": len(recent_items), "items": recent_items, "error": None})
    except Exception: pass

    try:
        container = _plex_get(cfg, "/library/sections")
        sections = container.get("Directory") or []
        for section in sections:
            key, title = section.get("key"), section.get("title")
            kind = section.get("type")
            if not key: continue
            items, section_error = [], None
            try:
                data = _plex_get(cfg, f"/library/sections/{key}/all", **{"X-Plex-Container-Size": str(limit), "sort": "addedAt:desc"})
                items = [pack(i) for i in (data.get("Metadata") or [])[:limit]]
            except Exception as e: section_error = str(e)[:120]
            out["sections"].append({"key": key, "title": title, "type": kind,
                                    "count": section.get("size") or len(items), "items": items, "error": section_error})
    except Exception as e: out["error"] = f"sections: {e}"[:160]

    return out

def plex_item_detail(cfg, rating_key):
    if not cfg["plex_url"].strip() or not cfg["plex_token"].strip():
        return {"error": "not configured"}
    base = cfg["plex_url"].rstrip("/")
    token = cfg["plex_token"].strip()
    data = _plex_get(cfg, f"/library/metadata/{rating_key}")
    items = data.get("Metadata") or []
    if not items:
        return {"error": "not found"}
    item = items[0]
    def art(key):
        return f"{base}{key}?X-Plex-Token={token}" if key else None
    machine = _plex_machine(cfg)
    genres = [g.get("tag") for g in (item.get("Genre") or []) if g.get("tag")]
    return {
        "ratingKey": item.get("ratingKey"),
        "title": item.get("title"),
        "show": item.get("grandparentTitle") or item.get("parentTitle"),
        "type": item.get("type"),
        "year": item.get("year"),
        "summary": item.get("summary"),
        "art": art(item.get("thumb") or item.get("parentThumb") or item.get("grandparentThumb")),
        "backdrop": art(item.get("art")),
        "genres": genres,
        "contentRating": item.get("contentRating"),
        "rating": item.get("audienceRating") or item.get("rating"),
        "studio": item.get("studio"),
        "duration": item.get("duration"),
        "viewOffset": item.get("viewOffset"),
        "viewCount": item.get("viewCount"),
        "index": item.get("index"),
        "parentIndex": item.get("parentIndex"),
        "childCount": item.get("childCount") or item.get("leafCount"),
        "launch": _plex_launch(cfg, machine, item),
    }

def _steam_libraries(steam_path):
    roots = []
    vdf = Path(steam_path) / "steamapps" / "libraryfolders.vdf"
    try: text = vdf.read_text(encoding="utf-8", errors="ignore")
    except Exception: return [Path(steam_path) / "steamapps"]
    for match in re.finditer(r'"path"\s*"([^"]+)"', text):
        candidate = Path(match.group(1).replace("\\\\", "\\")) / "steamapps"
        if candidate.is_dir(): roots.append(candidate)
    default = Path(steam_path) / "steamapps"
    if default.is_dir() and default not in roots: roots.append(default)
    return roots

def _steam_playtimes(steam_path):
    """Playtime isn't in the appmanifest files or any Web API this panel has
    a key for - it only lives in each local account's localconfig.vdf. Not a
    full VDF parser, just enough to pull two numbers per app: find the
    "apps" block, then for each numeric-keyed child inside it (brace-matched,
    since "cloud"/"autocloud" sub-blocks nest inside too), grab Playtime and
    Playtime2wks. Two Steam accounts can share one PC, so every account
    folder gets scanned and results merge by taking whichever has a value."""
    root = Path(steam_path) / "userdata"
    if not root.is_dir(): return {}

    out = {}
    for user_dir in root.iterdir():
        vdf = user_dir / "config" / "localconfig.vdf"
        if not vdf.is_file(): continue
        try: text = vdf.read_text(encoding="utf-8", errors="ignore")
        except Exception: continue

        idx = text.find('"apps"')
        if idx == -1: continue
        brace = text.find("{", idx)
        if brace == -1: continue
        depth, i = 1, brace + 1
        while i < len(text) and depth > 0:
            if text[i] == "{": depth += 1
            elif text[i] == "}": depth -= 1
            i += 1
        apps_block = text[brace + 1:i - 1]

        for m in re.finditer(r'"(\d+)"\s*\{', apps_block):
            appid = m.group(1)
            depth, j = 1, m.end()
            while j < len(apps_block) and depth > 0:
                if apps_block[j] == "{": depth += 1
                elif apps_block[j] == "}": depth -= 1
                j += 1
            block = apps_block[m.end():j]
            forever = re.search(r'"Playtime"\s*"(\d+)"', block)
            two_wk = re.search(r'"Playtime2wks"\s*"(\d+)"', block)
            if not forever and not two_wk: continue
            prev = out.get(appid, {"forever": 0, "two_wk": 0})
            out[appid] = {
                "forever": max(prev["forever"], int(forever.group(1)) if forever else 0),
                "two_wk": max(prev["two_wk"], int(two_wk.group(1)) if two_wk else 0),
            }
    return out

def _start_apps():
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", "Get-StartApps | ConvertTo-Json -Compress"],
                             capture_output=True, text=True, timeout=25, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        data = json.loads(out.stdout or "[]")
        if isinstance(data, dict): data = [data]
        return {str(a.get("Name", "")).strip(): str(a.get("AppID", "")) for a in data if a.get("AppID")}
    except Exception: return {}

XBOX_ART = ["Square480x480Logo", "Square310x310Logo", "Square150x150Logo", "SplashScreenImage", "StoreLogo", "Square44x44Logo"]

def _xbox_roots(cfg):
    candidates = [raw.strip() for raw in str(cfg["xbox_paths"]).split(";")]
    candidates += [f"{letter}:\\XboxGames" for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ"]
    return _dedup_roots(candidates)

def _xbox_games(cfg, start_apps):
    roots = _xbox_roots(cfg)
    found = []
    for root in roots:
        if not root.is_dir(): continue
        for folder in root.iterdir():
            config = folder / "Content" / "MicrosoftGame.config"
            if not config.is_file(): continue
            try: text = config.read_text(encoding="utf-8", errors="ignore")
            except Exception: continue
            identity = re.search(r'<Identity[^>]*\bName="([^"]+)"', text)
            shown = re.search(r"<DefaultDisplayName>([^<]+)</DefaultDisplayName>", text)
            name = (shown.group(1).strip() if shown else folder.name).strip()
            app_id = start_apps.get(name)
            if not app_id:
                target = re.sub(r"\W+", "", name).lower()
                for label, value in start_apps.items():
                    if re.sub(r"\W+", "", label).lower() == target:
                        app_id = value; break
            art = None
            for key in XBOX_ART:
                match = re.search(rf'{key}="([^"]+)"', text)
                if not match: continue
                candidate = folder / "Content" / match.group(1).replace("\\", os.sep)
                if candidate.is_file():
                    art = "/api/art?path=" + requests.utils.quote(str(candidate))
                    break
            found.append({"id": "xbox-" + re.sub(r"\W+", "", name.lower()), "name": name, "last_played": 0, "size": None,
                          "launch": f"shell:AppsFolder\\{app_id}" if app_id else "", "art": art, "art_fallback": None,
                          "source": "xbox", "package": identity.group(1) if identity else None})
    return found

BNET_SKIP = re.compile(r"(unins|setup|crash|report|helper|update|launcher_|redist|vcredist|dxsetup|bootstrap)", re.I)

def _dedup_roots(paths):
    out, seen = [], set()
    for path in paths:
        if not path: continue
        try: resolved = Path(path).resolve()
        except OSError: continue
        if not resolved.is_dir(): continue
        key = str(resolved).rstrip("\\/").lower()
        if key in seen: continue
        seen.add(key)
        out.append(resolved)
    return out

def _battlenet_roots(cfg):
    candidates = [raw.strip() for raw in str(cfg["battlenet_paths"]).split(";")]
    for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        for name in ("Battlenet Games", "Battle.net Games", "Battle.net"): candidates.append(f"{letter}:\\{name}")
    return _dedup_roots(candidates)

def _battlenet_games(cfg):
    hints = {}
    for pair in str(cfg["battlenet_exe_hints"]).split(","):
        if "|" in pair:
            name, exe = pair.split("|", 1)
            hints[name.strip().lower()] = exe.strip().lower()
    found = []
    for root in _battlenet_roots(cfg):
        for folder in root.iterdir():
            if not folder.is_dir(): continue
            target = None
            hint = hints.get(folder.name.strip().lower())
            if hint:
                for match in folder.rglob(hint):
                    target = match; break
            if target is None:
                best_size = 0
                for exe in list(folder.glob("*.exe")) + list(folder.glob("*/*.exe")):
                    if BNET_SKIP.search(exe.name): continue
                    try: size = exe.stat().st_size
                    except OSError: continue
                    if size > best_size: target, best_size = exe, size
            found.append({"id": "bnet-" + re.sub(r"\W+", "", folder.name.lower()), "name": folder.name,
                          "last_played": 0, "size": None, "launch": str(target) if target else "",
                          "art": None, "art_fallback": None, "source": "battlenet"})
    return found

def _riot_games(cfg):
    products = {}
    for pair in str(cfg["riot_products"]).split(","):
        if "|" in pair:
            name, code = pair.split("|", 1)
            products[name.strip().lower()] = code.strip()
    found = []
    for raw in str(cfg["riot_paths"]).split(";"):
        root = Path(raw.strip())
        if not raw.strip() or not root.is_dir(): continue
        client = root / "Riot Client" / "RiotClientServices.exe"
        for folder in root.iterdir():
            if not folder.is_dir() or folder.name == "Riot Client": continue
            code = products.get(folder.name.strip().lower())
            if client.is_file() and code: launch = [str(client), f"--launch-product={code}", "--launch-patchline=live"]
            else:
                exe = next((e for e in folder.glob("*.exe") if not BNET_SKIP.search(e.name)), None)
                launch = [str(exe)] if exe else ""
            found.append({"id": "riot-" + re.sub(r"\W+", "", folder.name.lower()), "name": folder.name,
                          "last_played": 0, "size": None, "launch": launch, "art": None, "art_fallback": None, "source": "riot"})
    return found

# ──────────────────────────────────────────────
#  STORE - the part of the panel you can edit from the panel
# ──────────────────────────────────────────────

# The launchpad seeds itself with the things that used to live on the portrait
# monitor. Anything missing just fails to launch until you re-point it.
DEFAULT_VIEWS = [
    {"key": "overview", "label": "Overview", "visible": True},
    {"key": "games", "label": "Games", "visible": True},
    {"key": "scene", "label": "Scene", "visible": True},
    {"key": "notes", "label": "Notes", "visible": True},
    {"key": "plex", "label": "Plex", "visible": True},
    {"key": "feeds", "label": "Reading", "visible": True},
    {"key": "homelab", "label": "Homelab", "visible": True},
    {"key": "files", "label": "Files", "visible": True},
    {"key": "settings", "label": "Settings", "visible": True},
]

DEFAULT_APPS = [
    {"id": "app-spotify", "label": "Spotify", "target": "spotify:", "icon": None},
    {"id": "app-discord", "label": "Discord", "target": "discord:", "icon": None},
    {"id": "app-figma", "label": "Figma", "target": "figma:", "icon": None},
    {"id": "app-brave", "label": "Brave", "target": r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe", "icon": None},
    {"id": "app-steam", "label": "Steam", "target": "steam://open/games", "icon": None},
    {"id": "app-obsidian", "label": "Obsidian", "target": "obsidian://open", "icon": None},
]

DEFAULT_LAYOUTS = {
    # Every Overview section is a real PanelGrid panel - resizable,
    # reorderable, hideable, persisted the same way Games/Homelab already
    # are. Visual hierarchy comes from `bleed` + deliberately varied sizes
    # (see Overview.tsx), not from opting any section out of the shared
    # panel system. Homelab (ov-pulse/ov-upnext from the old app) is
    # excluded entirely - that's the separate Homelab application's job.
    "overview": {
        "order": ["pad", "ov-nowplaying", "ov-profile", "ov-weather", "ov-calendar",
                  "ov-news", "ov-notes-tasks", "ov-recent", "ov-system"],
        "sizes": {
            "pad": {"w": 3, "h": 6}, "ov-nowplaying": {"w": 3, "h": 6},
            "ov-profile": {"w": 2, "h": 5}, "ov-weather": {"w": 2, "h": 4}, "ov-calendar": {"w": 2, "h": 6},
            "ov-news": {"w": 3, "h": 6}, "ov-notes-tasks": {"w": 2, "h": 5},
            "ov-recent": {"w": 3, "h": 4}, "ov-system": {"w": 3, "h": 5},
        },
    },
    # Homelab is entirely panels now - no fixed hero composition. Every
    # surface (Plex, the Immich photo, Overseerr's discover charts,
    # qBittorrent, the Sonarr/Radarr timeline, host metrics, HA lights,
    # the service grid) is independently movable/resizable/hideable
    # through the exact same generic layout routes every other grid uses.
    "homelab": {
        "order": ["hl-photo", "hl-cpu", "hl-ram", "hl-network", "hl-storage",
                  "hl-wanted", "hl-downloads", "hl-lights", "hl-services"],
        "sizes": {
            "hl-photo": {"w": 3, "h": 9},
            "hl-cpu": {"w": 3, "h": 6}, "hl-ram": {"w": 2, "h": 6},
            "hl-network": {"w": 3, "h": 6}, "hl-storage": {"w": 5, "h": 7},
            "hl-wanted": {"w": 8, "h": 5},
            "hl-downloads": {"w": 3, "h": 5},
            "hl-lights": {"w": 2, "h": 4}, "hl-services": {"w": 3, "h": 5},
        },
        "hidden": [],
    },
    # Registered the same way overview/homelab are - the routes and
    # effective_layout() are already generic over `view`, this dict entry
    # is the only thing a new grid needs. Shelf panel ids are prefixed
    # ("shelf-<id>") so they can't collide with favorites/playtime; the
    # default sizes put Steam/Xbox/Other side by side, roughly proportional
    # to how many games each shelf tends to hold.
    "games": {
        "order": ["favorites", "playtime", "shelf-steam", "shelf-xbox", "shelf-other"],
        "sizes": {
            "favorites": {"w": 5, "h": 6}, "playtime": {"w": 3, "h": 6},
            "shelf-steam": {"w": 4, "h": 8}, "shelf-xbox": {"w": 2, "h": 8},
            "shelf-other": {"w": 2, "h": 8},
        },
        "hidden": [],
    },
    # Scene's Hero and the Favorites panel beside it are a fixed top-row
    # composition, not part of this grid (Hero is a deliberately composed
    # surface, never a panel; Favorites is pinned next to it so the two
    # stay aligned edge-to-edge, not something a reorder/hide could ever
    # separate). This grid is just the bottom row: Yours and Wallhaven,
    # genuinely interchangeable with each other, split the full width
    # 50/50 by default.
    "scene": {
        "order": ["yours", "wallhaven"],
        "sizes": {"yours": {"w": 4, "h": 8}, "wallhaven": {"w": 4, "h": 8}},
        "hidden": [],
    },
    # Registered the same way games' shelf panels are: ids are dynamic
    # (one per Plex library the user actually has - "plex-<key>",
    # PlexHome.tsx), so there's nothing meaningful to default here. An
    # empty entry is still required though - effective_layout()/the
    # /api/layout/* routes only recognise views present in this dict at
    # all, so without this entry every reorder/resize/hide call for Plex
    # returns {"ok": False} and silently never persists (order/sizes
    # only ever lived in PanelGrid's own 6-second optimistic local
    # state, snapping back to default the moment that timer cleared or
    # the page reloaded).
    "plex-home": {
        "order": [],
        "sizes": {},
        "hidden": [],
    },
    # Same shape as "plex-home" above: Reading's For You page turns each
    # topic that actually has content into a resizable/reorderable panel
    # (ReadingFeed.tsx's ForYouBody) - which topics exist depends on the
    # user's own sources, so there's no fixed default set here either.
    "reading-foryou": {
        "order": [],
        "sizes": {},
        "hidden": [],
    },
}

DEFAULT_SHELVES = [
    {"id": "steam", "label": "Steam", "claims": ["steam"]},
    {"id": "xbox", "label": "Xbox", "claims": ["xbox"]},
    {"id": "other", "label": "Other games", "claims": ["battlenet", "riot", "manual"]},
]

_store_lock = threading.Lock()

def _blank_store():
    return {"shelves": [dict(s) for s in DEFAULT_SHELVES],
            "place": {}, "order": {}, "art": {}, "hidden": [], "manual": [],
            "apps": [dict(a) for a in DEFAULT_APPS], "favorites": [], "widths": {},
            "settings": {}, "profile": {}, "views": [dict(v) for v in DEFAULT_VIEWS],
            "pages": [], "layouts": {}, "wallpaper_favorites": [],
            "pinned_notes": [], "tasks": [],
            # Reading (control-center's redesigned feed - see collect_reading).
            # saved/read/hidden are keyed by item id rather than booleans baked
            # into a feed item, since items themselves are re-derived from RSS
            # every poll and would otherwise lose that state on the next fetch.
            "reading_sources": [], "reading_saved": [], "reading_read": [],
            "reading_hidden": [], "books": [], "reading_bookmarks": [],
            "reading_prefs": {"topic_order": [], "topic_hidden": []}}

def load_store():
    """Never raise. A corrupt store should cost you your tile order, not your panel."""
    store = _blank_store()
    try:
        found = json.loads(STORE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return store
    if not isinstance(found, dict):
        return store
    for key in store:
        if key in found and isinstance(found[key], type(store[key])):
            store[key] = found[key]
    if not store["shelves"]:
        store["shelves"] = [dict(s) for s in DEFAULT_SHELVES]

    # Migration: a layout saved before a new view existed would never gain it,
    # so any view missing from the stored list gets appended rather than lost.
    known = {v.get("key") for v in store["views"] if isinstance(v, dict)}
    for view in DEFAULT_VIEWS:
        if view["key"] not in known:
            store["views"].append(dict(view))
    store["views"] = [v for v in store["views"]
                      if isinstance(v, dict) and v.get("key") in {d["key"] for d in DEFAULT_VIEWS}]
    for view in store["views"]:
        if view.get("key") == "settings": view["visible"] = True

    # Migration: first load after the Reading redesign. "reading_sources"
    # missing from the file on disk (rather than merely empty - the user may
    # have deliberately deleted every source later) means this store predates
    # it. A custom "feeds" settings value gets carried over as sources rather
    # than silently discarded; legacy entries land in "interesting" since the
    # old free-text field had no topic concept and guessing one would be
    # dishonest. Otherwise seed the curated defaults.
    if "reading_sources" not in found:
        seeded = []
        legacy_feeds = str(store.get("settings", {}).get("feeds") or "").strip()
        if legacy_feeds and legacy_feeds != DEFAULTS["feeds"].strip():
            seen_urls = set()
            for line in legacy_feeds.splitlines():
                line = line.strip()
                if not line or "|" not in line: continue
                label, url = [p.strip() for p in line.split("|", 1)]
                if not url or url in seen_urls: continue
                seen_urls.add(url)
                seeded.append({
                    "id": (re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
                           or hashlib.sha1(url.encode()).hexdigest()[:8]),
                    "type": "youtube" if YT_RE.search(url) else "rss",
                    "label": label, "url": url, "topic": "interesting", "enabled": True,
                })
        if not seeded:
            seeded = [dict(s) for s in DEFAULT_READING_SOURCES]
        store["reading_sources"] = seeded
    return store

def save_store(store):
    with _store_lock:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STORE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(store, indent=2), encoding="utf-8")
        tmp.replace(STORE_FILE)     # atomic, so a crash mid-write can't truncate it
    return store

def edit_store(mutate):
    """Read-modify-write under one lock. Every POST goes through this."""
    store = load_store()
    result = mutate(store)
    save_store(store)
    return result

def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-") or "shelf"

def shelf_for(store, game):
    """Explicit placement wins; otherwise the shelf whose claims list the source;
    otherwise the last shelf, so a new source is visible instead of vanishing."""
    placed = store["place"].get(game["id"])
    if placed and any(s["id"] == placed for s in store["shelves"]):
        return placed
    for shelf in store["shelves"]:
        if game.get("source") in (shelf.get("claims") or []):
            return shelf["id"]
    return store["shelves"][-1]["id"]

def build_shelves(store, games):
    buckets = {s["id"]: [] for s in store["shelves"]}
    for game in games:
        buckets.setdefault(shelf_for(store, game), []).append(game)

    out = []
    for shelf in store["shelves"]:
        items = buckets.get(shelf["id"], [])
        wanted = store["order"].get(shelf["id"]) or []
        rank = {gid: i for i, gid in enumerate(wanted)}
        # Anything the stored order doesn't know about sorts after it, by
        # recency - so a freshly installed game lands at the front of the tail
        # instead of somewhere random in the middle of your arrangement.
        items.sort(key=lambda g: (rank.get(g["id"], len(rank)), -g.get("last_played", 0), g["name"].lower()))
        out.append({"id": shelf["id"], "label": shelf.get("label") or shelf["id"],
                    "claims": shelf.get("claims") or [], "count": len(items), "games": items,
                    "width": (store.get("widths") or {}).get(shelf["id"])})
    return out


def _apply_art(cfg, games):
    bf_cover = "https://cdn2.steamgriddb.com/thumb/82e43901d337d05ef3ae610442c8606b.jpg"
    overrides = {}
    for line in (cfg["art_overrides"] or "").splitlines():
        if "|" in line:
            name, url = line.split("|", 1)
            clean_name = re.sub(r'[^a-z0-9]', '', name.lower())
            overrides[clean_name] = url.strip()

    for game in games:
        game_name_clean = re.sub(r'[^a-z0-9]', '', game["name"].lower())
        manual = overrides.get(game_name_clean)
        if not manual:
            for over_name, over_url in overrides.items():
                if over_name in game_name_clean or game_name_clean in over_name:
                    manual = over_url
                    break

        if manual:
            game["art"] = manual
            continue

        grid_art = _griddb_art(cfg, game["name"], appid=game.get("id") if game["source"] == "steam" else None)
        if grid_art:
            if game["source"] == "steam":
                game.setdefault("art_alts", []).insert(0, grid_art)
            elif not game.get("art"):
                game["art"] = grid_art

    return games

_grid_cache = {}
def _griddb_art(cfg, name, appid=None):
    key = cfg["griddb_key"].strip()
    if not key: return None
    clean_name = name.replace("™", "").replace("®", "").strip()
    cache_key = f"{appid or ''}:{clean_name}"
    if cache_key in _grid_cache: return _grid_cache[cache_key]

    art = None
    try:
        head = {"Authorization": f"Bearer {key}"}
        if appid:
            r = requests.get(f"https://www.steamgriddb.com/api/v2/grids/steam/{appid}", headers=head, timeout=6, params={"dimensions": "600x900"})
            if r.status_code == 200:
                grids = (r.json() or {}).get("data") or []
                if grids: art = grids[0].get("thumb") or grids[0].get("url")

        if not art and clean_name:
            r = requests.get("https://www.steamgriddb.com/api/v2/search/autocomplete/" + requests.utils.quote(clean_name), headers=head, timeout=6)
            hits = (r.json() or {}).get("data") or []
            if hits:
                gid = hits[0]["id"]
                r2 = requests.get(f"https://www.steamgriddb.com/api/v2/grids/game/{gid}", headers=head, timeout=6, params={"dimensions": "600x900"})
                grids = (r2.json() or {}).get("data") or []
                if grids: art = grids[0].get("thumb") or grids[0].get("url")
    except Exception:
        art = None

    _grid_cache[cache_key] = art
    return art

def _steam_local_art(cfg, appid):
    root = Path(cfg["steam_path"]) / "appcache" / "librarycache"
    for candidate in (root / appid / "library_600x900.jpg",
                      root / appid / "library_600x900_2x.jpg",
                      root / f"{appid}_library_600x900.jpg"):
        if candidate.is_file():
            return "/api/art?path=" + requests.utils.quote(str(candidate))
    return None

_cover_cache = {}
def griddb_covers(cfg, name, appid=None, limit=18):
    """Several candidates, not one - the whole point of the picker is choosing."""
    key = cfg["griddb_key"].strip()
    if not key: return {"error": "No griddb_key in config.ini", "covers": []}
    clean = str(name).replace("\u2122", "").replace("\u00ae", "").strip()
    cache_key = f"{appid or ''}:{clean}:{limit}"
    if cache_key in _cover_cache: return _cover_cache[cache_key]

    head = {"Authorization": f"Bearer {key}"}
    covers, error = [], None
    def grids(url):
        try:
            r = requests.get(url, headers=head, timeout=8, params={"dimensions": "600x900,342x482,660x930"})
            if r.status_code != 200: return []
            return (r.json() or {}).get("data") or []
        except Exception: return []

    try:
        found = grids(f"https://www.steamgriddb.com/api/v2/grids/steam/{appid}") if appid else []
        if not found and clean:
            r = requests.get("https://www.steamgriddb.com/api/v2/search/autocomplete/" + requests.utils.quote(clean),
                             headers=head, timeout=8)
            for hit in ((r.json() or {}).get("data") or [])[:2]:
                found += grids(f"https://www.steamgriddb.com/api/v2/grids/game/{hit['id']}")
        seen = set()
        for grid in found:
            url = grid.get("thumb") or grid.get("url")
            if not url or url in seen: continue
            seen.add(url)
            covers.append({"thumb": grid.get("thumb") or url, "url": grid.get("url") or url,
                           "author": ((grid.get("author") or {}).get("name"))})
            if len(covers) >= limit: break
    except Exception as e:
        error = str(e)[:140]

    result = {"covers": covers, "error": error if not covers else None}
    _cover_cache[cache_key] = result
    return result

def griddb_icons(cfg, name, limit=18):
    """Same idea as griddb_covers, but square icon assets instead of box art -
    SteamGridDB indexes plenty of non-Steam software (Spotify, Discord,
    browsers…) the same way it indexes games, which covers most of what ends
    up on the launchpad."""
    key = cfg["griddb_key"].strip()
    if not key: return {"error": "No griddb_key in config.ini", "icons": []}
    clean = str(name).replace("™", "").replace("®", "").strip()
    cache_key = f"icon:{clean}:{limit}"
    if cache_key in _cover_cache: return _cover_cache[cache_key]

    head = {"Authorization": f"Bearer {key}"}
    icons, error = [], None
    def fetch(url):
        try:
            r = requests.get(url, headers=head, timeout=8)
            if r.status_code != 200: return []
            return (r.json() or {}).get("data") or []
        except Exception: return []

    try:
        found = []
        if clean:
            r = requests.get("https://www.steamgriddb.com/api/v2/search/autocomplete/" + requests.utils.quote(clean),
                             headers=head, timeout=8)
            for hit in ((r.json() or {}).get("data") or [])[:3]:
                found += fetch(f"https://www.steamgriddb.com/api/v2/icons/game/{hit['id']}")
        seen = set()
        for icon in found:
            url = icon.get("thumb") or icon.get("url")
            if not url or url in seen: continue
            seen.add(url)
            icons.append({"thumb": icon.get("thumb") or url, "url": icon.get("url") or url,
                          "author": ((icon.get("author") or {}).get("name"))})
            if len(icons) >= limit: break
    except Exception as e:
        error = str(e)[:140]

    result = {"icons": icons, "error": error if not icons else None}
    _cover_cache[cache_key] = result
    return result

PICKERS = {
    "exe": ("Choose a launcher", [("Programs", "*.exe"), ("Shortcuts", "*.lnk"), ("Anything", "*.*")]),
    "image": ("Choose an image", [("Images", "*.png *.jpg *.jpeg *.webp *.bmp"), ("Anything", "*.*")]),
}

def pick_file(kind="exe"):
    """A browser can never hand us a real filesystem path, so shell out to a
    throwaway Tk dialog and read the path off stdout. Separate process on
    purpose: Tk on a background thread of a live HTTP server is a coin flip."""
    if kind == "folder":
        call = "filedialog.askdirectory(title='Choose a folder', mustexist=True)"
    else:
        title, patterns = PICKERS.get(kind, PICKERS["exe"])
        call = f"filedialog.askopenfilename(title={title!r}, filetypes={patterns!r})"
    script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)\n"
        f"path = {call}\n"
        "print(path or '')\n"
    )
    try:
        out = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, timeout=180)
        chosen = (out.stdout or "").strip().splitlines()
        return chosen[-1].strip() if chosen else ""
    except Exception:
        return ""

# No str.format here: the script is full of PowerShell braces, and doubling
# every one of them to survive .format is how the first version ended up with a
# broken regex. Plain token replacement instead.
ICON_PS = r"""
Add-Type -AssemblyName System.Drawing
$src = '@@SRC@@'
$out = '@@OUT@@'

function Resolve-Exe($value) {
  if (Test-Path -LiteralPath $value) { return $value }
  if ($value -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*:') { return $null }
  # A scheme like spotify: - ask the registry which program handles it.
  $scheme = ($value -split ':')[0]
  $roots = @(
    "Registry::HKEY_CLASSES_ROOT\$scheme\shell\open\command",
    "Registry::HKEY_CURRENT_USER\Software\Classes\$scheme\shell\open\command"
  )
  foreach ($path in $roots) {
    try { $cmd = (Get-ItemProperty -LiteralPath $path -ErrorAction Stop).'(default)' }
    catch { continue }
    if (-not $cmd) { continue }
    # A doubled backslash is a literal backslash in a .NET regex. The first
    # version of this used a single one, which matched nothing.
    if ($cmd -match '"([^"]+\.exe)"') { return $matches[1] }
    if ($cmd -match '([A-Za-z]:\\[^"]*?\.exe)') { return $matches[1] }
  }
  return $null
}

try {
  $exe = Resolve-Exe $src
  if (-not $exe) { exit 2 }
  if ((Get-Item -LiteralPath $exe).PSIsContainer) { exit 3 }

  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
  if (-not $icon) { exit 4 }
  # Saved at the icon's own resolution. Upscaling a 32px icon to 256 only gives
  # you a blurry 256px icon, and the tile draws it small anyway.
  $bmp = $icon.ToBitmap()
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $icon.Dispose()
  Write-Output $exe
  exit 0
} catch { exit 1 }
"""

ICON_TROUBLE = {1: "PowerShell couldn't run", 2: "couldn't work out which program opens that",
                3: "that's a folder, not a program", 4: "that file has no icon"}


def extract_icon(target, slug):
    """Windows already knows what every app looks like. Ask it, rather than
    making him hunt down six PNGs by hand."""
    if not target: return None, "nothing to look at"
    if isinstance(target, (list, tuple)): target = target[0] if target else ""
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    out = COVER_DIR / (re.sub(r"[^a-z0-9]+", "-", str(slug).lower()).strip("-") + "-icon.png")
    script = (ICON_PS.replace("@@SRC@@", str(target).replace("'", "''"))
                     .replace("@@OUT@@", str(out).replace("'", "''")))
    try:
        result = subprocess.run(["powershell", "-NoProfile", "-NonInteractive",
                                 "-ExecutionPolicy", "Bypass", "-Command", script],
                                capture_output=True, text=True, timeout=30,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except Exception as e:
        return None, str(e)[:80]
    if result.returncode != 0:
        return None, ICON_TROUBLE.get(result.returncode, f"exit {result.returncode}")
    if not out.is_file() or out.stat().st_size < 120:
        return None, "wrote an empty file"
    return ("/api/cover?path=" + requests.utils.quote(str(out)) + f"&v={int(time.time())}",
            (result.stdout or "").strip()[:120])


def save_cover(source, game_id):
    """Copy the chosen image next to the store so the path guard stays simple
    and the cover survives you moving the original file."""
    import shutil
    src = Path(source)
    if not src.is_file(): return None
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    target = COVER_DIR / (re.sub(r"[^a-z0-9]+", "-", game_id.lower()).strip("-") + src.suffix.lower())
    shutil.copyfile(src, target)
    return "/api/cover?path=" + requests.utils.quote(str(target)) + f"&v={int(time.time())}"


_DATA_URL_RE = re.compile(r"^data:image/(\w+);base64,(.+)$", re.S)
_IMG_EXT_BY_MIME = {"jpeg": ".jpg", "jpg": ".jpg", "png": ".png", "webp": ".webp", "gif": ".gif", "bmp": ".bmp"}

def save_uploaded_image_data(data_url, stem):
    """Writes a browser file-picker's data: URL into COVER_DIR under a
    fixed filename stem (any existing file with that stem is replaced
    first, so switching from a .png to a .jpg doesn't leave the old one
    behind) - the upload counterpart to save_cover(), which only ever
    copies a file that's already on disk. Shared by the profile photo and
    the custom background image uploads - same 8MB sanity cap, same
    /api/cover serving convention, just a different stem per caller."""
    found = _DATA_URL_RE.match(data_url)
    if not found: return None
    ext = _IMG_EXT_BY_MIME.get(found.group(1).lower(), ".jpg")
    try:
        raw = base64.b64decode(found.group(2))
    except Exception:
        return None
    if not raw or len(raw) > 8 * 1024 * 1024: return None  # 8MB sanity cap
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    for stale in COVER_DIR.glob(f"{stem}.*"):
        try: stale.unlink()
        except OSError: pass
    target = COVER_DIR / f"{stem}{ext}"
    target.write_bytes(raw)
    return "/api/cover?path=" + requests.utils.quote(str(target)) + f"&v={int(time.time())}"

def save_profile_photo_data(data_url):
    return save_uploaded_image_data(data_url, "profile-photo")

def effective_layout(store, view):
    """Merge saved panel positions/sizes over the built-in defaults, rather
    than trusting the save blindly - a panel added after you last touched
    the layout still needs to land somewhere, and one that no longer exists
    shouldn't linger as a ghost entry forever."""
    base = DEFAULT_LAYOUTS.get(view, {"order": [], "sizes": {}, "hidden": []})
    saved = (store.get("layouts") or {}).get(view) or {}
    sizes = {**base["sizes"], **(saved.get("sizes") or {})}
    # Views like "plex-home" register with an empty base["sizes"] on
    # purpose (panel ids are per-user/dynamic - one per Plex library the
    # user actually has - so there's no fixed default set to check
    # membership against). For those, filtering order/hidden against
    # base["sizes"] would strip every saved entry, since that dict is
    # always empty: a resized panel survives (sizes is a plain merge,
    # not filtered) but a hidden or reordered one silently reverted
    # every time - the bug behind "hide panel isn't saved for Plex".
    # Skip the ghost-id pruning for these views and trust what was
    # saved; a stale id left behind by a since-removed panel is inert
    # (PanelGrid.tsx already tolerates ids with no matching panel).
    dynamic = not base["sizes"]
    def known(pid):
        return dynamic or pid in base["sizes"]
    order = [p for p in (saved.get("order") or base["order"]) if known(p)]
    order += [p for p in base["order"] if p not in order]
    # "hidden" has to fall back the same way "order" does - an empty list is
    # a real, meaningful choice ("show everything"), so only trust it once
    # the user has actually saved one; before that, use the defaults.
    raw_hidden = saved["hidden"] if "hidden" in saved else base["hidden"]
    hidden = [p for p in raw_hidden if known(p)]
    return {"order": order, "sizes": sizes, "hidden": hidden}

def collect_ui(cfg, _shared):
    """Nav labels, visibility and the profile - polled so a settings change
    reaches the page without a reload."""
    store = load_store()
    return {"views": store.get("views") or [dict(v) for v in DEFAULT_VIEWS],
            "profile": store.get("profile") or {},
            "pages": store.get("pages") or [],
            "layouts": {v: effective_layout(store, v) for v in DEFAULT_LAYOUTS},
            # Applied at boot (theme too, via profile above) rather than
            # only inside the Settings surface itself - a toggle in
            # Settings > Appearance should take effect on the next poll
            # everywhere, not just next time Settings happens to be open.
            "prefs": {"reduced_motion": truthy(cfg.get("reduced_motion")),
                      "sidebar_default_collapsed": truthy(cfg.get("sidebar_default_collapsed")),
                      "default_app": str(cfg.get("default_app") or "overview"),
                      "background_mode": str(cfg.get("background_mode") or "wallpaper"),
                      "background_color": str(cfg.get("background_color") or ""),
                      "background_image": str(cfg.get("background_image") or "")}}


def collect_apps(_cfg, _shared):
    store = load_store()
    return {"apps": [a for a in store["apps"] if a.get("label")]}


def collect_games(cfg, _shared):
    ignore = set(csv_list(cfg["games_ignore"]))
    games = []
    seen = set()

    playtimes = _steam_playtimes(cfg["steam_path"])
    for root in _steam_libraries(cfg["steam_path"]):
        for manifest in root.glob("appmanifest_*.acf"):
            try: text = manifest.read_text(encoding="utf-8", errors="ignore")
            except Exception: continue
            appid = re.search(r'"appid"\s*"(\d+)"', text)
            name = re.search(r'"name"\s*"([^"]*)"', text)
            played = re.search(r'"LastPlayed"\s*"(\d+)"', text)
            size = re.search(r'"SizeOnDisk"\s*"(\d+)"', text)
            if not appid or not name: continue
            aid = appid.group(1)
            if aid in ignore or aid in seen: continue
            seen.add(aid)
            pt = playtimes.get(aid) or {}
            games.append({
                "id": aid, "name": name.group(1),
                "last_played": int(played.group(1)) if played else 0,
                "size": round(int(size.group(1)) / 1024 ** 3, 1) if size else None,
                # Steam's own local data only ever tracks a rolling ~2 weeks,
                # not calendar weeks - there's no daily breakdown anywhere on
                # disk to compute an actual "this week" from.
                "playtime_2wk": round(pt.get("two_wk", 0) / 60, 1),
                "playtime_forever": round(pt.get("forever", 0) / 60, 1),
                "launch": f"steam://rungameid/{aid}",
                "art": (_steam_local_art(cfg, aid) or f"https://cdn.cloudflare.steamstatic.com/steam/apps/{aid}/library_600x900.jpg"),
                "art_alts": [
                    f"https://cdn.cloudflare.steamstatic.com/steam/apps/{aid}/library_600x900.jpg",
                    f"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{aid}/library_600x900.jpg",
                    f"https://cdn.cloudflare.steamstatic.com/steam/apps/{aid}/library_capsule.jpg",
                    f"https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{aid}/header.jpg",
                ],
                "art_fallback": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{aid}/header.jpg", "source": "steam",
            })

    for line in (cfg["extra_games"] or "").splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2 or not parts[0]: continue
        games.append({"id": "x-" + re.sub(r"\W+", "", parts[0].lower()), "name": parts[0], "last_played": 0, "size": None,
                      "launch": parts[1], "art": parts[2] if len(parts) > 2 and parts[2] else None, "art_fallback": None, "source": "manual"})

    if truthy(cfg["xbox_enabled"]): games += _xbox_games(cfg, _start_apps())
    if truthy(cfg["battlenet_enabled"]): games += _battlenet_games(cfg)
    if truthy(cfg["riot_enabled"]): games += _riot_games(cfg)

    store = load_store()
    for entry in store["manual"]:
        if not entry.get("name"): continue
        games.append({"id": entry.get("id") or "m-" + re.sub(r"\W+", "", entry["name"].lower()),
                      "name": entry["name"], "last_played": entry.get("last_played", 0), "size": None,
                      "launch": entry.get("launch") or "", "art": entry.get("art"),
                      "art_fallback": None, "source": "manual", "editable": True})

    unique, seen = [], set()
    for game in games:
        key = (game["source"], game["name"].strip().lower())
        if key in seen: continue
        seen.add(key)
        unique.append(game)
    games = unique
    _apply_art(cfg, games)

    # Store art wins over everything - Steam's cache, SteamGridDB, config
    # overrides. It's the only art you picked by hand inside the panel.
    hidden = set(store["hidden"])
    kept = []
    for game in games:
        if game["id"] in hidden: continue
        chosen = store["art"].get(game["id"])
        if chosen:
            game["art"] = chosen
            game["art_alts"] = []
            game["art_fallback"] = None
            game["custom_art"] = True
        kept.append(game)
    games = kept

    games.sort(key=lambda g: (-g["last_played"], g["name"].lower()))

    fav_ids = [i for i in (store.get("favorites") or []) if any(g["id"] == i for g in games)]
    fav_set = set(fav_ids)
    for game in games: game["favorite"] = game["id"] in fav_set
    by_id = {g["id"]: g for g in games}
    favorites = [by_id[i] for i in fav_ids if i in by_id]

    shelves = build_shelves(store, games)
    grouped = {}
    for game in games: grouped.setdefault(game["source"], []).append(game)
    playtime_chart = sorted(
        (g for g in games if g.get("playtime_2wk")),
        key=lambda g: -g["playtime_2wk"],
    )[:10]
    return {"games": games, "shelves": shelves, "grouped": grouped, "favorites": favorites,
            "recent": [g for g in games if g.get("last_played")][:12],
            "playtime_chart": [{"id": g["id"], "name": g["name"], "art": g.get("art"),
                                "launch": g.get("launch"), "hours": g["playtime_2wk"]} for g in playtime_chart],
            "hidden": sorted(hidden), "total": len(games),
            "by_source": {k: len(v) for k, v in grouped.items()}}

WALL_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

YT_RE = re.compile(r"(youtube\.com|youtu\.be)", re.I)

def _strip_html(text, limit=180):
    clean = re.sub(r"<[^>]+>", " ", str(text or ""))
    clean = re.sub(r"&(nbsp|amp|quot|#39|lt|gt);", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:limit]

_IMG_EXT_RE = re.compile(r"\.(jpe?g|png|gif|webp|avif|bmp)(?:$|\?)", re.I)

def _enclosure_image_url(enclosure):
    """<enclosure> is a generic "attached media" tag, not specifically an
    image one - Codrops (among others) uses it to attach an mp4 demo reel
    per post, which an <img> can never render, so that URL used to get
    handed out as `thumb` anyway and just silently failed to load. Only
    trust it as a thumbnail when its own declared type says image/*, or
    (no type given) the URL itself looks like one."""
    if enclosure is None: return None
    found_url = enclosure.get("url")
    if not found_url: return None
    mime = (enclosure.get("type") or "").lower()
    if mime: return found_url if mime.startswith("image/") else None
    return found_url if _IMG_EXT_RE.search(found_url) else None

def _feed_items(url, limit=12):
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime
    r = requests.get(url, timeout=12, headers={"User-Agent": "desk-panel/1.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/",
          "yt": "http://www.youtube.com/xml/schemas/2015"}
    def text(node, *paths):
        for path in paths:
            found = node.find(path, ns)
            if found is not None and (found.text or "").strip(): return found.text.strip()
        return None

    def pack(title, link, stamp, thumb, blurb, extra=None):
        host = ""
        try: host = (urlparse(link or "").hostname or "").replace("www.", "")
        except Exception: pass
        item = {"title": title or "(untitled)", "url": link, "when": stamp,
                "thumb": thumb, "blurb": _strip_html(blurb), "domain": host,
                "kind": "video" if YT_RE.search(link or "") else "link"}
        item.update(extra or {})
        return item

    items = []
    for node in root.findall(".//item")[:limit]:
        when = text(node, "pubDate")
        stamp = None
        if when:
            try: stamp = parsedate_to_datetime(when).timestamp()
            except Exception: stamp = None
        thumb = node.find("media:thumbnail", ns)
        enclosure = node.find("enclosure")
        # hnrss puts the discussion link in comments and the points in the body.
        comments = text(node, "comments")
        body = text(node, "description", "{http://purl.org/rss/1.0/modules/content/}encoded")
        points = None
        if body:
            found = re.search(r"(\d+)\s*points?", body)
            if found: points = int(found.group(1))
        items.append(pack(text(node, "title"), text(node, "link"), stamp,
                          (thumb.get("url") if thumb is not None else _enclosure_image_url(enclosure)),
                          body, {"comments": comments, "points": points,
                                 "author": text(node, "{http://purl.org/dc/elements/1.1/}creator")}))

    if not items:
        for node in root.findall("atom:entry", ns)[:limit]:
            link = node.find("atom:link", ns)
            when = text(node, "atom:published", "atom:updated")
            stamp = None
            if when:
                try: stamp = datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp()
                except Exception: stamp = None
            group = node.find("media:group", ns)
            thumb = group.find("media:thumbnail", ns) if group is not None else None
            blurb = None
            if group is not None:
                description = group.find("media:description", ns)
                blurb = description.text if description is not None else None
            views = None
            if group is not None:
                stats = group.find("media:community/media:statistics", ns)
                if stats is not None: views = stats.get("views")
            items.append(pack(text(node, "atom:title"),
                              link.get("href") if link is not None else None, stamp,
                              thumb.get("url") if thumb is not None else None, blurb,
                              {"author": text(node, "atom:author/atom:name"), "views": views}))
    return items

_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")

_ARTICLE_META_RE = {
    "title": re.compile(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    # Same pattern _fetch_og_image's own _OG_IMAGE_RE uses (defined further
    # down in the Reading section) - duplicated rather than shared since
    # this dict is built at module load, before that name exists yet.
    "image": re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    "description": re.compile(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    "published": re.compile(r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)["\']', re.I),
}

def _fetch_article_meta(url):
    """One request, every og:/article: meta tag this app cares about - the
    JSON-LD ItemList path below only ever gets bare URLs from the page
    (schema.org's ItemList has no title/image/date fields), so each entry
    needs its own real title/image/summary/timestamp the same way a
    single-article open already does (see _fetch_og_image) - just fetching
    all four at once here instead of image alone."""
    try:
        r = requests.get(url, timeout=6, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
    except Exception:
        return {}
    out = {}
    for key, pattern in _ARTICLE_META_RE.items():
        found = pattern.search(r.text)
        if found: out[key] = html_entities.unescape(found.group(1))
    return out

def _slug_title(url):
    """Readable-ish fallback if a meta fetch fails - most CMS URL slugs are
    the headline itself, dash-separated, with a trailing numeric id."""
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"-\d{3,}$", "", slug)
    return " ".join(w.capitalize() for w in slug.split("-")) or url

def _json_ld_listing_urls(html, origin_host, limit):
    """Many news CMSes (this one included) embed a schema.org ItemList as
    <script type="application/ld+json"> declaring exactly which articles
    belong to the current category/team/tag page - the same signal search
    engines use. It's far more precise than any DOM heuristic could be
    (it's the site's own explicit statement of "this page's listing"), and
    it's a generic, widely-used schema, not specific to this one site - so
    it's tried FIRST, before ever falling back to guessing from markup."""
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(match.group(1))
        except Exception:
            continue
        if data.get("@type") != "ItemList":
            continue
        urls = []
        for entry in data.get("itemListElement") or []:
            entry_url = entry.get("url") if isinstance(entry, dict) else None
            if not entry_url: continue
            host = (urlparse(entry_url).hostname or "").replace("www.", "")
            if host != origin_host: continue
            urls.append(entry_url)
            if len(urls) >= limit: break
        if urls: return urls
    return []

def _webpage_listing_items(url, limit=20):
    """Generic article-listing extraction for sources with no RSS/XML feed
    (e.g. a plain news section page) - no site-specific scraper. Tries the
    page's own JSON-LD ItemList first (see _json_ld_listing_urls - when a
    team/category page embeds one, it's the actual list of articles that
    belong to THIS page specifically, not just whatever repeated card
    pattern happens to be biggest, which can just as easily be a generic
    site-wide "trending" widget that has nothing to do with the page you
    asked for). Falls back to structural DOM clustering only when no
    ItemList is present. Raises on anything that doesn't look like a real
    listing either way (same as a broken RSS parse), so it lands in
    collect_reading's per-source `errors` dict exactly like today - no new
    frontend error path needed."""
    import lxml.html

    r = requests.get(url, timeout=12, headers={"User-Agent": "desk-panel/1.0"})
    r.raise_for_status()
    origin_host = (urlparse(url).hostname or "").replace("www.", "")

    listing_urls = _json_ld_listing_urls(r.text, origin_host, limit)
    if listing_urls:
        items = []
        for entry_url in listing_urls:
            meta = _fetch_article_meta(entry_url)
            when = None
            if meta.get("published"):
                try: when = datetime.fromisoformat(meta["published"].replace("Z", "+00:00")).timestamp()
                except Exception: when = None
            items.append({
                "title": meta.get("title") or _slug_title(entry_url),
                "url": entry_url, "when": when, "thumb": meta.get("image"),
                "blurb": _strip_html(meta.get("description"), limit=220) if meta.get("description") else "",
                "domain": origin_host, "kind": "link",
            })
        if items: return items

    doc = lxml.html.fromstring(r.text)
    doc.make_links_absolute(url)

    def is_boilerplate(node):
        for ancestor in node.iterancestors():
            if ancestor.tag in ("nav", "header", "footer"): return True
        return False

    def container_signature(anchor):
        """Nearest classed ancestor of this anchor - both its (tag, class)
        identity (the dict key candidates get grouped by) and the node
        itself (the "card" whose heading/image/time/summary belong to this
        entry), so callers never need to re-walk the tree a second time."""
        node = anchor.getparent()
        depth = 0
        while node is not None and depth < 4:
            cls = (node.get("class") or "").strip()
            if cls: return (node.tag, cls, depth), node
            node = node.getparent()
            depth += 1
        return None, None

    candidates = []
    for a in doc.iter("a"):
        href = a.get("href") or ""
        if not href.startswith(("http://", "https://")): continue
        host = (urlparse(href).hostname or "").replace("www.", "")
        if host != origin_host: continue
        if is_boilerplate(a): continue
        text = _strip_html(a.text_content())
        has_img = a.find(".//img") is not None or a.tag == "img"
        if len(text) < 20 and not has_img: continue
        sig, block = container_signature(a)
        if sig is None: continue
        candidates.append((sig, a, href, block))

    if not candidates:
        raise ValueError("no article listing found on that page")

    # Repetition count alone isn't enough - a "pick your team"/category
    # nav strip repeats just as reliably as a real article grid, and often
    # MORE times. Score each repeated cluster by how article-like its
    # members actually look: longer link text (nav items are short labels,
    # headlines aren't), a paragraph summary nearby, and article URLs
    # (most CMSes, this one included, end article paths in a numeric id -
    # a genuinely common pattern across many news sites, not specific to
    # one). Highest-scoring cluster wins, not just the most frequent one.
    _numeric_id_re = re.compile(r"\d{3,}")
    groups = {}
    for sig, a, href, block in candidates:
        groups.setdefault(sig, []).append((a, href, block))

    def cluster_score(members):
        count = len(members)
        avg_len = sum(len(_strip_html(a.text_content())) for a, _, _ in members) / count
        frac_numeric_id = sum(1 for _, href, _ in members if _numeric_id_re.search(href.rsplit("/", 1)[-1])) / count
        frac_has_p = sum(1 for _, _, block in members if block is not None and block.find(".//p") is not None) / count
        return count * (1 + avg_len / 30) * (1 + frac_numeric_id) * (1 + 0.5 * frac_has_p)

    scored = {sig: cluster_score(members) for sig, members in groups.items() if len(members) >= 3}
    if not scored:
        raise ValueError("no repeated listing pattern found on that page")
    winner = max(scored, key=lambda s: scored[s])

    seen_urls = set()
    items = []
    for sig, a, href, block in candidates:
        if sig != winner: continue
        clean_url = href.split("#")[0]
        if clean_url in seen_urls: continue
        seen_urls.add(clean_url)

        heading = None
        for tag in ("h1", "h2", "h3", "h4"):
            found = block.find(f".//{tag}") if block is not None else None
            if found is not None and _strip_html(found.text_content()):
                heading = found
                break
        title = _strip_html(heading.text_content()) if heading is not None else _strip_html(a.text_content())
        if not title:
            img = a.find(".//img")
            title = (img.get("alt") if img is not None else "") or ""
        if not title: continue

        img = block.find(".//img") if block is not None else None
        thumb = None
        if img is not None:
            thumb = img.get("src") or img.get("data-src")
            if not thumb and img.get("srcset"):
                thumb = img.get("srcset").split(",")[0].strip().split(" ")[0]
            if thumb: thumb = urljoin(url, thumb)

        when = None
        time_el = block.find(".//time") if block is not None else None
        if time_el is not None:
            raw_when = time_el.get("datetime") or time_el.text_content()
            found_date = _DATE_RE.search(raw_when or "")
            if found_date:
                try: when = datetime.fromisoformat(found_date.group(1)).timestamp()
                except Exception: when = None
        if when is None:
            # A leading "HH:MM " on the headline itself is a common fast-
            # news pattern (today's time, no date - the site's own layout
            # implies "today"). Strip it from the title either way so it
            # doesn't double up with the frontend's own timestamp display.
            leading_time = re.match(r"^(\d{1,2}):(\d{2})\s+(.+)", title)
            if leading_time:
                hh, mm, rest = int(leading_time.group(1)), int(leading_time.group(2)), leading_time.group(3)
                if 0 <= hh < 24 and 0 <= mm < 60:
                    now = datetime.now()
                    stamp = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
                    if stamp.timestamp() > time.time(): stamp -= timedelta(days=1)
                    when = stamp.timestamp()
                    title = rest

        blurb = ""
        if block is not None:
            for p in block.iter("p"):
                candidate_text = _strip_html(p.text_content())
                if candidate_text and candidate_text != title:
                    blurb = candidate_text
                    break

        items.append({"title": title, "url": clean_url, "when": when, "thumb": thumb,
                      "blurb": blurb, "domain": origin_host, "kind": "link"})
        if len(items) >= limit: break

    if not items:
        raise ValueError("no article listing found on that page")
    return items

FEED_PRESETS = [
    {"group": "Design", "feeds": [
        {"label": "Smashing Magazine", "url": "https://www.smashingmagazine.com/feed/"},
        {"label": "A List Apart", "url": "https://alistapart.com/main/feed/"},
        {"label": "Nielsen Norman Group", "url": "https://www.nngroup.com/feed/rss/"},
        {"label": "CSS-Tricks", "url": "https://css-tricks.com/feed/"},
        {"label": "Sidebar", "url": "https://sidebar.io/feed.xml"},
        {"label": "Godly", "url": "https://godly.website/rss.xml"},
        {"label": "Typewolf", "url": "https://www.typewolf.com/feed"},
    ]},
    {"group": "Tech", "feeds": [
        {"label": "Hacker News", "url": "https://hnrss.org/frontpage"},
        {"label": "Hacker News · 300+", "url": "https://hnrss.org/frontpage?points=300"},
        {"label": "Lobsters", "url": "https://lobste.rs/rss"},
        {"label": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index"},
        {"label": "The Verge", "url": "https://www.theverge.com/rss/index.xml"},
        {"label": "404 Media", "url": "https://www.404media.co/rss/"},
        {"label": "Simon Willison", "url": "https://simonwillison.net/atom/everything/"},
    ]},
    {"group": "Hardware", "feeds": [
        {"label": "AnandTech", "url": "https://www.anandtech.com/rss/"},
        {"label": "Tom's Hardware", "url": "https://www.tomshardware.com/feeds/all"},
        {"label": "ServeTheHome", "url": "https://www.servethehome.com/feed/"},
        {"label": "Phoronix", "url": "https://www.phoronix.com/rss.php"},
    ]},
    {"group": "Gaming", "feeds": [
        {"label": "Eurogamer", "url": "https://www.eurogamer.net/feed"},
        {"label": "Rock Paper Shotgun", "url": "https://www.rockpapershotgun.com/feed"},
        {"label": "Digital Foundry", "url": "https://www.eurogamer.net/feed/digitalfoundry"},
        {"label": "r/patientgamers", "url": "https://www.reddit.com/r/patientgamers/.rss"},
    ]},
    {"group": "Homelab", "feeds": [
        {"label": "r/homelab", "url": "https://www.reddit.com/r/homelab/.rss"},
        {"label": "r/selfhosted", "url": "https://www.reddit.com/r/selfhosted/.rss"},
        {"label": "Home Assistant", "url": "https://www.home-assistant.io/atom.xml"},
        {"label": "Immich releases", "url": "https://github.com/immich-app/immich/releases.atom"},
    ]},
]

YT_CHANNEL_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id="

# Seeded into reading_sources on first run (see load_store()'s migration).
# Deliberately a small, curated starting set spanning tech/ai/design/world
# plus 2-3 YouTube channels, not a wall of presets - more can be added later
# via source management without a redesign.
DEFAULT_READING_SOURCES = [
    {"id": "hn", "type": "rss", "label": "Hacker News", "url": "https://hnrss.org/frontpage", "topic": "tech", "enabled": True},
    {"id": "verge", "type": "rss", "label": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "topic": "tech", "enabled": True},
    {"id": "arstechnica", "type": "rss", "label": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "topic": "tech", "enabled": True},
    {"id": "404media", "type": "rss", "label": "404 Media", "url": "https://www.404media.co/rss/", "topic": "tech", "enabled": True},
    {"id": "simonw", "type": "rss", "label": "Simon Willison", "url": "https://simonwillison.net/atom/everything/", "topic": "ai", "enabled": True},
    {"id": "smashing", "type": "rss", "label": "Smashing Magazine", "url": "https://www.smashingmagazine.com/feed/", "topic": "design", "enabled": True},
    {"id": "sidebar", "type": "rss", "label": "Sidebar", "url": "https://sidebar.io/feed.xml", "topic": "design", "enabled": True},
    {"id": "world-bbc", "type": "rss", "label": "BBC World", "url": "http://feeds.bbci.co.uk/news/world/rss.xml", "topic": "world", "enabled": True},
    {"id": "yt-fireship", "type": "youtube", "label": "Fireship", "url": YT_CHANNEL_FEED + "UCsBjURrPoezykLs9EqgamOA", "topic": "youtube", "enabled": True},
    {"id": "yt-theverge", "type": "youtube", "label": "The Verge", "url": YT_CHANNEL_FEED + "UCddiUEpeqJcYeBxX1IVBKvQ", "topic": "youtube", "enabled": True},
    {"id": "yt-veritasium", "type": "youtube", "label": "Veritasium", "url": YT_CHANNEL_FEED + "UCHnyfMqiRRG1u-2MsSQLbXA", "topic": "youtube", "enabled": True},
]

def parse_subscriptions(text):
    """Turn a YouTube subscription export into feed lines.

    There is no keyless way to read someone's subscriptions - that needs OAuth
    and a Google Cloud project. But both of YouTube's own exports carry
    everything needed: Takeout gives a CSV of channel ids, and the older
    subscription manager gives OPML. Either one pasted in here works, and it's a
    one-off rather than a login the panel has to keep alive.
    """
    text = str(text or "")
    found, seen = [], set()

    # OPML / any XML with xmlUrl attributes
    for match in re.finditer(r'<outline[^>]*?>', text, re.I):
        tag = match.group(0)
        url = re.search(r'xmlUrl="([^"]+)"', tag, re.I)
        title = re.search(r'title="([^"]+)"', tag, re.I) or re.search(r'text="([^"]+)"', tag, re.I)
        if not url: continue
        feed = url.group(1).replace("&amp;", "&")
        if feed in seen: continue
        seen.add(feed)
        found.append({"label": (title.group(1) if title else "Channel").replace("&amp;", "&"),
                      "url": feed})

    if not found:
        # Takeout CSV: Channel Id, Channel Url, Channel Title
        for line in text.splitlines():
            line = line.strip()
            if not line or line.lower().startswith("channel id"): continue
            parts = [p.strip().strip('"') for p in line.split(",")]
            cid = next((p for p in parts if re.fullmatch(r"UC[A-Za-z0-9_-]{22}", p)), None)
            if not cid:
                match = re.search(r"(UC[A-Za-z0-9_-]{22})", line)
                cid = match.group(1) if match else None
            if not cid or cid in seen: continue
            seen.add(cid)
            title = parts[-1] if parts and parts[-1] and not parts[-1].startswith("http") else cid
            found.append({"label": title, "url": YT_CHANNEL_FEED + cid})

    return found


def collect_feeds(cfg, _shared):
    feeds = []
    for line in (cfg["feeds"] or "").splitlines():
        line = line.strip()
        if not line or "|" not in line: continue
        label, url = line.split("|", 1)
        label, url = label.strip(), url.strip()
        try:
            items = _feed_items(url, int(cfg.get("feed_items", "12")))
            feeds.append({"label": label, "url": url, "items": items})
        except Exception as e:
            feeds.append({"label": label, "url": url, "items": [], "error": str(e)[:120]})
    return {"feeds": feeds}

READING_TOPICS = ["tech", "ai", "design", "world", "travel", "games", "interesting", "youtube", "sport"]

_HN_BLURB_RE = re.compile(r"Article URL:\s*\S+|Comments URL:\s*\S+|Points:\s*\d+|#\s*Comments:\s*\d+", re.I)

def _clean_blurb(text):
    """hnrss (and similar feeds) put a templated 'Article URL: ... Comments
    URL: ... Points: N # Comments: N' string in <description> instead of an
    actual summary - showing that as if it were the article's own excerpt
    is actively misleading, not just unhelpful. Strip those known fields;
    if nothing real is left, there's no genuine excerpt for this item (the
    frontend's TextCard already handles a missing blurb gracefully)."""
    cleaned = _HN_BLURB_RE.sub("", text or "").strip(" -·|").strip()
    return cleaned if len(cleaned) > 8 else ""

def _normalize_reading_item(source, raw):
    """One shared shape for both RSS articles and YouTube videos (raw items
    from _feed_items()), so the frontend only ever branches on `kind` for
    presentation, never on which backend quirk produced the item."""
    url = raw.get("url") or ""
    item_id = hashlib.sha1(f"{source['id']}|{url}".encode()).hexdigest()[:16]
    blurb = _clean_blurb(raw.get("blurb"))
    return {
        "id": item_id,
        # Kind follows the *source's* own type, not a guess based on
        # where a given item happens to link to - an HN submission that
        # links to a YouTube video is still an HN article, not "from
        # YouTube" (that section is "from your subscribed channels", not
        # "any link that happens to point at youtube.com").
        "kind": "video" if source.get("type") == "youtube" else "article",
        "source_id": source["id"], "source_label": source["label"], "topic": source["topic"],
        "title": raw.get("title") or "(untitled)", "url": url, "domain": raw.get("domain") or "",
        "author": raw.get("author"), "published": raw.get("when"),
        "thumb": raw.get("thumb"), "blurb": blurb,
        # Word count isn't known from an RSS summary alone - this is a rough
        # floor from the blurb length only; the article-detail view recomputes
        # it for real once trafilatura has extracted the full text (see the
        # /api/reading/article route, added in Phase 2).
        "read_minutes": max(1, len(blurb) // 1000),
        # YouTube's own feed XML carries no duration (that needs the Data API,
        # which needs a key we don't have) - always None for now, a known gap
        # rather than a faked value.
        "duration_seconds": None,
        "saved": False, "read": False,
    }

def _normalize_bookmark(b):
    """Same shape as _normalize_reading_item() so ArticleDetail/ReadingCard
    render a bookmark with zero special-casing - the only real difference
    is where it came from (pasted by hand, not polled from a subscribed
    source). Always `saved: True`: adding a bookmark IS the save action,
    there's no separate un-saved state for something you pasted in."""
    blurb = b.get("blurb") or ""
    return {
        "id": b["id"], "kind": "article", "source_id": "bookmark",
        "source_label": b.get("source_label") or b.get("domain") or "Bookmark",
        "topic": b.get("topic") or "interesting", "title": b.get("title") or b["url"],
        "url": b["url"], "domain": b.get("domain") or "", "author": None,
        "published": b.get("added_at"), "thumb": b.get("thumb"), "blurb": blurb,
        "read_minutes": max(1, len(blurb) // 1000), "duration_seconds": None,
        "saved": True, "read": False,
    }

_OG_IMAGE_CACHE_FILE = CONFIG_DIR / "og-image-cache.json"
_OG_IMAGE_RE = re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I)
# Some feeds (Codrops among them) carry no image at all in their RSS -
# every <enclosure> is a video demo reel, no media:thumbnail, nothing.
# Rather than leave those permanently text-only, the article's own og:image
# meta tag (same thing a Slack/Discord link preview reads) gets fetched
# once per URL, ever, and cached to disk - collect_reading runs every 15
# minutes (see INTERVALS), so a handful of extra page fetches per cycle
# is cheap, and a capped budget keeps one large backlog from stalling a
# single collector run.
_OG_IMAGE_BUDGET_PER_CYCLE = 40

def _load_og_image_cache():
    try: return json.loads(_OG_IMAGE_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save_og_image_cache(cache):
    try:
        _OG_IMAGE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _OG_IMAGE_CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
    except OSError: pass

def _fetch_og_image(url):
    try:
        # A single `iter_content` read doesn't reliably return a full 64KB
        # just because that's the chunk_size asked for - it returns
        # whatever the network buffered in one read, which was routinely
        # under 20KB in practice. og:image is often past that (Colossal's
        # sits ~77KB in) once a page has enough head content ahead of it,
        # so every one of those was silently coming back "not found".
        # This is a one-time-per-URL background fetch (cached forever
        # after), so just reading the real page is the simple fix.
        r = requests.get(url, timeout=10, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        found = _OG_IMAGE_RE.search(r.text)
        # HTML attribute values escape `&` as `&amp;` - a raw regex pull
        # off the page keeps that literal text instead of a real query
        # separator, which 502'd every fetch through /api/reading/thumb
        # for any og:image URL with more than one query parameter.
        return html_entities.unescape(found.group(1)) if found else None
    except Exception:
        return None

def _backfill_thumbs(items):
    """Mutates `items` in place - fills `thumb` for article items that
    have none, from a per-URL disk cache first and a bounded number of
    live og:image fetches second. Round-robins across sources for the
    live-fetch budget - one source with a big backlog of missing thumbs
    (rockpapershotgun's RSS carries none either, as it turns out) would
    otherwise burn the whole budget before a smaller source like Codrops
    ever got a turn."""
    cache = _load_og_image_cache()
    changed = False

    by_source: dict[str, list[dict]] = {}
    for item in items:
        if item["thumb"] or item["kind"] != "article": continue
        url = item["url"]
        if url in cache:
            if cache[url]: item["thumb"] = cache[url]
            continue
        by_source.setdefault(item["source_id"], []).append(item)

    queues = list(by_source.values())
    budget = _OG_IMAGE_BUDGET_PER_CYCLE
    while budget > 0 and queues:
        for queue in list(queues):
            if budget <= 0: break
            item = queue.pop(0)
            if not queue: queues.remove(queue)
            found = _fetch_og_image(item["url"])
            cache[item["url"]] = found  # cache the miss too - never re-fetched
            changed = True
            if found: item["thumb"] = found
            budget -= 1

    if changed: _save_og_image_cache(cache)

def collect_reading(cfg, _shared):
    store = load_store()
    sources = [s for s in store["reading_sources"] if s.get("enabled")]
    saved_ids = {s["id"] for s in store["reading_saved"]}
    read_ids = {r["id"] for r in store["reading_read"]}
    hidden_ids = {h["id"] for h in store["reading_hidden"]}
    items, errors = [], {}
    for source in sources:
        try:
            if source.get("type") == "webpage":
                raw_items = _webpage_listing_items(source["url"], limit=20)
            else:
                raw_items = _feed_items(source["url"], limit=20)
        except Exception as e:
            errors[source["id"]] = str(e)[:120]
            continue
        for raw in raw_items:
            item = _normalize_reading_item(source, raw)
            if item["id"] in hidden_ids: continue
            item["saved"] = item["id"] in saved_ids
            item["read"] = item["id"] in read_ids
            items.append(item)
    _backfill_thumbs(items)
    items.sort(key=lambda i: i["published"] or 0, reverse=True)
    bookmarks = sorted((_normalize_bookmark(b) for b in store["reading_bookmarks"]),
                       key=lambda i: i["published"] or 0, reverse=True)
    return {"items": items, "sources": store["reading_sources"], "topics": READING_TOPICS,
            "books": store["books"], "bookmarks": bookmarks, "errors": errors, "fetched_at": time.time()}

def _reading_set_membership(list_key, item_id, want):
    """Shared body for save/read/hide - each is just 'is this id in this
    store list', add-or-remove, {id, at} entries so callers can show
    'saved 3 days ago' later without extra bookkeeping."""
    def mutate(store):
        lst = store.setdefault(list_key, [])
        without = [e for e in lst if e.get("id") != item_id]
        store[list_key] = without + ([{"id": item_id, "at": time.time()}] if want else [])
    edit_store(mutate)
    return {"ok": True}

def reading_set_saved(item_id, saved):
    return _reading_set_membership("reading_saved", item_id, saved)

def reading_set_read(item_id, read):
    return _reading_set_membership("reading_read", item_id, read)

def reading_hide_item(item_id):
    return _reading_set_membership("reading_hidden", item_id, True)

READING_SOURCE_TOPICS = ("tech", "ai", "design", "world", "travel", "games", "interesting", "youtube", "sport")

def reading_add_source(payload):
    label = str(payload.get("label") or "").strip()
    url = str(payload.get("url") or "").strip()
    if not label or not url: return {"ok": False, "error": "label and url required"}
    if payload.get("type") in ("rss", "youtube", "webpage"):
        source_type = payload["type"]
    else:
        source_type = "youtube" if YT_RE.search(url) else "rss"
    topic = payload.get("topic") if payload.get("topic") in READING_SOURCE_TOPICS else "interesting"
    base_id = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or hashlib.sha1(url.encode()).hexdigest()[:8]
    result = {"ok": True}
    def mutate(store):
        nonlocal result
        existing = store.setdefault("reading_sources", [])
        if any(s.get("url") == url for s in existing):
            result = {"ok": False, "error": "that source is already added"}
            return
        sid, used = base_id, {s["id"] for s in existing}
        while sid in used: sid += "-2"
        existing.append({"id": sid, "type": source_type, "label": label[:80], "url": url, "topic": topic, "enabled": True})
        result["id"] = sid
    edit_store(mutate)
    return result

def reading_edit_source(source_id, patch):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for s in store.get("reading_sources") or []:
            if s.get("id") != source_id: continue
            if str(patch.get("label") or "").strip():
                s["label"] = str(patch["label"]).strip()[:80]
            if patch.get("type") in ("rss", "youtube", "webpage"):
                s["type"] = patch["type"]
            if patch.get("topic") in READING_SOURCE_TOPICS:
                s["topic"] = patch["topic"]
            if "enabled" in patch:
                s["enabled"] = bool(patch["enabled"])
            result = {"ok": True}
    edit_store(mutate)
    return result

def reading_delete_source(source_id):
    def mutate(store):
        store["reading_sources"] = [s for s in store.get("reading_sources") or [] if s.get("id") != source_id]
    edit_store(mutate)
    return {"ok": True}

def reading_import_subscriptions(text):
    """Reuses parse_subscriptions() (the existing YouTube OPML/Takeout-CSV
    parser) - see FEED_PRESETS/YT_CHANNEL_FEED for the rest of that
    machinery. Dedupes against sources already saved by URL."""
    found = parse_subscriptions(text)
    if not found:
        return {"ok": False, "error": "Couldn't find any channels in that. "
                                      "Paste the Takeout subscriptions.csv or an OPML export."}
    added = 0
    def mutate(store):
        nonlocal added
        existing = store.setdefault("reading_sources", [])
        have_urls = {s.get("url") for s in existing}
        used_ids = {s["id"] for s in existing}
        for f in found:
            url = f["url"]
            if url in have_urls: continue
            have_urls.add(url)
            sid = re.sub(r"[^a-z0-9]+", "-", f["label"].lower()).strip("-") or hashlib.sha1(url.encode()).hexdigest()[:8]
            while sid in used_ids: sid += "-2"
            used_ids.add(sid)
            existing.append({"id": sid, "type": "youtube", "label": f["label"][:80], "url": url,
                             "topic": "youtube", "enabled": True})
            added += 1
    edit_store(mutate)
    return {"ok": True, "found": len(found), "added": added}

BOOK_STATUSES = ("reading", "want", "finished")

def search_open_library(query):
    """Proxies Open Library's search - no key needed, per the Reading
    redesign plan's Books decision. Returns a trimmed shape for the
    'add book' search-as-you-type UI, not the raw API response.

    `ok` distinguishes "genuinely no matches" (ok: True, results: []) from
    "the request itself failed" (ok: False, error: ...) - Open Library is
    occasionally slow/rate-limited/unreachable, and collapsing both into
    the same empty list made a real outage look identical to a bad search
    term, with no way to tell the user which one happened."""
    query = str(query or "").strip()
    if not query: return {"ok": True, "results": []}
    try:
        r = requests.get("https://openlibrary.org/search.json", params={"q": query, "limit": 10},
                         timeout=10, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        docs = r.json().get("docs") or []
    except requests.exceptions.Timeout:
        return {"ok": False, "results": [], "error": "Open Library took too long to respond"}
    except requests.exceptions.RequestException as e:
        return {"ok": False, "results": [], "error": str(e)[:140]}
    except Exception as e:
        return {"ok": False, "results": [], "error": f"Couldn't read Open Library's response ({str(e)[:100]})"}
    results = []
    for d in docs[:10]:
        cover_id = d.get("cover_i")
        results.append({
            "title": d.get("title") or "",
            "author": ", ".join(d.get("author_name") or []) or "Unknown",
            "openlibrary_key": d.get("key"),
            "cover_url": f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None,
            "first_publish_year": d.get("first_publish_year"),
        })
    return {"ok": True, "results": results}

_STEAM_NEWS_CACHE = {}
_STEAM_NEWS_TTL = 900  # matches the other slow-moving/rate-sensitive external calls in this file

def fetch_steam_news(appid, count=5):
    """Steam's own ISteamNews API - public, no key needed, and only ever
    called for games with source == "steam" (the appid IS collect_games'
    own game id for Steam entries, no separate id to look up). This is the
    one 'reliable source that already exists' the games-activity feature
    asked for; Xbox/Battle.net/Riot titles have no equivalent, so this
    stays Steam-only rather than inventing something shakier for them."""
    cache_key = str(appid)
    cached = _STEAM_NEWS_CACHE.get(cache_key)
    if cached and time.time() - cached["at"] < _STEAM_NEWS_TTL:
        return cached["value"]
    try:
        r = requests.get("https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/",
                         params={"appid": appid, "count": count, "maxlength": 280, "format": "json"},
                         timeout=8, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        raw_items = (r.json().get("appnews") or {}).get("newsitems") or []
    except Exception as e:
        value = {"ok": False, "items": [], "error": str(e)[:140]}
        _STEAM_NEWS_CACHE[cache_key] = {"at": time.time(), "value": value}
        return value
    items = [{"title": n.get("title") or "", "url": n.get("url") or "",
              "date": n.get("date"), "summary": _strip_html(n.get("contents"), limit=220),
              "author": n.get("author") or ""} for n in raw_items if n.get("title")]
    value = {"ok": True, "items": items}
    _STEAM_NEWS_CACHE[cache_key] = {"at": time.time(), "value": value}
    return value

def add_book(payload):
    title = str(payload.get("title") or "").strip()
    if not title: return {"ok": False, "error": "title required"}
    author = str(payload.get("author") or "").strip() or "Unknown"
    ol_key = str(payload.get("openlibrary_key") or "").strip() or None
    status = payload.get("status") if payload.get("status") in BOOK_STATUSES else "want"
    book_id = ("ol-" + ol_key.rstrip("/").split("/")[-1]) if ol_key else \
              ("manual-" + hashlib.sha1(f"{title}|{author}".encode()).hexdigest()[:10])
    now = time.time()
    book = {
        "id": book_id, "title": title[:200], "author": author[:150],
        "cover_url": str(payload.get("cover_url") or "").strip() or None,
        "status": status, "progress_pct": 100 if status == "finished" else 0,
        "pages": int(payload["pages"]) if str(payload.get("pages") or "").isdigit() else None,
        "added_at": now,
        "started_at": now if status == "reading" else None,
        "finished_at": now if status == "finished" else None,
        "openlibrary_key": ol_key, "notes": "",
        # Optional link to an actual reading copy - a direct PDF/EPUB URL,
        # a Google Drive share link, a personal server path, whatever the
        # user has. Makes the shelf something you can actually read from,
        # not just a progress tracker - see edit_book() for how it's set/
        # changed later, and BookDetail.tsx's reader overlay for playback.
        "file_url": str(payload.get("file_url") or "").strip() or None,
    }
    added = {"ok": True, "id": book_id}
    def mutate(store):
        if any(b.get("id") == book_id for b in store.get("books") or []):
            return  # already on the shelf - dedupe silently, not an error
        store.setdefault("books", []).append(book)
    edit_store(mutate)
    return added

def edit_book(book_id, patch):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for b in store.get("books") or []:
            if b.get("id") != book_id: continue
            if patch.get("status") in BOOK_STATUSES:
                b["status"] = patch["status"]
                # Reading now / Finished stamp their own timestamps the
                # first time you land there, same as toggle_task marking
                # `completed` - never overwritten on a later edit.
                if patch["status"] == "reading" and not b.get("started_at"):
                    b["started_at"] = time.time()
                if patch["status"] == "finished":
                    if not b.get("finished_at"): b["finished_at"] = time.time()
                    b["progress_pct"] = 100
            if "progress_pct" in patch:
                try: b["progress_pct"] = max(0, min(100, int(patch["progress_pct"])))
                except (TypeError, ValueError): pass
            if "notes" in patch:
                b["notes"] = str(patch.get("notes") or "")[:2000]
            if "file_url" in patch:
                b["file_url"] = str(patch.get("file_url") or "").strip() or None
            result = {"ok": True}
        return None
    edit_store(mutate)
    return result

def delete_book(book_id):
    def mutate(store):
        store["books"] = [b for b in store.get("books") or [] if b.get("id") != book_id]
    edit_store(mutate)
    return {"ok": True}

def add_bookmark(payload):
    """Raindrop-style 'paste a link' bookmark - fetches the page once,
    pulls title/image/description via trafilatura's metadata extractor
    (not the full-text extractor _extract_article uses; a bookmark needs
    a card's worth of metadata, not the whole article body up front - the
    reader still fetches full text on demand through the same
    /api/reading/article path every other article uses, since
    _normalize_bookmark gives it the same id/url shape)."""
    url = str(payload.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "that doesn't look like a URL"}
    bookmark_id = hashlib.sha1(url.encode()).hexdigest()[:16]
    topic = payload.get("topic") if payload.get("topic") in READING_SOURCE_TOPICS else "interesting"
    domain = (urlparse(url).hostname or "").replace("www.", "")
    title, image, excerpt, sitename = url, None, "", domain
    try:
        import trafilatura
        r = requests.get(url, timeout=15, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        if r.encoding is None or r.encoding.lower() == "iso-8859-1":
            r.encoding = r.apparent_encoding
        meta = trafilatura.extract_metadata(r.text, default_url=url).as_dict()
        title = (meta.get("title") or "").strip() or url
        image = meta.get("image") or None
        excerpt = (meta.get("description") or "").strip()
        sitename = (meta.get("sitename") or "").strip() or domain
    except Exception as e:
        errors_note = str(e)[:120]  # swallowed - a bookmark with just a URL as its title beats a hard failure
        _ = errors_note
    bookmark = {
        "id": bookmark_id, "url": url, "title": title[:200], "domain": domain,
        "source_label": sitename[:80], "thumb": image, "blurb": excerpt[:400],
        "topic": topic, "added_at": time.time(),
    }
    result = {"ok": True, "id": bookmark_id}
    def mutate(store):
        existing = store.setdefault("reading_bookmarks", [])
        if any(b.get("id") == bookmark_id for b in existing):
            return  # already bookmarked - dedupe silently
        existing.append(bookmark)
    edit_store(mutate)
    return result

def delete_bookmark(bookmark_id):
    def mutate(store):
        store["reading_bookmarks"] = [b for b in store.get("reading_bookmarks") or [] if b.get("id") != bookmark_id]
    edit_store(mutate)
    return {"ok": True}

def _extract_article(url, cache_id):
    """Full-text extraction for the article reader, for sites whose RSS
    feed only carries a short summary. Disk-cached by item id, including
    failures - a paywalled/broken URL costs one real fetch attempt ever,
    not one every time the reader is opened (same "cache the negative
    result too" shape as _griddb_art's in-memory cache)."""
    cache_file = ARTICLE_DIR / f"{cache_id}.json"
    if cache_file.is_file():
        try: return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception: pass

    import trafilatura  # lazy import, same convention as PIL elsewhere
    import lxml.html
    from lxml_html_clean import Cleaner
    result = {"ok": False, "error": "extraction failed"}
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        html = trafilatura.extract(
            r.text, output_format="html", include_images=True,
            include_links=True, include_formatting=True, favor_recall=True,
        )
        if html:
            # Extracted content is still third-party HTML - it gets
            # rendered client-side (article reader), so it's sanitized
            # here, at the one place both the network fetch and the
            # cache write happen, rather than trusted to the frontend.
            cleaner = Cleaner(scripts=True, javascript=True, comments=True, style=True,
                              links=False, meta=True, page_structure=True, embedded=True,
                              frames=True, forms=True, annoying_tags=True)
            clean_doc = cleaner.clean_html(lxml.html.fromstring(html))
            # Same hotlink problem thumbnails have, but inside the article
            # body itself - a browser loading these third-party image URLs
            # directly sends this app's own origin as Referer, which image
            # CDNs commonly reject. Route every <img> through the same
            # /api/reading/thumb proxy; baked into the cached HTML once
            # here rather than rewritten client-side on every read.
            for img in clean_doc.iter("img"):
                src = img.get("src")
                if not src: continue
                # Some sites emit root-relative image paths ("/games/x.png")
                # in their article markup - resolved against nothing, that
                # loads against THIS app's own origin instead of the
                # source site's, a guaranteed 404 shaped exactly like the
                # hotlink-block bug this proxy already fixes. Resolve
                # against the article's own URL first.
                absolute = urljoin(url, src)
                if absolute.startswith(("http://", "https://")):
                    img.set("src", "/api/reading/thumb?url=" + requests.utils.quote(absolute, safe=""))
                if "srcset" in img.attrib:
                    del img.attrib["srcset"]
            clean_html = lxml.html.tostring(clean_doc, encoding="unicode")
            word_count = len(re.sub(r"<[^>]+>", " ", clean_html).split())
            result = {"ok": True, "html": clean_html, "word_count": word_count}
        else:
            result = {"ok": False, "error": "no article content found"}
    except Exception as e:
        result = {"ok": False, "error": str(e)[:160]}

    try:
        ARTICLE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result), encoding="utf-8")
    except OSError:
        pass  # a cache miss every time is a perf issue, not a correctness one
    return result

def collect_wallpapers(cfg, _shared):
    folder = Path(cfg["wallpaper_dir"])
    if not folder.is_dir(): return {"dir": str(folder), "walls": [], "favorites": [], "error": "folder not found"}
    current = None
    try: current = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_source")
    except Exception: pass
    fav_paths = set(load_store().get("wallpaper_favorites") or [])
    walls = []
    current_bg = None
    if current and Path(current).is_file():
        current_bg = "/api/bg?path=" + requests.utils.quote(str(current))
    for path in sorted(folder.iterdir(), key=lambda x: x.stat().st_mtime if x.is_file() else 0, reverse=True):
        if path.suffix.lower() not in WALL_EXTS: continue
        sp = str(path)
        walls.append({"name": path.stem, "path": sp, "thumb": "/api/wall?path=" + requests.utils.quote(sp), "current": current == sp, "favorite": sp in fav_paths})
    limit = int(cfg.get("wallpaper_limit", "300"))
    favorites = [w for w in walls if w["favorite"]]
    return {"dir": str(folder), "walls": walls[:limit], "favorites": favorites, "total": len(walls), "current_path": current, "current_bg": current_bg}

_wall_thumbs = {}
def wall_thumb(path, size=(300, 250)):
    from PIL import Image
    import io
    # size is part of the cache key now that callers can request more than
    # one (the 300x250 grid crop and a larger hero/hover crop of the same
    # file) - without it the second size to ask for a given path would
    # silently get served the first size's cached bytes.
    key = f"{path}|{Path(path).stat().st_mtime_ns}|{size[0]}x{size[1]}"
    if key in _wall_thumbs: return _wall_thumbs[key]
    img = Image.open(path).convert("RGB")
    scale = max(size[0] / img.width, size[1] / img.height)
    img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
    left, top = (img.width - size[0]) // 2, (img.height - size[1]) // 2
    img = img.crop((left, top, left + size[0], top + size[1]))
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=82)
    data = buffer.getvalue()
    if len(_wall_thumbs) > 80: _wall_thumbs.clear()
    _wall_thumbs[key] = data
    return data

_bg_cache = {}
def wall_background(path, width=1600):
    from PIL import Image, ImageFilter, ImageEnhance
    import io
    key = f"{path}|{Path(path).stat().st_mtime_ns}|{width}"
    if key in _bg_cache: return _bg_cache[key]
    img = Image.open(path).convert("RGB")
    ratio = width / img.width
    img = img.resize((width, max(1, int(img.height * ratio))), Image.LANCZOS)
    img = img.filter(ImageFilter.GaussianBlur(width / 55))
    img = ImageEnhance.Brightness(img).enhance(0.68)
    img = ImageEnhance.Color(img).enhance(1.35)
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=76)
    data = buffer.getvalue()
    _bg_cache.clear()
    _bg_cache[key] = data
    return data

# ──────────────────────────────────────────────
#  FILES - recent screenshots and downloads, draggable out to the OS
# ──────────────────────────────────────────────

FILE_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

def _files_root(cfg, kind):
    key = "screenshots_dir" if kind == "screenshots" else "downloads_dir"
    return Path(str(cfg[key]).strip())

def _list_recent_files(root, limit=24):
    if not root.is_dir(): return []
    files = [p for p in root.iterdir() if p.is_file() and not p.name.startswith(".")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[:limit]:
        try: stat = p.stat()
        except OSError: continue
        out.append({"name": p.name, "path": str(p), "size": stat.st_size,
                    "when": stat.st_mtime, "is_image": p.suffix.lower() in FILE_IMG_EXTS})
    return out

def collect_files(cfg, _shared):
    return {
        "screenshots": _list_recent_files(_files_root(cfg, "screenshots")),
        "downloads": _list_recent_files(_files_root(cfg, "downloads")),
    }

def _files_resolve(cfg, kind, wanted):
    """Same containment pattern as note_path()/the wallpaper routes - resolve
    and prove the path is actually inside the one folder this kind is
    allowed to serve from, so a crafted ?path= can't walk anywhere else."""
    root = _files_root(cfg, kind).resolve()
    target = Path(wanted).resolve()
    if not str(target).startswith(str(root)) or not target.is_file():
        return None
    return target


def wallhaven_search(cfg, sorting="toplist", page=1, query="", top_range="1M", purity="100", categories="111"):
    params = {"sorting": sorting, "page": page, "purity": purity, "categories": categories, "atleast": cfg["wallhaven_atleast"]}
    if query.strip(): params["q"] = query.strip()
    if sorting == "toplist": params["topRange"] = top_range
    if cfg["wallhaven_key"].strip(): params["apikey"] = cfg["wallhaven_key"].strip()
    r = requests.get("https://wallhaven.cc/api/v1/search", params=params, timeout=15)
    if r.status_code == 429: return {"error": "Wallhaven rate limit reached. Wait a minute."}
    r.raise_for_status()
    data = r.json()
    return {"items": [{"id": item["id"], "thumb": (item.get("thumbs") or {}).get("small"), "full": item["path"], "w": item["dimension_x"], "h": item["dimension_y"], "favourites": item.get("favorites")} for item in data.get("data", [])], "last_page": (data.get("meta") or {}).get("last_page")}

def set_wallpaper(cfg, path):
    script = HERE.parent / "wallpicker.py"
    if not script.is_file() or not Path(path).is_file(): return False
    try:
        subprocess.Popen([sys.executable, str(script), "--set", str(path)],
                          creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return True
    except Exception: return False

def download_wallpaper(cfg, url, wall_id):
    folder = Path(cfg["wallpaper_dir"])
    folder.mkdir(parents=True, exist_ok=True)
    suffix = Path(urlparse(url).path).suffix or ".jpg"
    target = folder / f"wh-{wall_id}{suffix}"
    if not target.exists():
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        target.write_bytes(r.content)
    return target

def _persist_state(**kw):
    try: state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception: state = {}
    state.update(kw)
    try: STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception: pass

def _rerun_colorful_background():
    # OpenRGB/Chroma have no live-adjust path (rgb_paint_win.py has no
    # persistent daemon like chroma_paint.py's - every paint re-connects to
    # OpenRGB, re-samples the wallpaper and rewrites every device, which is
    # most of where the old 10-20s slider lag came from). Catching them up
    # still means re-running lights.py --colorful, but firing it detached
    # (Popen never blocks this request) means it no longer gates the HA
    # response below - the room lights react immediately, the PC/keyboard
    # catch up a couple of seconds later in the background.
    script = HERE.parent / "lights.py"
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

def launch_game(target):
    if not target: return False
    try:
        if isinstance(target, (list, tuple)):
            if not Path(target[0]).exists(): return False
            subprocess.Popen(list(target), cwd=str(Path(target[0]).parent))
            return True
        if target.lower().startswith("shell:appsfolder"):
            subprocess.Popen(["explorer.exe", target])
            return True
        # "spotify:" and "discord:" are perfectly good URIs with no slashes -
        # the old test demanded "://" and so treated them as file paths, which
        # is why every launchpad tile silently did nothing.
        looks_like_path = bool(re.match(r"^([a-zA-Z]:[\\/]|\\\\|\.{0,2}[\\/]|%\w+%)", target))
        if not looks_like_path and re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I):
            os.startfile(target)
            return True
        path = Path(os.path.expandvars(target))
        if not path.exists(): return False
        os.startfile(str(path))
        return True
    except Exception: return False

COLLECTORS = {
    "accent": collect_accent, "weather": collect_weather, "media": collect_media,
    "hardware": collect_hardware, "lights": collect_lights, "plex": collect_plex,
    "games": collect_games, "wallpapers": collect_wallpapers, "feeds": collect_feeds,
    "homelab": collect_homelab, "downloads": collect_downloads,
    "upcoming": collect_upcoming, "notes": collect_notes, "tasks": collect_tasks, "apps": collect_apps,
    "photo": collect_photo, "popular": collect_popular,
    "ui": collect_ui, "audio": collect_audio, "desktops": collect_desktops,
    "calendar": collect_calendar, "files": collect_files, "reading": collect_reading,
}

class Snapshot:
    def __init__(self, cfg):
        self.cfg = cfg
        self.lock = threading.Lock()
        self.data = {key: {} for key in COLLECTORS}
        self.data["accent"] = {"hex": None}
        self.stamps = {key: 0.0 for key in COLLECTORS}
        self.errors = {}
    def reload(self):
        """Re-read settings and re-run every collector. Called after a settings
        save, so changing the Plex token fixes the Plex tab in one poll rather
        than after you restart the panel."""
        self.cfg = load_config()
        for key in COLLECTORS:
            threading.Thread(target=self.refresh, args=(key,), daemon=True).start()

    def refresh(self, key):
        try:
            value = COLLECTORS[key](self.cfg, self.data)
            with self.lock:
                self.data[key] = value
                self.stamps[key] = time.time()
                self.errors.pop(key, None)
        except Exception as e:
            with self.lock: self.errors[key] = str(e)[:200]
    def loop(self):
        # First pass in parallel. Sequentially, one feed on a 12s timeout held up
        # every collector queued behind it, so the nav and the launchpad showed
        # up half a minute after the window opened.
        first = [threading.Thread(target=self.refresh, args=(key,), daemon=True)
                 for key in COLLECTORS]
        for t in first: t.start()
        for t in first: t.join(timeout=20)
        next_run = {key: time.time() + INTERVALS.get(key, 30) for key in COLLECTORS}
        next_run["accent"] = 0
        while True:
            now = time.time()
            for key in COLLECTORS:
                interval = INTERVALS.get(key, 30) if key != "accent" else 2
                if now >= next_run.get(key, 0):
                    self.refresh(key)
                    next_run[key] = now + interval
            time.sleep(0.5)
    def payload(self):
        with self.lock:
            return {"ts": time.time(), "iso": datetime.now(timezone.utc).astimezone().isoformat(), **{k: v for k, v in self.data.items()}, "errors": dict(self.errors)}

def make_handler(snapshot):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *_args): pass
        def _send(self, body, content_type="application/json", code=200):
            if isinstance(body, str): body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            route = urlparse(self.path)
            path = route.path
            if path in ("/", "/index.html"):
                try: return self._send((HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
                except OSError: return self._send("index.html is missing from the panel folder", "text/plain", 404)
            if path == "/api/data": return self._send(json.dumps(snapshot.payload()))
            if path == "/api/griddb":
                name = (parse_qs(route.query).get("name") or [""])[0]
                art = _griddb_art(snapshot.cfg, name) if name else None
                if art: return self._send(json.dumps({"url": art}))
                return self._send(json.dumps({"error": "not found"}), code=404)
            if path == "/api/store": return self._send(json.dumps(load_store()))
            if path == "/api/feed-presets":
                return self._send(json.dumps({"presets": FEED_PRESETS}))
            if path == "/api/reading/article":
                q = parse_qs(route.query)
                item_id = (q.get("id") or [""])[0]
                url = (q.get("url") or [""])[0]
                if not re.fullmatch(r"[a-f0-9]{16}", item_id) or not url:
                    return self._send(json.dumps({"ok": False, "error": "bad request"}), code=400)
                return self._send(json.dumps(_extract_article(url, item_id)))
            if path == "/api/books/search":
                q = (parse_qs(route.query).get("q") or [""])[0]
                return self._send(json.dumps(search_open_library(q)))
            if path == "/api/games/news":
                appid = (parse_qs(route.query).get("appid") or [""])[0]
                if not appid.isdigit():
                    return self._send(json.dumps({"ok": False, "items": [], "error": "bad appid"}), code=400)
                return self._send(json.dumps(fetch_steam_news(appid)))
            if path == "/api/settings":
                store = load_store()
                effective = load_config()
                values, origins = {}, {}
                for group in SETTINGS_SCHEMA:
                    for entry in group["keys"]:
                        key = entry["key"]
                        if key.startswith("_profile_"):
                            values[key] = store.get("profile", {}).get(key[9:], "")
                            origins[key] = "panel"
                            continue
                        values[key] = effective.get(key, "")
                        origins[key] = CONFIG_ORIGIN.get(key, "default")
                return self._send(json.dumps({
                    "schema": SETTINGS_SCHEMA, "values": values, "origins": origins,
                    "secrets": sorted(SECRET_KEYS),
                    "views": store.get("views") or DEFAULT_VIEWS,
                    "pages": store.get("pages") or [],
                    "profile": store.get("profile") or {},
                    "config_file": str(CONFIG_FILE),
                    "config_problem": CONFIG_ORIGIN.get("_file_problem"),
                    "store_file": str(STORE_FILE),
                }))
            if path == "/api/note":
                rel = (parse_qs(route.query).get("rel") or [""])[0]
                try: return self._send(json.dumps(read_note(snapshot.cfg, rel)))
                except Exception as e: return self._send(json.dumps({"ok": False, "error": str(e)[:140]}), code=400)
            if path == "/api/plex/item":
                rating_key = (parse_qs(route.query).get("ratingKey") or [""])[0]
                if not rating_key.isdigit():
                    return self._send(json.dumps({"error": "bad ratingKey"}), code=400)
                try: return self._send(json.dumps(plex_item_detail(snapshot.cfg, rating_key)))
                except Exception as e: return self._send(json.dumps({"error": str(e)[:160]}), code=502)
            if path == "/api/covers":
                q = parse_qs(route.query)
                name = (q.get("name") or [""])[0]
                appid = (q.get("appid") or [""])[0]
                if not name: return self._send(json.dumps({"covers": [], "error": "no name"}), code=400)
                return self._send(json.dumps(griddb_covers(snapshot.cfg, name,
                                                           appid if appid.isdigit() else None)))
            if path == "/api/app-icons":
                name = (parse_qs(route.query).get("name") or [""])[0]
                if not name: return self._send(json.dumps({"icons": [], "error": "no name"}), code=400)
                return self._send(json.dumps(griddb_icons(snapshot.cfg, name)))
            if path == "/api/pick":
                kind = (parse_qs(route.query).get("kind") or ["exe"])[0]
                return self._send(json.dumps({"path": pick_file(kind)}))
            if path == "/api/photo":
                wanted = (parse_qs(route.query).get("id") or [""])[0]
                if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", wanted):
                    return self._send("bad id", "text/plain", 400)
                try:
                    r = _immich(snapshot.cfg, f"/api/assets/{wanted}/thumbnail",
                                params={"size": "preview"})
                    if r is None: return self._send("immich not configured", "text/plain", 404)
                    r.raise_for_status()
                except Exception as e:
                    return self._send(f"immich: {e}", "text/plain", 502)
                self.send_response(200)
                self.send_header("Content-Type", r.headers.get("Content-Type", "image/jpeg"))
                self.send_header("Content-Length", str(len(r.content)))
                self.send_header("Cache-Control", "max-age=600")
                self.end_headers()
                return self.wfile.write(r.content)
            if path == "/api/cover":
                wanted = (parse_qs(route.query).get("path") or [""])[0]
                try: target = Path(wanted).resolve()
                except Exception: return self._send("bad path", "text/plain", 400)
                if not str(target).startswith(str(COVER_DIR.resolve())) or not target.is_file():
                    return self._send("not allowed", "text/plain", 403)
                kind = {".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp"}.get(target.suffix.lower(), "image/jpeg")
                return self._send(target.read_bytes(), kind)
            if path == "/api/wall":
                q = parse_qs(route.query)
                wanted = (q.get("path") or [""])[0]
                try:
                    target = Path(wanted).resolve()
                    root = Path(snapshot.cfg["wallpaper_dir"]).resolve()
                except Exception: return self._send("bad path", "text/plain", 400)
                if not str(target).startswith(str(root)) or not target.is_file(): return self._send("not allowed", "text/plain", 403)
                # Optional ?w=&h= for a bigger, crisper crop (Scene's hero,
                # hover previews) - defaults to the original 300x250 grid
                # thumbnail when omitted, so every existing caller is
                # unaffected. Clamped so this can't be abused into an
                # arbitrarily expensive resize.
                try:
                    w = min(2400, max(1, int((q.get("w") or ["300"])[0])))
                    h = min(2400, max(1, int((q.get("h") or ["250"])[0])))
                except ValueError:
                    w, h = 300, 250
                try: return self._send(wall_thumb(str(target), size=(w, h)), "image/jpeg")
                except Exception as e: return self._send(f"thumb failed: {e}", "text/plain", 500)
            if path == "/api/bg":
                wanted = (parse_qs(route.query).get("path") or [""])[0]
                try:
                    target = Path(wanted).resolve()
                    root = Path(snapshot.cfg["wallpaper_dir"]).resolve()
                except Exception: return self._send("bad path", "text/plain", 400)
                if not str(target).startswith(str(root)) or not target.is_file(): return self._send("not allowed", "text/plain", 403)
                try: body = wall_background(str(target))
                except Exception as e: return self._send(f"bg failed: {e}", "text/plain", 500)
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=3600")
                self.end_headers()
                return self.wfile.write(body)
            if path == "/api/reading/thumb":
                # A browser <img> loading a reading item's thumb straight
                # from its source site sends this app's own origin as
                # Referer - some sites (Codrops among them) hotlink-block
                # on exactly that, so the image just silently fails with
                # no error surfaced anywhere in the UI. Fetching it here
                # instead sends no Referer at all (requests never adds one
                # unless told to) and this app's normal UA, which is what
                # actually gets past that block - not a caching layer.
                wanted = (parse_qs(route.query).get("url") or [""])[0]
                if not wanted.startswith(("http://", "https://")):
                    return self._send("bad url", "text/plain", 400)
                try:
                    r = requests.get(wanted, timeout=10, headers={"User-Agent": "desk-panel/1.0"})
                    r.raise_for_status()
                    ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                    if not ctype.startswith("image/"): raise ValueError("not an image")
                except Exception:
                    return self._send("thumb unavailable", "text/plain", 502)
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(r.content)))
                self.send_header("Cache-Control", "max-age=3600")
                self.end_headers()
                return self.wfile.write(r.content)
            if path == "/api/filesys/thumb":
                q = parse_qs(route.query)
                kind = (q.get("kind") or [""])[0]
                wanted = (q.get("path") or [""])[0]
                if kind not in ("screenshots", "downloads"): return self._send("bad kind", "text/plain", 400)
                target = _files_resolve(snapshot.cfg, kind, wanted)
                if not target: return self._send("not allowed", "text/plain", 403)
                try: return self._send(wall_thumb(str(target), size=(220, 160)), "image/jpeg")
                except Exception as e: return self._send(f"thumb failed: {e}", "text/plain", 500)
            if path == "/api/filesys/file":
                q = parse_qs(route.query)
                kind = (q.get("kind") or [""])[0]
                wanted = (q.get("path") or [""])[0]
                if kind not in ("screenshots", "downloads"): return self._send("bad kind", "text/plain", 400)
                target = _files_resolve(snapshot.cfg, kind, wanted)
                if not target: return self._send("not allowed", "text/plain", 403)
                # Content-Disposition's filename is what the browser's own
                # "DownloadURL" drag-to-desktop mechanism uses to name the
                # file it writes - without it, a drag-out lands as a random
                # temp name instead of the screenshot's real filename.
                mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                body = target.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Content-Disposition", f'attachment; filename="{target.name}"')
                self.send_header("Cache-Control", "max-age=600")
                self.end_headers()
                return self.wfile.write(body)
            if path == "/api/wallhaven":
                q = parse_qs(route.query)
                try:
                    result = wallhaven_search(snapshot.cfg, sorting=(q.get("sorting") or ["toplist"])[0], page=int((q.get("page") or ["1"])[0]), query=(q.get("q") or [""])[0], top_range=(q.get("range") or ["1M"])[0], purity=(q.get("purity") or ["100"])[0], categories=(q.get("categories") or ["111"])[0])
                except Exception as e: result = {"error": str(e)[:160]}
                return self._send(json.dumps(result))
            if path == "/api/art":
                wanted = (parse_qs(route.query).get("path") or [""])[0]
                try: target = Path(wanted).resolve()
                except Exception: return self._send("bad path", "text/plain", 400)
                roots = [r.resolve() for r in _xbox_roots(snapshot.cfg)]
                cache = (Path(snapshot.cfg["steam_path"]) / "appcache" / "librarycache")
                if cache.is_dir(): roots.append(cache.resolve())
                if not any(str(target).startswith(str(r)) for r in roots): return self._send("outside the game folders", "text/plain", 403)
                if not target.is_file(): return self._send("not found", "text/plain", 404)
                kind = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(target.suffix.lower(), "application/octet-stream")
                return self._send(target.read_bytes(), kind)
            candidate = (HERE / path.lstrip("/")).resolve()
            if candidate.is_file() and str(candidate).startswith(str(HERE)):
                types = {".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2"}
                return self._send(candidate.read_bytes(), types.get(candidate.suffix.lower(), "application/octet-stream"))
            return self._send("not found", "text/plain", 404)
        def _body(self):
            length = int(self.headers.get("Content-Length") or 0)
            try: return json.loads(self.rfile.read(length) or b"{}")
            except Exception: return {}

        def _games_post(self, path, body):
            """Every one of these ends the same way: write the store, rebuild the
            games snapshot immediately so the next poll (2s away) already shows it."""
            if path == "/api/games/add":
                name = str(body.get("name") or "").strip()
                if not name: return {"ok": False, "error": "A name is required"}
                launch = body.get("launch") or ""
                gid = "m-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                art = body.get("art") or None
                if art and not str(art).startswith(("http", "/api/")):
                    art = save_cover(art, gid)
                def mutate(store):
                    store["manual"] = [m for m in store["manual"] if m.get("id") != gid]
                    store["manual"].append({"id": gid, "name": name, "launch": launch, "art": art})
                    if body.get("shelf"): store["place"][gid] = str(body["shelf"])
                    store["hidden"] = [h for h in store["hidden"] if h != gid]
                    return gid
                return {"ok": True, "id": edit_store(mutate)}

            if path == "/api/games/art":
                gid = str(body.get("id") or "")
                url = body.get("url")
                if not gid: return {"ok": False, "error": "no id"}
                if url and not str(url).startswith(("http", "/api/")):
                    url = save_cover(url, gid)
                    if not url: return {"ok": False, "error": "Couldn't read that image"}
                def mutate(store):
                    if url: store["art"][gid] = url
                    else: store["art"].pop(gid, None)      # falsy url = back to automatic
                    for entry in store["manual"]:
                        if entry.get("id") == gid: entry["art"] = url
                return edit_store(mutate) or {"ok": True, "url": url}

            if path == "/api/games/move":
                gid, shelf = str(body.get("id") or ""), str(body.get("shelf") or "")
                index = body.get("index")
                if not gid or not shelf: return {"ok": False, "error": "id and shelf required"}
                def mutate(store):
                    store["place"][gid] = shelf
                    for key, ids in store["order"].items():
                        if key != shelf: store["order"][key] = [i for i in ids if i != gid]
                    ids = [i for i in (store["order"].get(shelf) or []) if i != gid]
                    ids.insert(max(0, min(len(ids), int(index))) if index is not None else len(ids), gid)
                    store["order"][shelf] = ids
                return edit_store(mutate) or {"ok": True}

            if path == "/api/games/order":
                shelf = str(body.get("shelf") or "")
                ids = [str(i) for i in (body.get("ids") or [])]
                if not shelf: return {"ok": False, "error": "no shelf"}
                def mutate(store):
                    moved = set(ids)
                    for key in list(store["order"]):
                        if key != shelf:
                            store["order"][key] = [i for i in store["order"][key] if i not in moved]
                    store["order"][shelf] = ids
                    for gid in ids: store["place"][gid] = shelf
                return edit_store(mutate) or {"ok": True}

            if path == "/api/games/hide":
                gid = str(body.get("id") or "")
                hide = bool(body.get("hidden", True))
                def mutate(store):
                    others = [h for h in store["hidden"] if h != gid]
                    store["hidden"] = others + ([gid] if hide else [])
                return edit_store(mutate) or {"ok": True}

            if path == "/api/games/favorite":
                gid = str(body.get("id") or "")
                on = bool(body.get("favorite", True))
                if not gid: return {"ok": False, "error": "no id"}
                def mutate(store):
                    others = [f for f in store.get("favorites") or [] if f != gid]
                    store["favorites"] = others + ([gid] if on else [])
                return edit_store(mutate) or {"ok": True}

            if path == "/api/games/remove":
                gid = str(body.get("id") or "")
                def mutate(store):
                    was_manual = any(m.get("id") == gid for m in store["manual"])
                    store["manual"] = [m for m in store["manual"] if m.get("id") != gid]
                    store["art"].pop(gid, None)
                    store["place"].pop(gid, None)
                    for key, ids in store["order"].items():
                        store["order"][key] = [i for i in ids if i != gid]
                    # A discovered game can't be deleted, only hidden - it would
                    # just reappear on the next scan.
                    if not was_manual and gid not in store["hidden"]: store["hidden"].append(gid)
                    return was_manual
                return {"ok": True, "deleted": edit_store(mutate)}

            if path == "/api/apps/add":
                label = str(body.get("label") or "").strip()
                if not label: return {"ok": False, "error": "A name is required"}
                aid = "app-" + re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
                icon = body.get("icon") or None
                if icon and not str(icon).startswith(("http", "/api/")):
                    icon = save_cover(icon, aid)
                # clear=True means "leave it blank" - distinct from just not
                # passing an icon, which still gets the auto-detect attempt
                # (that's what makes adding a new app icon-less rare).
                if not icon and not body.get("clear"):
                    icon, _note = extract_icon(body.get("target"), aid)
                def mutate(store):
                    store["apps"] = [a for a in store["apps"] if a.get("id") != aid]
                    store["apps"].append({"id": aid, "label": label,
                                          "target": body.get("target") or "", "icon": icon})
                    return aid
                return {"ok": True, "id": edit_store(mutate)}

            if path == "/api/apps/icon-detect":
                target = body.get("target") or ""
                slug = str(body.get("id") or "app")
                icon, note = extract_icon(target, slug)
                if not icon: return {"ok": False, "error": note}
                return {"ok": True, "icon": icon}

            if path == "/api/apps/icons":
                store = load_store()
                found = 0
                misses = []
                for app in store["apps"]:
                    if app.get("icon") and not body.get("force"): continue
                    icon, note = extract_icon(app.get("target"), app.get("id") or app.get("label"))
                    if icon:
                        app["icon"] = icon
                        found += 1
                    else:
                        misses.append(f"{app.get('label')}: {note}")
                save_store(store)
                return {"ok": True, "found": found, "of": len(store["apps"]), "misses": misses[:6]}

            if path == "/api/apps/remove":
                aid = str(body.get("id") or "")
                def mutate(store):
                    store["apps"] = [a for a in store["apps"] if a.get("id") != aid]
                return edit_store(mutate) or {"ok": True}

            if path == "/api/apps/order":
                ids = [str(i) for i in (body.get("ids") or [])]
                def mutate(store):
                    known = {a["id"]: a for a in store["apps"]}
                    store["apps"] = [known[i] for i in ids if i in known] + \
                                    [a for a in store["apps"] if a["id"] not in ids]
                return edit_store(mutate) or {"ok": True}

            if path == "/api/settings/feeds-import":
                found = parse_subscriptions(body.get("text"))
                if not found:
                    return {"ok": False, "error": "Couldn't find any channels in that. "
                                                  "Paste the Takeout subscriptions.csv or an OPML export."}
                add = body.get("feeds") if isinstance(body.get("feeds"), list) else None
                chosen = add if add else [f"{f['label']} | {f['url']}" for f in found]
                def mutate(store):
                    current = (store.get("settings", {}).get("feeds")
                               or DEFAULTS["feeds"]).strip().splitlines()
                    have = {line.split("|", 1)[-1].strip() for line in current if "|" in line}
                    kept = [l.strip() for l in current if l.strip()]
                    added = 0
                    for line in chosen:
                        url = str(line).split("|", 1)[-1].strip()
                        if url in have: continue
                        have.add(url)
                        kept.append(str(line).strip())
                        added += 1
                    store.setdefault("settings", {})["feeds"] = "\n".join(kept)
                    return added
                added = edit_store(mutate)
                snapshot.reload()
                return {"ok": True, "found": len(found), "added": added,
                        "channels": [f["label"] for f in found[:40]]}

            if path == "/api/settings/save":
                values = body.get("values") or {}
                if not isinstance(values, dict): return {"ok": False, "error": "bad payload"}
                known = {e["key"] for g in SETTINGS_SCHEMA for e in g["keys"]}
                def mutate(store):
                    store.setdefault("settings", {})
                    store.setdefault("profile", {})
                    for key, value in values.items():
                        if key not in known: continue
                        if key.startswith("_profile_"):
                            field = key[9:]
                            if field == "photo" and value and not str(value).startswith(("http", "/api/")):
                                saved = save_cover(value, "profile-photo")
                                if saved: store["profile"]["photo"] = saved
                            else:
                                store["profile"][field] = str(value)
                            continue
                        text = "" if value is None else str(value)
                        # Blank means "stop overriding", not "set to empty" - so
                        # clearing a field in the panel falls back to config.ini
                        # rather than wiping a value you never touched here.
                        if text.strip() == "": store["settings"].pop(key, None)
                        else: store["settings"][key] = text
                    return True
                edit_store(mutate)
                snapshot.reload()
                return {"ok": True}

            if path == "/api/settings/profile-photo":
                # The upload counterpart to save_cover() (which only ever
                # handles a path already on disk) - a real file picker in
                # the browser can only ever hand this a data: URL, not a
                # local path, so this decodes and writes it the same way
                # save_cover copies an existing file into COVER_DIR.
                if body.get("remove"):
                    def mutate(store):
                        store.setdefault("profile", {})["photo"] = ""
                    edit_store(mutate)
                    for stale in COVER_DIR.glob("profile-photo.*"):
                        try: stale.unlink()
                        except OSError: pass
                    snapshot.reload()
                    return {"ok": True, "url": None}
                url = save_profile_photo_data(str(body.get("data") or ""))
                if not url: return {"ok": False, "error": "Couldn't read that image"}
                def mutate(store):
                    store.setdefault("profile", {})["photo"] = url
                edit_store(mutate)
                snapshot.reload()
                return {"ok": True, "url": url}

            if path == "/api/settings/background-image":
                # Same upload shape as /api/settings/profile-photo, just
                # writing into store["settings"]["background_image"]
                # instead of store["profile"]["photo"] - a plain settings
                # key like accent_override, not a profile field, so it
                # needs no special-cased read path in GET /api/settings.
                if body.get("remove"):
                    def mutate(store):
                        store.setdefault("settings", {}).pop("background_image", None)
                    edit_store(mutate)
                    for stale in COVER_DIR.glob("background-image.*"):
                        try: stale.unlink()
                        except OSError: pass
                    snapshot.reload()
                    return {"ok": True, "url": None}
                url = save_uploaded_image_data(str(body.get("data") or ""), "background-image")
                if not url: return {"ok": False, "error": "Couldn't read that image"}
                def mutate(store):
                    store.setdefault("settings", {})["background_image"] = url
                edit_store(mutate)
                snapshot.reload()
                return {"ok": True, "url": url}

            if path == "/api/settings/test-connection":
                # One generic reachability check every Integrations card
                # uses (see IntegrationsPage.tsx) instead of a bespoke
                # tester per service - a plain GET against whatever base
                # URL that integration is configured with, timed, with
                # the real status code or error surfaced back.
                url = str(body.get("url") or "").strip()
                if not url.startswith(("http://", "https://")):
                    return {"ok": False, "error": "no URL configured"}
                started = time.monotonic()
                try:
                    r = requests.get(url, timeout=6, headers={"User-Agent": "desk-panel/1.0"})
                    ms = round((time.monotonic() - started) * 1000)
                    return {"ok": r.status_code < 500, "status": r.status_code, "ms": ms}
                except Exception as e:
                    ms = round((time.monotonic() - started) * 1000)
                    return {"ok": False, "error": str(e)[:160], "ms": ms}

            if path == "/api/views":
                incoming = body.get("views")
                if not isinstance(incoming, list) or not incoming:
                    return {"ok": False, "error": "views must be a non-empty list"}
                allowed = {v["key"] for v in DEFAULT_VIEWS}
                def mutate(store):
                    built = []
                    for raw in incoming:
                        key = str((raw or {}).get("key") or "")
                        if key not in allowed or any(b["key"] == key for b in built): continue
                        built.append({"key": key,
                                      "label": str((raw or {}).get("label") or key).strip()[:24] or key,
                                      "visible": bool((raw or {}).get("visible", True))})
                    for view in DEFAULT_VIEWS:
                        if not any(b["key"] == view["key"] for b in built):
                            built.append(dict(view))
                    # Settings can be renamed and moved but never hidden, or you
                    # would have no way back to this screen.
                    for view in built:
                        if view["key"] == "settings": view["visible"] = True
                    store["views"] = built
                    return [v["key"] for v in built]
                return {"ok": True, "views": edit_store(mutate)}

            if path == "/api/shelves":
                incoming = body.get("shelves")
                if not isinstance(incoming, list) or not incoming:
                    return {"ok": False, "error": "shelves must be a non-empty list"}
                def mutate(store):
                    known = {s["id"]: s for s in store["shelves"]}
                    built, used = [], set()
                    for raw in incoming:
                        label = str((raw or {}).get("label") or "").strip()
                        if not label: continue
                        sid = str((raw or {}).get("id") or "").strip() or _slug(label)
                        while sid in used: sid += "-2"
                        used.add(sid)
                        built.append({"id": sid, "label": label,
                                      "claims": (raw or {}).get("claims", known.get(sid, {}).get("claims", []))})
                    if built: store["shelves"] = built
                    return [s["id"] for s in store["shelves"]]
                return {"ok": True, "shelves": edit_store(mutate)}

            if path == "/api/pages/add":
                label = str(body.get("label") or "").strip()
                if not label: return {"ok": False, "error": "A name is required"}
                def mutate(store):
                    used = {p["id"] for p in store.get("pages") or []}
                    pid = "page-" + _slug(label)
                    while pid in used: pid += "-2"
                    store.setdefault("pages", []).append(
                        {"id": pid, "label": label, "icon": str(body.get("icon") or "").strip() or "🔗", "items": []})
                    return pid
                return {"ok": True, "id": edit_store(mutate)}

            if path == "/api/pages/remove":
                pid = str(body.get("id") or "")
                def mutate(store):
                    store["pages"] = [p for p in store.get("pages") or [] if p["id"] != pid]
                return edit_store(mutate) or {"ok": True}

            if path == "/api/pages/rename":
                pid = str(body.get("id") or "")
                label = str(body.get("label") or "").strip()
                def mutate(store):
                    for p in store.get("pages") or []:
                        if p["id"] == pid:
                            if label: p["label"] = label
                            if body.get("icon") is not None: p["icon"] = str(body["icon"]).strip() or "🔗"
                return edit_store(mutate) or {"ok": True}

            if path == "/api/pages/item/add":
                pid = str(body.get("page") or "")
                label = str(body.get("label") or "").strip()
                url = str(body.get("url") or "").strip()
                if not label or not url: return {"ok": False, "error": "A name and a link are required"}
                icon = body.get("icon") or None
                iid = "item-" + _slug(label) + "-" + str(int(time.time() * 1000))[-6:]
                if icon and not str(icon).startswith(("http", "/api/")):
                    icon = save_cover(icon, iid)
                def mutate(store):
                    for p in store.get("pages") or []:
                        if p["id"] == pid:
                            p.setdefault("items", []).append({"id": iid, "label": label, "url": url, "icon": icon})
                            return iid
                    return None
                result = edit_store(mutate)
                return {"ok": bool(result), "id": result} if result else {"ok": False, "error": "no such page"}

            if path == "/api/pages/item/remove":
                pid = str(body.get("page") or "")
                iid = str(body.get("id") or "")
                def mutate(store):
                    for p in store.get("pages") or []:
                        if p["id"] == pid:
                            p["items"] = [i for i in p.get("items") or [] if i["id"] != iid]
                return edit_store(mutate) or {"ok": True}

            if path == "/api/pages/item/order":
                pid = str(body.get("page") or "")
                ids = [str(i) for i in (body.get("ids") or [])]
                def mutate(store):
                    for p in store.get("pages") or []:
                        if p["id"] == pid:
                            known = {i["id"]: i for i in p.get("items") or []}
                            p["items"] = [known[i] for i in ids if i in known] + \
                                        [i for i in p.get("items") or [] if i["id"] not in ids]
                return edit_store(mutate) or {"ok": True}

            if path == "/api/shelves/width":
                sid = str(body.get("id") or "")
                width = body.get("width")
                if not sid: return {"ok": False, "error": "no id"}
                def mutate(store):
                    store.setdefault("widths", {})
                    if width: store["widths"][sid] = round(float(width), 3)
                    else: store["widths"].pop(sid, None)   # falsy = back to automatic
                return edit_store(mutate) or {"ok": True}

            if path == "/api/layout/resize":
                view = str(body.get("view") or "")
                pid = str(body.get("id") or "")
                w, h = body.get("w"), body.get("h")
                if view not in DEFAULT_LAYOUTS or not pid: return {"ok": False, "error": "bad request"}
                def mutate(store):
                    layouts = store.setdefault("layouts", {})
                    entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
                    entry.setdefault("sizes", {})[pid] = {
                        "w": max(1, min(8, int(w or 1))), "h": max(1, min(20, int(h or 1)))}
                return edit_store(mutate) or {"ok": True}

            if path == "/api/layout/order":
                view = str(body.get("view") or "")
                order = [str(i) for i in (body.get("order") or [])]
                if view not in DEFAULT_LAYOUTS: return {"ok": False, "error": "bad request"}
                def mutate(store):
                    layouts = store.setdefault("layouts", {})
                    entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
                    entry["order"] = order
                return edit_store(mutate) or {"ok": True}

            if path == "/api/layout/hide":
                view = str(body.get("view") or "")
                pid = str(body.get("id") or "")
                hide = bool(body.get("hidden", True))
                if view not in DEFAULT_LAYOUTS or not pid: return {"ok": False, "error": "bad request"}
                def mutate(store):
                    layouts = store.setdefault("layouts", {})
                    entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
                    others = [p for p in entry.get("hidden") or [] if p != pid]
                    entry["hidden"] = others + ([pid] if hide else [])
                return edit_store(mutate) or {"ok": True}

            return None

        def do_POST(self):
            route = urlparse(self.path)
            if route.path.startswith("/api/note"):
                body = self._body()
                try:
                    if route.path == "/api/note/save":
                        result = write_note(snapshot.cfg, body.get("rel"), body.get("text") or "")
                    elif route.path == "/api/note/new":
                        result = new_note(snapshot.cfg, body.get("name"), body.get("folder") or "")
                    elif route.path == "/api/note/delete":
                        result = delete_note(snapshot.cfg, body.get("rel"))
                    elif route.path == "/api/note/rename":
                        result = rename_note(snapshot.cfg, body.get("rel"), body.get("name"))
                    elif route.path == "/api/note/pin":
                        result = pin_note(snapshot.cfg, body.get("rel"), bool(body.get("pinned", True)))
                    else:
                        return self._send("not found", "text/plain", 404)
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}), code=400)
                snapshot.refresh("notes")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/tasks"):
                body = self._body()
                if route.path == "/api/tasks/add":
                    result = add_task(body.get("text"), body.get("priority") or "normal", body.get("notes") or "")
                elif route.path == "/api/tasks/edit":
                    result = edit_task(
                        str(body.get("id") or ""),
                        text=body.get("text"),
                        priority=body.get("priority"),
                        notes=body.get("notes"),
                        pinned=body.get("pinned"),
                    )
                elif route.path == "/api/tasks/toggle":
                    result = toggle_task(str(body.get("id") or ""), bool(body.get("done", True)))
                elif route.path == "/api/tasks/pin":
                    result = pin_task(str(body.get("id") or ""), bool(body.get("pinned", True)))
                elif route.path == "/api/tasks/delete":
                    result = delete_task(str(body.get("id") or ""))
                else:
                    return self._send("not found", "text/plain", 404)
                snapshot.refresh("tasks")
                return self._send(json.dumps(result))
            if (route.path.startswith("/api/reading/source/") or route.path.startswith("/api/reading/bookmark/")
                    or route.path == "/api/reading/import-subscriptions"):
                body = self._body()
                if route.path == "/api/reading/source/add":
                    result = reading_add_source(body)
                elif route.path == "/api/reading/source/edit":
                    result = reading_edit_source(str(body.get("id") or ""), body)
                elif route.path == "/api/reading/source/delete":
                    result = reading_delete_source(str(body.get("id") or ""))
                elif route.path == "/api/reading/import-subscriptions":
                    result = reading_import_subscriptions(body.get("text"))
                elif route.path == "/api/reading/bookmark/add":
                    result = add_bookmark(body)
                elif route.path == "/api/reading/bookmark/delete":
                    result = delete_bookmark(str(body.get("id") or ""))
                else:
                    return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/reading/"):
                body = self._body()
                item_id = str(body.get("id") or "")
                if not item_id:
                    return self._send(json.dumps({"ok": False, "error": "no id"}), code=400)
                if route.path == "/api/reading/save":
                    result = reading_set_saved(item_id, bool(body.get("saved", True)))
                elif route.path == "/api/reading/read":
                    result = reading_set_read(item_id, bool(body.get("read", True)))
                elif route.path == "/api/reading/hide":
                    result = reading_hide_item(item_id)
                else:
                    return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/books/"):
                body = self._body()
                if route.path == "/api/books/add":
                    result = add_book(body)
                elif route.path == "/api/books/edit":
                    result = edit_book(str(body.get("id") or ""), body)
                elif route.path == "/api/books/delete":
                    result = delete_book(str(body.get("id") or ""))
                else:
                    return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if (route.path.startswith("/api/games/") or route.path.startswith("/api/apps/")
                    or route.path.startswith("/api/settings/") or route.path.startswith("/api/pages")
                    or route.path.startswith("/api/shelves") or route.path.startswith("/api/layout")
                    or route.path == "/api/views"):
                result = self._games_post(route.path, self._body())
                if result is None: return self._send("not found", "text/plain", 404)
                if route.path.startswith("/api/apps/"): snapshot.refresh("apps")
                elif (route.path == "/api/views" or route.path.startswith("/api/pages")
                        or route.path.startswith("/api/layout")): snapshot.refresh("ui")
                elif route.path.startswith("/api/games/") or route.path.startswith("/api/shelves"):
                    snapshot.refresh("games")
                return self._send(json.dumps(result))
            if route.path == "/api/launch":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                return self._send(json.dumps({"ok": launch_game(body.get("target"))}))
            if route.path == "/api/open":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                url = str(body.get("url") or "")
                if not re.match(r"^(https?|spotify)://", url, re.I) and not url.startswith("spotify:"): return self._send(json.dumps({"ok": False}), code=400)
                try:
                    os.startfile(url)
                    return self._send(json.dumps({"ok": True}))
                except Exception as e: return self._send(json.dumps({"ok": False, "error": str(e)[:120]}))
            if route.path == "/api/filesys/open":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                kind = str(body.get("kind") or "")
                if kind not in ("screenshots", "downloads"): return self._send(json.dumps({"ok": False}), code=400)
                target = _files_resolve(snapshot.cfg, kind, str(body.get("path") or ""))
                if not target: return self._send(json.dumps({"ok": False, "error": "not allowed"}), code=403)
                try:
                    os.startfile(str(target))
                    return self._send(json.dumps({"ok": True}))
                except Exception as e: return self._send(json.dumps({"ok": False, "error": str(e)[:120]}))
            if route.path == "/api/wallpaper":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                target = body.get("path")
                if body.get("url"):
                    # A Wallhaven pick isn't on disk yet - downloading the
                    # full-res image (several MB) inline used to block this
                    # whole request until it finished, so the UI's "applying"
                    # spinner sat there for however long the download took
                    # on top of the actual apply - the "wallpaper takes a
                    # while" complaint. Same fire-and-forget shape
                    # set_wallpaper() already uses for the local-path case:
                    # respond immediately, do the download+apply in the
                    # background.
                    url, wall_id = body["url"], body.get("id") or str(int(time.time()))
                    def _download_and_apply(url=url, wall_id=wall_id):
                        try:
                            path = download_wallpaper(snapshot.cfg, url, wall_id)
                            set_wallpaper(snapshot.cfg, path)
                            snapshot.refresh("wallpapers")
                        except Exception:
                            pass
                    threading.Thread(target=_download_and_apply, daemon=True).start()
                    return self._send(json.dumps({"ok": True}))
                ok = set_wallpaper(snapshot.cfg, target) if target else False
                snapshot.refresh("wallpapers")
                return self._send(json.dumps({"ok": ok, "path": target}))
            if route.path == "/api/wallpaper/favorite":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                wp = str(body.get("path") or "")
                on = bool(body.get("favorite", True))
                if not wp: return self._send(json.dumps({"ok": False, "error": "no path"}), code=400)
                def mutate(store):
                    others = [f for f in store.get("wallpaper_favorites") or [] if f != wp]
                    store["wallpaper_favorites"] = others + ([wp] if on else [])
                edit_store(mutate)
                snapshot.refresh("wallpapers")
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/wallpaper/fix-desktops":
                # wallhaven.py's own recovery action (registry flush +
                # Explorer restart) for the rare per-virtual-desktop
                # wallpaper desync - manual only, the UI requires its own
                # confirmation before ever posting here.
                script = HERE.parent / "wallhaven.py"
                if not script.is_file(): return self._send(json.dumps({"ok": False, "error": "wallhaven.py not found"}), code=404)
                subprocess.Popen([sys.executable, str(script), "--fix-desktops"],
                                 creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/brightness":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                return self._send(json.dumps({"ok": set_brightness(snapshot.cfg, body.get("percent", 100), body.get("mode"))}))
            if route.path == "/api/saturation":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                return self._send(json.dumps({"ok": set_saturation(snapshot.cfg, body.get("percent", 100), body.get("mode"))}))
            if route.path == "/api/lights":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                script = HERE.parent / "lights.py"
                if not script.is_file(): return self._send(json.dumps({"ok": False, "error": "lights.py not found"}), code=404)
                colour = str(body.get("color") or "").lstrip("#")
                if colour:
                    if not re.fullmatch(r"[0-9a-fA-F]{6}", colour):
                        return self._send(json.dumps({"ok": False, "error": "not a hex colour"}), code=400)
                    args = ["--color", colour]
                else:
                    mode = str(body.get("mode", ""))
                    allowed = {"colorful", "white", "bias", "off", "video", "game"}
                    if mode not in allowed: return self._send(json.dumps({"ok": False}), code=400)
                    args = [f"--{mode}"]
                subprocess.Popen([sys.executable, str(script), *args],
                                 creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/desktop/go":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                ok = go_to_desktop(snapshot.cfg, body.get("n"))
                snapshot.refresh("desktops")
                return self._send(json.dumps({"ok": ok}))
            if route.path == "/api/photo/pin":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                _photo_pin["on"] = bool(body.get("pinned", True))
                snapshot.refresh("photo")
                return self._send(json.dumps({"ok": True, "pinned": _photo_pin["on"]}))
            if route.path == "/api/photo/next":
                _photo_pin["photo"] = None   # forces a real fetch even while pinned
                snapshot.refresh("photo")
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/media/control":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                result = media_control(str(body.get("action") or ""), body.get("position"))
                snapshot.refresh("media")
                return self._send(json.dumps(result))
            if route.path == "/api/audio/volume":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                try:
                    set_volume_level(body.get("percent", 50))
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}))
                snapshot.refresh("audio")
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/audio/mute":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                try:
                    set_mute(bool(body.get("muted", True)))
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}))
                snapshot.refresh("audio")
                return self._send(json.dumps({"ok": True}))
            if route.path == "/api/audio/device":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                if body.get("index") is None: return self._send(json.dumps({"ok": False, "error": "no index"}), code=400)
                try:
                    set_audio_device(body["index"])
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}))
                snapshot.refresh("audio")
                return self._send(json.dumps({"ok": True}))
            return self._send("not found", "text/plain", 404)
    return Handler

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--diag", action="store_true")
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    snapshot = Snapshot(cfg)
    if args.diag:
        # --diag was accepted and then ignored, so it fell through and started a
        # SECOND server on the same port. Now it reports and exits.
        for key in COLLECTORS: snapshot.refresh(key)
        payload = snapshot.payload()
        errors = payload.get("errors") or {}
        print(f"config     : {CONFIG_FILE} {'(found)' if CONFIG_FILE.exists() else '(absent - fine)'}")
        if CONFIG_ORIGIN.get("_file_problem"):
            print(f"             ! {CONFIG_ORIGIN['_file_problem']}")
        print(f"store      : {STORE_FILE} {'(found)' if STORE_FILE.exists() else '(not yet written)'}")
        interesting = ["plex_token", "griddb_key", "feeds", "notes_dir", "services",
                       "qbit_url", "sonarr_key", "wallpaper_dir", "art_overrides"]
        print("settings   : where each value is coming from")
        for key in interesting:
            origin = CONFIG_ORIGIN.get(key, "default")
            value = str(cfg.get(key, "")).replace("\n", " / ")
            if key in SECRET_KEYS: value = ("set (" + str(len(value)) + " chars)") if value.strip() else "EMPTY"
            flag = "  <- still the built-in default" if origin == "default" else ""
            print(f"             {key:15} [{origin}] {value[:60]}{flag}")
        print(f"token      : {'set' if load_token() else 'MISSING - HA lights will be empty'}")
        for key in COLLECTORS:
            data = payload.get(key) or {}
            if key in errors: note = "ERROR " + errors[key]
            elif key == "games": note = f"{data.get('total', 0)} games, {len(data.get('shelves') or [])} shelves, sources={data.get('by_source')}"
            elif key == "media": note = data.get("title") or data.get("error") or "nothing playing"
            elif key == "hardware": note = f"cpu={data.get('cpu_temp')}C load={data.get('cpu_load')}% gpu={data.get('gpu_temp')}C lhm={data.get('lhm')}"
            elif key == "lights": note = f"{len(data.get('lights') or [])} entities {data.get('error') or ''}".strip()
            elif key == "plex": note = f"configured={data.get('configured')} sections={len(data.get('sections') or [])} {data.get('error') or ''}".strip()
            elif key == "wallpapers": note = f"{data.get('total', 0)} in {data.get('dir')} {data.get('error') or ''}".strip()
            elif key == "feeds": note = ", ".join(f"{f['label']}={len(f.get('items') or [])}{' ERR' if f.get('error') else ''}" for f in (data.get("feeds") or [])) or "none configured"
            elif key == "homelab": note = f"ssh={data.get('ssh_online')} {data.get('up')}/{data.get('count')} up · " + ", ".join(f"{s['name']}{'' if s['online'] else ' DOWN'}" for s in (data.get("services") or []))
            elif key == "downloads": note = (f"{data.get('active')} active of {data.get('total')}, {round((data.get('dl') or 0)/1048576, 1)} MB/s" if data.get("configured") else "no qbit_url in config.ini") + (" · " + data["error"] if data.get("error") else "")
            elif key == "upcoming": note = (f"{len(data.get('items') or [])} in the next week" if data.get("configured") else "no sonarr_url/radarr_url in config.ini")
            elif key == "notes": note = f"{data.get('total', 0)} notes in {data.get('dir')} {data.get('error') or ''}".strip()
            elif key == "apps": note = f"{len(data.get('apps') or [])} launchpad items"
            elif key == "ui": note = ", ".join(v["label"] + ("" if v.get("visible", True) else " (hidden)") for v in (data.get("views") or []))
            else: note = json.dumps(data, default=str)[:110]
            print(f"{key:11}: {note}")
        return

    if args.probe:
        for key in COLLECTORS: snapshot.refresh(key)
        payload = snapshot.payload()
        media = payload.get("media") or {}
        if media.get("art"): media["art"] = f"<{len(media['art'])} bytes of base64>"
        print(json.dumps(payload, indent=2, default=str))
        return
    threading.Thread(target=snapshot.loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(snapshot))
    print(f"panel serving on http://127.0.0.1:{args.port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == "__main__":
    main()