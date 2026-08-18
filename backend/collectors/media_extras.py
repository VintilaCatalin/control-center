"""Immich random photo + Overseerr popular/upcoming.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import json
import random
import re
import requests

from backend.collectors.downloads import _arr_calendar


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
