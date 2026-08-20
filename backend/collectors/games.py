"""Games/apps/launchpad collector (Steam, Xbox, Battle.net, Riot, SteamGridDB).

Extracted verbatim from the pre-modularization panel/server.py.
"""

import json
import hashlib
import os
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode
import requests

from backend.core import COVER_DIR, DEFAULT_LAYOUTS, DEFAULT_VIEWS, csv_list, effective_layout, load_store, truthy
from backend.collectors.reading import _feed_items, _strip_html


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
                      "material_style": str(cfg.get("material_style") or "liquid_glass"),
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

_STEAM_NEWS_CACHE = {}
_STEAM_NEWS_TTL = 900  # matches the other slow-moving/rate-sensitive external calls in this file

def _news_id(game_key, url):
    return hashlib.sha1(f"{game_key}|{url}".encode()).hexdigest()[:16]

def _news_thumb(contents):
    match = re.search(r'<img[^>]+src=["\']([^"\']+)', str(contents or ""), re.I)
    if not match: return None
    url = match.group(1).replace("&amp;", "&")
    if url.startswith("//"): url = "https:" + url
    return url if url.startswith(("http://", "https://")) else None

def fetch_steam_news(appid, count=5):
    """Steam's own ISteamNews API - public, no key needed, and only ever
    called for games with source == "steam" (the appid IS collect_games'
    own game id for Steam entries, no separate id to look up). This is the
    one 'reliable source that already exists' the games-activity feature
    asked for; Xbox/Battle.net/Riot titles have no equivalent, so this
    stays Steam-only rather than inventing something shakier for them."""
    cache_key = f"en-v2:{appid}"
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
    items = [{"id": _news_id(cache_key, n.get("url") or n.get("gid") or n.get("title")),
              "title": n.get("title") or "", "url": n.get("url") or "",
              "date": n.get("date"), "summary": _strip_html(n.get("contents"), limit=320),
              "author": n.get("author") or "", "provider": n.get("feedlabel") or "Steam Community",
              "thumb": _news_thumb(n.get("contents")), "origin": "first_party"}
             for n in raw_items if _english_news_title(n.get("title"))]
    value = {"ok": True, "items": items}
    _STEAM_NEWS_CACHE[cache_key] = {"at": time.time(), "value": value}
    return value

_GAME_NEWS_CACHE = {}
_FOREIGN_NEWS_SCRIPT = re.compile(r"[\u0400-\u052f\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")

def _english_news_title(title):
    title = str(title or "").strip()
    return bool(title and not _FOREIGN_NEWS_SCRIPT.search(title))

def _usable_game_news_title(game_name, title):
    """Keep Pulse predictable: English-script coverage whose headline
    actually names the installed game. Google locale parameters influence
    ranking but do not guarantee language or relevance on their own.
    """
    title = str(title or "").strip()
    if not _english_news_title(title):
        return False
    normalized_game = re.sub(r"[^a-z0-9]+", "", str(game_name or "").lower())
    normalized_title = re.sub(r"[^a-z0-9]+", "", title.lower())
    return bool(normalized_game and normalized_game in normalized_title)

def fetch_game_news(name, source, game_id="", count=4):
    """Updates for every installed-library source.

    Steam has a real first-party news API. The other launchers do not expose
    an equivalent keyless installed-game feed, so they use an exact-title
    Google News RSS search and retain the publisher/origin in every item.
    This is discovery, never presented as first-party platform news.
    """
    clean_name = str(name or "").strip()
    clean_source = str(source or "").strip().lower()
    if clean_source == "steam" and str(game_id).isdigit():
        return fetch_steam_news(str(game_id), count=count)
    if not clean_name:
        return {"ok": False, "items": [], "error": "game name required"}

    cache_key = f"en-v2:{clean_source}:{clean_name.lower()}:{count}"
    cached = _GAME_NEWS_CACHE.get(cache_key)
    if cached and time.time() - cached["at"] < _STEAM_NEWS_TTL:
        return cached["value"]
    query = f'"{clean_name}" (game OR gaming) when:14d'
    url = "https://news.google.com/rss/search?" + urlencode({"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    try:
        requested = max(1, min(int(count), 8))
        raw_items = _feed_items(url, limit=min(24, max(8, requested * 3)))
        items = [{"id": _news_id(cache_key, item.get("url") or item.get("title")),
                  "title": item.get("title") or "", "url": item.get("url") or "",
                  "date": item.get("when"), "summary": _strip_html(item.get("blurb"), limit=320),
                  "author": item.get("author") or "", "provider": item.get("source_label") or item.get("domain") or "News",
                  "thumb": item.get("thumb"), "origin": "web"}
                 for item in raw_items if item.get("url") and _usable_game_news_title(clean_name, item.get("title"))][:requested]
        value = {"ok": True, "items": items}
    except Exception as error:
        value = {"ok": False, "items": [], "error": str(error)[:140]}
    _GAME_NEWS_CACHE[cache_key] = {"at": time.time(), "value": value}
    return value
