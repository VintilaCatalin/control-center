#!/usr/bin/env python
"""
server.py - the data backend for the desk panel.
"""

import argparse
import asyncio
import base64
import configparser
import ctypes
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
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

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
    "vda_dll": r"C:\Users\catal\Scripts\VirtualDesktopAccessor.dll",
    "calendar_ics": "",
    "screenshots_dir": str(Path.home() / "Pictures" / "Screenshots"),
    "downloads_dir": str(Path.home() / "Downloads"),
}

INTERVALS = {
    "media": 2, "hardware": 4, "lights": 10, "plex": 30,
    "weather": 900, "games": 600, "wallpapers": 60, "feeds": 900,
    "homelab": 15, "downloads": 8, "upcoming": 900, "notes": 20, "ui": 5,
    "photo": 20, "popular": 1800, "audio": 15, "desktops": 3, "calendar": 900,
    "files": 20,
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
               "qbit_pass", "sonarr_key", "radarr_key"}

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

def collect_hardware(cfg, _shared):
    out = {"cpu_temp": None, "cpu_load": None, "gpu_temp": None,
           "gpu_load": None, "ram_used": None, "ram_total": None,
           "vram_used": None, "vram_total": None, "uptime": None}
    try:
        import psutil
        out["cpu_load"] = round(psutil.cpu_percent(interval=None))
        mem = psutil.virtual_memory()
        out["ram_used"] = round(mem.used / 1024 ** 3, 1)
        out["ram_total"] = round(mem.total / 1024 ** 3, 1)
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

