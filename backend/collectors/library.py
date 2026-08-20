"""Raindrop.io collector — collections + a recent slice of saved links.

Personal bookmark library synced from Raindrop (phone saves land here).
Requires a test token from app.raindrop.io → Settings → Integrations.
"""

import requests

API_BASE = "https://api.raindrop.io/rest/v1"


def _headers(token):
    return {"Authorization": f"Bearer {token.strip()}", "Accept": "application/json"}


def _get(token, path, **params):
    r = requests.get(f"{API_BASE}{path}", headers=_headers(token), params=params, timeout=12)
    r.raise_for_status()
    return r.json()


def pack_raindrop(item):
    coll = item.get("collection") or {}
    cover = item.get("cover") or None
    if isinstance(cover, list):
        cover = cover[0] if cover else None
    return {
        "id": str(item.get("_id")),
        "title": item.get("title") or item.get("domain") or "Untitled",
        "url": item.get("link") or "",
        "excerpt": (item.get("excerpt") or "").strip(),
        "cover": cover,
        "domain": item.get("domain") or "",
        "tags": item.get("tags") or [],
        "collectionId": str(coll.get("$id")) if coll.get("$id") is not None else "0",
        "created": item.get("created"),
        "important": bool(item.get("important")),
        "type": item.get("type") or "link",
    }


def pack_collection(item):
    parent = item.get("parent") or {}
    cover_arr = item.get("cover") or []
    parent_id = parent.get("$id")
    return {
        "id": str(item.get("_id")),
        "title": item.get("title") or "Untitled",
        "count": int(item.get("count") or 0),
        "color": item.get("color"),
        "cover": cover_arr[0] if cover_arr else None,
        "parentId": str(parent_id) if parent_id is not None else None,
    }


def fetch_raindrops(cfg, collection_id="0", page=0, perpage=50, search="", nested=True):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "not configured", "items": []}
    params = {"sort": "-created", "perpage": min(int(perpage), 50), "page": int(page)}
    if search:
        params["search"] = search
    if nested:
        params["nested"] = "true"
    try:
        data = _get(token, f"/raindrops/{collection_id}", **params)
        items = [pack_raindrop(i) for i in (data.get("items") or [])]
        return {"ok": True, "items": items, "count": data.get("count")}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160], "items": []}


def collect_library(cfg, _shared):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"configured": False, "collections": [], "recent": [], "error": None}

    out = {"configured": True, "collections": [], "recent": [], "error": None}

    try:
        data = _get(token, "/collections")
        out["collections"] = [pack_collection(c) for c in (data.get("items") or [])]
    except Exception as e:
        out["error"] = f"collections: {e}"[:160]
        return out

    try:
        data = _get(token, "/raindrops/0", sort="-created", perpage=48, page=0, nested="true")
        out["recent"] = [pack_raindrop(i) for i in (data.get("items") or [])]
    except Exception as e:
        out["error"] = f"recent: {e}"[:160]

    return out
