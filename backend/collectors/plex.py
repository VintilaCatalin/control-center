"""Plex collector + item detail.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import requests


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