def collect_homelab(cfg, _shared):
    server_ip = "192.168.1.53"
    ssh_online, ssh_ms = _probe(server_ip, 22, 1.5)

    services = _service_lines(cfg)
    # Probes run in parallel: fifteen sequential 1.2s timeouts would mean an
    # eighteen-second collector, and the whole view would feel broken.
    results = [None] * len(services)
    def check(i, svc):
        host = urlparse(svc["url"]).hostname if svc["url"].startswith("http") else None
        online, ms = _probe(server_ip, svc["port"])
        results[i] = {**svc, "online": online, "ms": ms, "host": host or server_ip}
    threads = [threading.Thread(target=check, args=(i, svc), daemon=True)
               for i, svc in enumerate(services)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=3)

    found = [r for r in results if r]
    groups = []
    for name in GROUP_ORDER:
        members = [r for r in found if r["group"] == name]
        if members:
            groups.append({"group": name, "services": members,
                           "up": sum(1 for m in members if m["online"]), "count": len(members)})
    return {"server_ip": server_ip, "ssh_online": ssh_online, "ssh_ms": ssh_ms,
            "services": found, "groups": groups,
            "up": sum(1 for r in found if r["online"]), "count": len(found)}


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
        notes.append({"name": path.stem, "rel": str(rel).replace("\\", "/"),
                      "folder": str(rel.parent).replace("\\", "/") if str(rel.parent) != "." else "",
                      "when": stat.st_mtime, "size": stat.st_size, "preview": preview})
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
    return {"configured": True, "torrents": torrents, "active": len(active), "total": len(rows),
            "dl": info.get("dl_info_speed") or 0, "up": info.get("up_info_speed") or 0}

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
            for item in (data or {}).get("results", [])[:10]:
                info = item.get("mediaInfo") or {}
                rows.append({
                    "tmdb": item.get("id"), "trending": True,
                    "status": info.get("status"),
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
        events = recurring_ical_events.of(cal).between(now - timedelta(hours=6), now + timedelta(days=14))
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
    return {"configured": True, "items": items[:24]}


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
    out = {"configured": True, "playing": [], "recent": [], "sections": [], "error": None}

    try:
        sessions = _plex_get(cfg, "/status/sessions").get("Metadata") or []
        for item in sessions:
            out["playing"].append({
                "title": item.get("title"), "show": item.get("grandparentTitle") or item.get("parentTitle"),
                "type": item.get("type"), "user": ((item.get("User") or {}).get("title")),
                "art": art(item), "launch": None,
            })
    except Exception as e: out["error"] = f"sessions: {e}"[:160]

    machine = _plex_machine(cfg)
    limit = int(cfg.get("plex_limit", "40"))
    def pack(item):
        return {"title": item.get("title"), "show": item.get("grandparentTitle") or item.get("parentTitle"),
                "type": item.get("type"), "year": item.get("year"), "art": art(item),
                "launch": _plex_launch(cfg, machine, item)}

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
    "overview": {
        "order": ["pad", "ov-photo-card", "machine", "ov-storage", "ov-recent",
                  "ov-nowplaying", "ov-notes-glance", "ov-calendar", "ov-pulse", "ov-upnext"],
        "sizes": {
            "pad": {"w": 2, "h": 8}, "ov-photo-card": {"w": 2, "h": 5},
            "machine": {"w": 2, "h": 5}, "ov-storage": {"w": 2, "h": 5},
            "ov-recent": {"w": 3, "h": 4}, "ov-nowplaying": {"w": 3, "h": 4},
            "ov-notes-glance": {"w": 2, "h": 4}, "ov-calendar": {"w": 2, "h": 5},
            "ov-pulse": {"w": 2, "h": 4}, "ov-upnext": {"w": 2, "h": 4},
        },
        # The Homelab tab already does this job properly - showing a thin
        # slice of it again here was exactly what "Overview is horrible"
        # was about. Still there, just opt-in via the panel toggle now.
        "hidden": ["ov-pulse", "ov-upnext"],
    },
    "homelab": {
        "order": ["hl-host-card", "hl-docker", "photo-card", "hl-dl", "hl-upnext", "hl-popular"],
        "sizes": {
            "hl-host-card": {"w": 2, "h": 3}, "hl-docker": {"w": 3, "h": 4},
            "photo-card": {"w": 3, "h": 7}, "hl-dl": {"w": 3, "h": 4},
            "hl-upnext": {"w": 2, "h": 4}, "hl-popular": {"w": 3, "h": 6},
        },
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
            "pages": [], "layouts": {}}

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


def effective_layout(store, view):
    """Merge saved panel positions/sizes over the built-in defaults, rather
    than trusting the save blindly - a panel added after you last touched
    the layout still needs to land somewhere, and one that no longer exists
    shouldn't linger as a ghost entry forever."""
    base = DEFAULT_LAYOUTS.get(view, {"order": [], "sizes": {}, "hidden": []})
    saved = (store.get("layouts") or {}).get(view) or {}
    order = [p for p in (saved.get("order") or base["order"]) if p in base["sizes"]]
    order += [p for p in base["order"] if p not in order]
    sizes = {**base["sizes"], **(saved.get("sizes") or {})}
    # "hidden" has to fall back the same way "order" does - an empty list is
    # a real, meaningful choice ("show everything"), so only trust it once
    # the user has actually saved one; before that, use the defaults.
    raw_hidden = saved["hidden"] if "hidden" in saved else base["hidden"]
    hidden = [p for p in raw_hidden if p in base["sizes"]]
    return {"order": order, "sizes": sizes, "hidden": hidden}

def collect_ui(_cfg, _shared):
    """Nav labels, visibility and the profile - polled so a settings change
    reaches the page without a reload."""
    store = load_store()
    return {"views": store.get("views") or [dict(v) for v in DEFAULT_VIEWS],
            "profile": store.get("profile") or {},
            "pages": store.get("pages") or [],
            "layouts": {v: effective_layout(store, v) for v in DEFAULT_LAYOUTS}}


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
                          (thumb.get("url") if thumb is not None else
                           (enclosure.get("url") if enclosure is not None else None)),
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

def collect_wallpapers(cfg, _shared):
    folder = Path(cfg["wallpaper_dir"])
    if not folder.is_dir(): return {"dir": str(folder), "walls": [], "error": "folder not found"}
    current = None
    try: current = json.loads(STATE_FILE.read_text(encoding="utf-8")).get("last_source")
    except Exception: pass
    walls = []
    current_bg = None
    if current and Path(current).is_file():
        current_bg = "/api/bg?path=" + requests.utils.quote(str(current))
    for path in sorted(folder.iterdir(), key=lambda x: x.stat().st_mtime if x.is_file() else 0, reverse=True):
        if path.suffix.lower() not in WALL_EXTS: continue
        walls.append({"name": path.stem, "path": str(path), "thumb": "/api/wall?path=" + requests.utils.quote(str(path)), "current": current == str(path)})
    limit = int(cfg.get("wallpaper_limit", "300"))
    return {"dir": str(folder), "walls": walls[:limit], "total": len(walls), "current_path": current, "current_bg": current_bg}

_wall_thumbs = {}
def wall_thumb(path, size=(300, 250)):
    from PIL import Image
    import io
    key = f"{path}|{Path(path).stat().st_mtime_ns}"
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
        subprocess.Popen([sys.executable, str(script), "--set", str(path)], creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
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

def set_brightness(cfg, percent):
    token = load_token()
    if not token: return False
    level = max(1, min(255, int(255 * int(percent) / 100)))
    headers = {"Authorization": f"Bearer {token}", "content-type": "application/json"}
    base = cfg["ha_url"].rstrip("/")
    for entity in csv_list(cfg["panel_lights"]):
        try: requests.post(f"{base}/api/services/light/turn_on", headers=headers, timeout=5, json={"entity_id": entity, "brightness": level, "transition": 1.0})
        except Exception: continue
    try: state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception: state = {}
    state["brightness"] = int(percent)
    try: STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception: pass
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
    "upcoming": collect_upcoming, "notes": collect_notes, "apps": collect_apps,
    "photo": collect_photo, "popular": collect_popular,
    "ui": collect_ui, "audio": collect_audio, "desktops": collect_desktops,
    "calendar": collect_calendar, "files": collect_files,
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
                wanted = (parse_qs(route.query).get("path") or [""])[0]
                try:
                    target = Path(wanted).resolve()
                    root = Path(snapshot.cfg["wallpaper_dir"]).resolve()
                except Exception: return self._send("bad path", "text/plain", 400)
                if not str(target).startswith(str(root)) or not target.is_file(): return self._send("not allowed", "text/plain", 403)
                try: return self._send(wall_thumb(str(target)), "image/jpeg")
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
                    else:
                        return self._send("not found", "text/plain", 404)
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}), code=400)
                snapshot.refresh("notes")
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
                    try: target = str(download_wallpaper(snapshot.cfg, body["url"], body.get("id") or str(int(time.time()))))
                    except Exception as e: return self._send(json.dumps({"ok": False, "error": str(e)[:160]}))
                ok = set_wallpaper(snapshot.cfg, target) if target else False
                snapshot.refresh("wallpapers")
                return self._send(json.dumps({"ok": ok, "path": target}))
            if route.path == "/api/brightness":
                length = int(self.headers.get("Content-Length") or 0)
                try: body = json.loads(self.rfile.read(length) or b"{}")
                except Exception: body = {}
                return self._send(json.dumps({"ok": set_brightness(snapshot.cfg, body.get("percent", 100))}))
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
                                 creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
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