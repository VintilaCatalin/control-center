"""Wallpaper library, thumbnails, Wallhaven search, apply/download.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urljoin
import requests

from backend.core import HERE, STATE_FILE, load_store


WALL_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

def collect_wallpapers(cfg, _shared):
    # An empty setting must read as "not configured", not "use the current
    # directory" - Path("") resolves to cwd, which is_dir() happily
    # reports True for, and this collector would then silently scan the
    # backend's own working directory instead of telling a fresh install
    # it needs a folder chosen.
    raw = str(cfg["wallpaper_dir"]).strip()
    if not raw: return {"dir": "", "walls": [], "favorites": [], "configured": False}
    folder = Path(raw)
    if not folder.is_dir(): return {"dir": str(folder), "walls": [], "favorites": [], "configured": True, "error": "That folder doesn't exist - choose a wallpaper folder in Settings."}
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
    return {"dir": str(folder), "walls": walls[:limit], "favorites": favorites, "total": len(walls), "current_path": current, "current_bg": current_bg, "configured": True}

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
    # Was clearing itself on every miss - a cache that can only ever hold
    # the single most-recent wallpaper, so switching back to a wallpaper
    # viewed a moment ago (or any repeat request for the current one) redid
    # the full decode/resize/Gaussian-blur/enhance pipeline from scratch
    # every time instead of reusing it. Same bounded-then-clear shape as
    # wall_thumb's own cache above.
    if len(_bg_cache) > 8: _bg_cache.clear()
    _bg_cache[key] = data
    return data


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
    script = HERE.parent / "capabilities" / "wallpaper.py"
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
