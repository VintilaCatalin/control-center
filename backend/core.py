"""Shared infrastructure: config loading, the settings-store JSON persistence,
SETTINGS_SCHEMA, the in-memory metric-history ring buffer, small generic
helpers, icon/cover extraction, and the React-dist static-file constants.

Extracted verbatim from the pre-modularization panel/server.py. This module
must never import from backend.collectors or backend.routes.
"""

import base64
import configparser
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent

# The built React app (`npm run build` inside frontend/) is the production
# UI - see do_GET below. The old panel UI stays on disk at legacy/index.html
# as a reference (reachable at /legacy), not deleted, until React is
# confirmed to fully supersede it.
REACT_DIST = HERE.parent / "frontend" / "dist"
LEGACY_INDEX = HERE.parent / "legacy" / "index.html"
_STATIC_MIME = {".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
                 ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
                 ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".ico": "image/x-icon", ".json": "application/json"}


def _migrate_config_dir(old_dir, new_dir):
    """One-time, one-way copy of the settings folder from its old name
    (.config/lightsync, this product's original name) to its current one
    (.config/control-center). Copy, not move: this is the only copy of the
    user's real HA token / notes cache / reading state at the moment this
    first runs, so leaving the old folder in place costs a few KB of disk
    and buys a trivial manual rollback if anything here is ever wrong.
    Copies everything found (config.ini, panel-store.json, state.json,
    token, covers/, articles/, and any other cache file this module has
    grown since - deliberately not a fixed whitelist, so a forgotten cache
    file doesn't silently stay behind). Never raises - same philosophy as
    load_store() elsewhere in this file: a settings-migration hiccup
    should never be why the app won't start.
    """
    try:
        if new_dir.is_dir() and any(new_dir.iterdir()):
            return  # already migrated (or already a fresh install here)
        if not old_dir.is_dir():
            return  # genuinely fresh install, nothing to migrate
        new_dir.mkdir(parents=True, exist_ok=True)
        for src in old_dir.iterdir():
            dst = new_dir / src.name
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        (new_dir / "MIGRATED_FROM_LIGHTSYNC.txt").write_text(
            f"Copied from {old_dir} on {time.strftime('%Y-%m-%d %H:%M:%S')}.\n"
            f"That folder was left untouched - this was a copy, not a move.\n",
            encoding="utf-8")
    except Exception as e:
        print(f"config migration skipped (non-fatal): {type(e).__name__}: {e}")


