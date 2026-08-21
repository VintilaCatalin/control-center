"""Raindrop.io collector — collections, recent saves, and write-back from Reading.

Phone saves land here via Raindrop. Feed/book "Save" in Control Center
creates a raindrop in the dedicated "From Reading" collection so there is
no parallel local bookmark store.
"""

import requests

from backend.core import edit_store, load_store

API_BASE = "https://api.raindrop.io/rest/v1"
FROM_READING_TITLE = "From Reading"


def _headers(token):
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _get(token, path, **params):
    r = requests.get(f"{API_BASE}{path}", headers=_headers(token), params=params, timeout=12)
    r.raise_for_status()
    return r.json()


def _post(token, path, body):
    r = requests.post(f"{API_BASE}{path}", headers=_headers(token), json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _put(token, path, body):
    r = requests.put(f"{API_BASE}{path}", headers=_headers(token), json=body, timeout=15)
    r.raise_for_status()
    return r.json()


def _delete(token, path):
    r = requests.delete(f"{API_BASE}{path}", headers=_headers(token), timeout=12)
    r.raise_for_status()
    return r.json() if r.content else {"result": True}


def pack_raindrop(item):
    coll = item.get("collection") or {}
    cover = item.get("cover") or None
    if isinstance(cover, list):
        cover = cover[0] if cover else None
    if not cover:
        for media in item.get("media") or []:
            link = (media or {}).get("link")
            if link:
                cover = link
                break
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


def pack_collection(item, icon=None):
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
        "icon": icon,
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


def set_raindrop_important(cfg, raindrop_id, important=True):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "Raindrop isn't connected"}
    rid = str(raindrop_id or "").strip()
    if not rid:
        return {"ok": False, "error": "missing id"}
    try:
        data = _put(token, f"/raindrop/{rid}", {"important": bool(important)})
        return {"ok": True, "item": pack_raindrop(data.get("item") or {}), "important": bool(important)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def delete_raindrop(cfg, raindrop_id):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "Raindrop isn't connected"}
    rid = str(raindrop_id or "").strip()
    if not rid:
        return {"ok": False, "error": "missing id"}
    try:
        _delete(token, f"/raindrop/{rid}")
        return {"ok": True, "removed": True, "id": rid}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def rename_raindrop_collection(cfg, collection_id, title):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "Raindrop isn't connected"}
    cid = str(collection_id or "").strip()
    title = str(title or "").strip()[:200]
    if not cid or not title:
        return {"ok": False, "error": "name is required"}
    try:
        data = _put(token, f"/collection/{cid}", {"title": title})
        return {"ok": True, "collection": pack_collection(data.get("item") or {})}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def set_collection_icon(collection_id, icon):
    """Local glyph overlay for Raindrop collections (same GlyphPicker as topics)."""
    cid = str(collection_id or "").strip()
    icon = str(icon or "").strip()[:24]
    if not cid:
        return {"ok": False, "error": "missing id"}
    result = {"ok": True}

    def mutate(store):
        icons = store.setdefault("library_collection_icons", {})
        if icon:
            icons[cid] = icon
        else:
            icons.pop(cid, None)

    edit_store(mutate)
    return result


def reorder_collections(ids):
    """Local sidebar order for Raindrop collections (Raindrop's own group
    ordering is a separate multi-call API; we mirror topic reorder with a
    store list so drag-to-arrange works the same way in Saves)."""
    if not isinstance(ids, list):
        return {"ok": False, "error": "ids required"}
    cleaned = [str(i).strip() for i in ids if str(i or "").strip()]
    if not cleaned:
        return {"ok": False, "error": "ids required"}

    def mutate(store):
        store["library_collection_order"] = cleaned

    edit_store(mutate)
    return {"ok": True, "ids": cleaned}


def _sort_collections(collections, order_ids):
    if not order_ids:
        return collections
    rank = {cid: i for i, cid in enumerate(order_ids)}
    return sorted(
        collections,
        key=lambda c: (rank.get(c["id"], 10_000 + hash(c["id"]) % 1000), (c.get("title") or "").lower()),
    )


def ensure_from_reading_collection(cfg):
    """Find or create the Raindrop collection used for in-app Save actions."""
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return None, "Raindrop isn't connected"

    stored = str(cfg.get("raindrop_from_reading_id") or "").strip()
    try:
        data = _get(token, "/collections")
        collections = data.get("items") or []
    except Exception as e:
        return None, f"collections: {e}"[:160]

    if stored:
        for c in collections:
            if str(c.get("_id")) == stored:
                return int(stored), None

    for c in collections:
        if (c.get("title") or "").strip().lower() == FROM_READING_TITLE.lower():
            cid = int(c["_id"])
            _persist_from_reading_id(cid)
            return cid, None

    try:
        created = _post(token, "/collection", {"title": FROM_READING_TITLE, "view": "list"})
        item = created.get("item") or {}
        cid = int(item["_id"])
        _persist_from_reading_id(cid)
        return cid, None
    except Exception as e:
        return None, f"create collection: {e}"[:160]