_OLD_CONFIG_DIR = Path.home() / ".config" / "lightsync"
CONFIG_DIR = Path.home() / ".config" / "control-center"
_migrate_config_dir(_OLD_CONFIG_DIR, CONFIG_DIR)

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
    # A generic, functional starting point (so Weather never hard-errors
    # before onboarding sets a real one) - not this machine's actual
    # location. Onboarding's Profile step overwrites this immediately for
    # any real user; a skipped/fresh install just sees London's weather
    # until they set their own, same as any other unconfigured field.
    "latitude": "51.5074", "longitude": "-0.1278", "place": "London", "units": "celsius",
    "ha_url": "",
    "panel_lights": "",
    "plex_url": "", "plex_token": "", "plex_open": "app", "plex_limit": "40",
    "steam_path": r"C:\Program Files (x86)\Steam", "games_limit": "18", "extra_games": "",
    "games_ignore": "",
    "xbox_enabled": "true", "xbox_paths": r"C:\XboxGames",
    "battlenet_enabled": "false", "battlenet_paths": "",
    "battlenet_exe_hints": "League of Legends|LeagueClient.exe, VALORANT|VALORANT.exe, Diablo IV|Diablo IV.exe",
    "riot_enabled": "false", "riot_paths": r"C:\Riot Games",
    "riot_products": "League of Legends|league_of_legends, VALORANT|valorant",
    "griddb_key": "",
    "feeds": "Hacker News | https://hnrss.org/frontpage", "feed_items": "12", "art_overrides": "",
    "wallpaper_dir": "", "wallpaper_limit": "300",
    "wallhaven_atleast": "3440x2880", "wallhaven_key": "",
    "lhm_url": "http://localhost:8085/data.json",
    # Notes: any folder of plain Markdown files, read and written in place.
    # Obsidian can point at the same folder if you use it, but it's never
    # required - Control Center only ever touches .md/.markdown/.txt files.
    "notes_dir": "", "notes_limit": "300",
    # Homelab: "Label | url | port | group" per line. Empty by default -
    # an unconfigured Homelab shows nothing here, never a stranger's
    # infrastructure (see _service_lines() in collectors/homelab.py).
    "services": "", "homelab_server_ip": "",
    "qbit_url": "", "qbit_user": "", "qbit_pass": "",
    "sonarr_url": "", "sonarr_key": "",
    "radarr_url": "", "radarr_key": "",
    "immich_url": "", "immich_key": "", "immich_album": "",
    "overseerr_url": "", "overseerr_key": "",
    # Additive data sources for the Homelab dashboard - neither replaces the
    # TCP-probe service grid, both are optional (Homelab degrades to
    # probe-only data if left empty).
    "netdata_url": "", "portainer_url": "", "portainer_token": "", "portainer_endpoint_id": "",
    "calendar_ics": "",
    "screenshots_dir": str(Path.home() / "Pictures" / "Screenshots"),
    "downloads_dir": str(Path.home() / "Downloads"),
    "accent_override": "", "reduced_motion": "false", "sidebar_default_collapsed": "false",
    "material_style": "liquid_glass",
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
        {"key": "material_style", "label": "Material style", "type": "select",
         "options": ["blur_cyberpunk", "liquid_glass"],
         "hint": "Blur Cyberpunk keeps the original translucent atmosphere; Liquid Glass Mac uses stronger floating materials"},
        {"key": "accent_override", "label": "Accent colour", "type": "text",
         "hint": "#rrggbb — leave blank to follow your current wallpaper automatically"},
        {"key": "sidebar_default_collapsed", "label": "Collapse sidebar by default", "type": "bool"},
        {"key": "reduced_motion", "label": "Reduce motion", "type": "bool",
         "hint": "Turns off decorative animation across the app (charts, transitions, hover motion)"},
        {"key": "default_app", "label": "Open on launch", "type": "select",
         "options": ["overview", "games", "scene", "notes", "tasks", "plex", "reading", "homelab"],
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
        {"key": "notes_dir", "label": "Notes folder", "type": "folder",
         "hint": "Any folder of plain Markdown (.md) files, edited in place. Obsidian can point at the "
                 "same folder if you use it, but it's not required."},
    ]},
    {"group": "Reading", "keys": [
        {"key": "feeds", "label": "Feeds", "type": "lines",
         "hint": "Label | feed url. YouTube channels work as https://www.youtube.com/feeds/videos.xml?channel_id=…"},
        {"key": "feed_items", "label": "Items per feed", "type": "number"},
    ]},
    {"group": "Homelab", "keys": [
        {"key": "homelab_server_ip", "label": "Server address", "type": "text",
         "hint": "The homelab box's own LAN IP or hostname - powers the SSH-online status pulse and is used "
                 "as the probe target for any service in the list below that doesn't have its own host in its URL. "
                 "Leave empty if you don't have one central box (each service is still probed at its own URL's host)."},
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
         "hint": "Server root, e.g. http://192.168.1.100:19999 — powers live host CPU/RAM/disk/network graphs"},
        {"key": "portainer_url", "label": "Portainer", "type": "text",
         "hint": "Server root, e.g. http://192.168.1.100:9000 — powers real container cards"},
        {"key": "portainer_token", "label": "Portainer access token", "type": "secret",
         "hint": "Portainer > My account > Access tokens"},
        {"key": "portainer_endpoint_id", "label": "Portainer environment id", "type": "text",
         "hint": "Optional. Leave empty to use the first Docker environment Portainer manages"},
    ]},
    {"group": "Machine", "keys": [
        {"key": "lhm_url", "label": "LibreHardwareMonitor", "type": "text",
         "hint": "The only way to read CPU temperature on Windows"},
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
                  "ov-news", "ov-notes-tasks", "ov-recent", "ov-system", "ov-horizon", "ov-continue"],
        "sizes": {
            "pad": {"w": 3, "h": 6}, "ov-nowplaying": {"w": 3, "h": 6},
            "ov-profile": {"w": 2, "h": 5}, "ov-weather": {"w": 2, "h": 4}, "ov-calendar": {"w": 2, "h": 6},
            "ov-news": {"w": 3, "h": 6}, "ov-notes-tasks": {"w": 2, "h": 5},
            "ov-recent": {"w": 3, "h": 4}, "ov-system": {"w": 3, "h": 5},
            "ov-horizon": {"w": 1, "h": 5}, "ov-continue": {"w": 3, "h": 5},
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
        "order": ["favorites", "playtime", "pulse", "shelf-steam", "shelf-xbox", "shelf-other"],
        "sizes": {
            "favorites": {"w": 1, "h": 7}, "playtime": {"w": 3, "h": 7},
            "pulse": {"w": 4, "h": 13},
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
            # Areas/Projects - the Things-style grouping layer over "tasks"
            # (id+label+icon, same shape as reading_topics). Seeded empty,
            # not with any defaults - unlike reading topics these are fully
            # user-created, so there's nothing sensible to pre-fill. See
            # add_area()/add_project() in backend/collectors/tasks.py.
            "tasks_areas": [], "tasks_projects": [],
            # Reading (the frontend's redesigned feed - see collect_reading).
            # saved/read/hidden are keyed by item id rather than booleans baked
            # into a feed item, since items themselves are re-derived from RSS
            # every poll and would otherwise lose that state on the next fetch.
            "reading_sources": [], "reading_saved": [], "reading_read": [],
            "reading_hidden": [], "books": [], "reading_bookmarks": [],
            # User-editable topic vocabulary (id+label pairs) - seeded from
            # DEFAULT_READING_TOPICS below on first load, then a plain list
            # like reading_sources, not a fixed enum. See
            # reading_add_topic()/reading_remove_topic() in
            # backend/collectors/reading.py.
            "reading_topics": [],
            "reading_prefs": {"topic_order": [], "topic_hidden": []},
            # Set once the first-run onboarding flow finishes (or is
            # explicitly skipped) - see backend/routes/settings.py's
            # /api/settings/onboarding-complete. Defaults True here (not
            # False) so an existing install upgrading to a version with
            # this field - a real store.json on disk that simply predates
            # this key - never gets sent through onboarding it doesn't
            # need. The one real "needs onboarding" case, a store file
            # that doesn't exist AT ALL yet, is special-cased below.
            "onboarding_complete": True}

def load_store():
    """Never raise. A corrupt store should cost you your tile order, not your panel.

    Missing/corrupt/non-dict on disk all fall through to the same
    `found = {}` path below rather than returning early - a genuinely
    fresh install (no file yet) must still run every migration/seeding
    block further down (reading_sources, reading_topics, ...), the exact
    same way an existing install with a real-but-incomplete store does.
    Returning early here used to skip that seeding entirely for a brand
    new install, and since nothing persists it until some *other* edit
    happens to write the full store shape first (with those fields
    already present as empty lists), the seeding would then never run
    again either - a fresh install could permanently end up with zero
    default reading sources/topics. `onboarding_complete` still needs the
    three-way distinction (missing entirely / exists but unreadable /
    a real dict), so that's resolved explicitly instead of leaning on
    which exception branch fired.
    """
    store = _blank_store()
    file_existed = STORE_FILE.exists()
    try:
        found = json.loads(STORE_FILE.read_text(encoding="utf-8"))
        if not isinstance(found, dict):
            found = {}
    except Exception:
        found = {}
    if not file_existed:
        store["onboarding_complete"] = False       # genuinely fresh install
    elif not found:
        store["onboarding_complete"] = True        # exists but unreadable/corrupt/not-a-dict
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

    # Migration: topics used to be a fixed 9-value enum baked into the
    # code (READING_TOPICS); "reading_topics" missing from the file on
    # disk means this store predates the user-editable version - seed it
    # with exactly that same original set so every source's existing
    # `topic` value still resolves to something real.
    if "reading_topics" not in found:
        store["reading_topics"] = [dict(t) for t in DEFAULT_READING_TOPICS]

    # Migration: Tasks used to be one flat list with no grouping. Existing
    # tasks simply lack project_id/area_id/when - which is exactly the
    # definition of Inbox on the frontend, so no data needs touching here;
    # tasks_areas/tasks_projects above already default to [] via
    # _blank_store(), nothing to seed.
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
    raw_hidden = saved["hidden"] if "hidden" in saved else base.get("hidden", [])
    hidden = [p for p in raw_hidden if known(p)]
    return {"order": order, "sizes": sizes, "hidden": hidden}

YT_RE = re.compile(r"(youtube\.com|youtu\.be)", re.I)

YT_CHANNEL_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id="

# Seeded into reading_topics on first run (see load_store()'s migration) -
# the original fixed vocabulary, now just the starting set rather than a
# hard ceiling. "interesting" is the one entry that can never be removed
# (see reading_remove_topic()) - every source/bookmark falls back to it.
DEFAULT_READING_TOPICS = [
    {"id": "tech", "label": "Tech", "icon": "chip"}, {"id": "ai", "label": "AI", "icon": "sparkle"},
    {"id": "design", "label": "Design", "icon": "palette"}, {"id": "world", "label": "World", "icon": "globe"},
    {"id": "travel", "label": "Travel", "icon": "plane"}, {"id": "games", "label": "Games", "icon": "controller"},
    {"id": "interesting", "label": "Interesting", "icon": "star"}, {"id": "youtube", "label": "YouTube", "icon": "play"},
    {"id": "sport", "label": "Sport", "icon": "trophy"},
]

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

def _persist_state(**kw):
    try: state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception: state = {}
    state.update(kw)
    try: STATE_FILE.write_text(json.dumps(state), encoding="utf-8")
    except Exception: pass

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