def _persist_from_reading_id(cid):
    def mutate(store):
        store.setdefault("settings", {})["raindrop_from_reading_id"] = str(cid)
    edit_store(mutate)


def find_raindrop_by_url(cfg, url):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token or not url:
        return None
    try:
        # Raindrop search matches link text well enough for exact URLs.
        data = _get(token, "/raindrops/0", search=url, perpage=50, page=0)
        target = url.rstrip("/")
        for raw in data.get("items") or []:
            link = (raw.get("link") or "").rstrip("/")
            if link == target:
                return pack_raindrop(raw)
        return None
    except Exception:
        return None


def save_link_to_raindrop(cfg, *, url, title="", excerpt="", cover=None, tags=None, source="feed"):
    """Create (or no-op if already present) a raindrop in From Reading."""
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "Raindrop isn\'t connected — add your token in Settings → Integrations."}
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "A valid link is required"}

    existing = find_raindrop_by_url(cfg, url)
    if existing:
        return {"ok": True, "item": existing, "created": False}

    cid, err = ensure_from_reading_collection(cfg)
    if err:
        return {"ok": False, "error": err}

    body = {
        "link": url,
        "collection": {"$id": cid},
        "pleaseParse": {},
        "tags": list(tags or []) + ([f"via:{source}"] if source else []),
    }
    if title:
        body["title"] = title[:1000]
    if excerpt:
        body["excerpt"] = excerpt[:10000]
    if cover:
        body["cover"] = cover

    try:
        data = _post(token, "/raindrop", body)
        item = pack_raindrop(data.get("item") or {})
        return {"ok": True, "item": item, "created": True, "collectionId": str(cid)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def unsave_link_from_raindrop(cfg, url):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {"ok": False, "error": "Raindrop isn\'t connected"}
    found = find_raindrop_by_url(cfg, url)
    if not found:
        return {"ok": True, "removed": False}
    try:
        _delete(token, f"/raindrop/{found['id']}")
        return {"ok": True, "removed": True, "id": found["id"]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}


def collect_library(cfg, _shared):
    token = (cfg.get("raindrop_token") or "").strip()
    if not token:
        return {
            "configured": False,
            "collections": [],
            "recent": [],
            "favorites": [],
            "saved_urls": [],
            "from_reading_id": None,
            "error": None,
        }

    out = {
        "configured": True,
        "collections": [],
        "recent": [],
        "favorites": [],
        "saved_urls": [],
        "from_reading_id": str(cfg.get("raindrop_from_reading_id") or "") or None,
        "error": None,
    }

    try:
        data = _get(token, "/collections")
        store = load_store()
        icons = store.get("library_collection_icons") or {}
        order = store.get("library_collection_order") or []
        packed = [
            pack_collection(c, icon=icons.get(str(c.get("_id"))))
            for c in (data.get("items") or [])
        ]
        out["collections"] = _sort_collections(packed, order)
        if not out["from_reading_id"]:
            for c in out["collections"]:
                if c["title"].strip().lower() == FROM_READING_TITLE.lower():
                    out["from_reading_id"] = c["id"]
                    break
    except Exception as e:
        out["error"] = f"collections: {e}"[:160]
        return out

    try:
        data = _get(token, "/raindrops/0", sort="-created", perpage=48, page=0, nested="true")
        out["recent"] = [pack_raindrop(i) for i in (data.get("items") or [])]
    except Exception as e:
        out["error"] = f"recent: {e}"[:160]

    # Dedicated favorites pull — not just important flags inside the recent window.
    try:
        fav = _get(token, "/raindrops/0", search="❤️", sort="-created", perpage=50, page=0, nested="true")
        out["favorites"] = [pack_raindrop(i) for i in (fav.get("items") or []) if i.get("important")]
        if not out["favorites"]:
            out["favorites"] = [i for i in out["recent"] if i.get("important")]
    except Exception:
        out["favorites"] = [i for i in out.get("recent") or [] if i.get("important")]

    urls = {i["url"] for i in out["recent"] if i.get("url")}
    # Also pull the From Reading collection so Save state stays accurate
    # even when those items age out of the global recent window.
    if out["from_reading_id"]:
        try:
            fr = _get(token, f"/raindrops/{out['from_reading_id']}", sort="-created", perpage=50, page=0)
            for raw in fr.get("items") or []:
                packed = pack_raindrop(raw)
                if packed.get("url"):
                    urls.add(packed["url"])
        except Exception:
            pass
    out["saved_urls"] = sorted(urls)
    return out
