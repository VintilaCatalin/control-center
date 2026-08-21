"""Raindrop library routes — collection browse + save/unsave from Reading."""

import json
import threading
from urllib.parse import parse_qs

from backend.collectors.library import (
    delete_raindrop,
    fetch_raindrops,
    rename_raindrop_collection,
    reorder_collections,
    save_link_to_raindrop,
    set_collection_icon,
    set_raindrop_important,
    unsave_link_from_raindrop,
)


def handle_get(handler, path, route, snapshot):
    if path != "/api/library/raindrops":
        return None
    qs = parse_qs(route.query)
    collection = (qs.get("collection") or ["0"])[0]
    page = (qs.get("page") or ["0"])[0]
    search = (qs.get("search") or [""])[0]
    perpage = (qs.get("perpage") or ["50"])[0]
    try:
        page_i = max(0, int(page))
        perpage_i = min(50, max(1, int(perpage)))
    except ValueError:
        handler._send(json.dumps({"ok": False, "error": "bad page"}), code=400)
        return True
    result = fetch_raindrops(snapshot.cfg, collection, page_i, perpage_i, search)
    code = 200 if result.get("ok") else 502
    handler._send(json.dumps(result), code=code)
    return True


def _patch_saved_urls(snapshot, url, *, present):
    """Optimistic Save-state so the next poll doesn't flash the button off."""
    url = (url or "").strip()
    if not url:
        return
    with snapshot.lock:
        lib = dict(snapshot.data.get("library") or {})
        urls = set(lib.get("saved_urls") or [])
        if present:
            urls.add(url)
        else:
            urls.discard(url)
        lib["saved_urls"] = sorted(urls)
        if snapshot.data.get("library") != lib:
            snapshot.data["library"] = lib
            snapshot.versions["library"] = snapshot.versions.get("library", 0) + 1


def _refresh_library(snapshot):
    threading.Thread(target=snapshot.refresh, args=("library",), daemon=True).start()


def dispatch_post(path, body, snapshot):
    if path == "/api/library/save":
        url = str(body.get("url") or "")
        result = save_link_to_raindrop(
            snapshot.cfg,
            url=url,
            title=str(body.get("title") or ""),
            excerpt=str(body.get("excerpt") or ""),
            cover=body.get("cover") or None,
            tags=body.get("tags") if isinstance(body.get("tags"), list) else None,
            source=str(body.get("source") or "feed"),
        )
        if result.get("ok"):
            _patch_saved_urls(snapshot, url, present=True)
            if result.get("collectionId"):
                with snapshot.lock:
                    lib = dict(snapshot.data.get("library") or {})
                    lib["from_reading_id"] = str(result["collectionId"])
                    snapshot.data["library"] = lib
            _refresh_library(snapshot)
        return result

    if path == "/api/library/unsave":
        url = str(body.get("url") or "")
        result = unsave_link_from_raindrop(snapshot.cfg, url)
        if result.get("ok"):
            _patch_saved_urls(snapshot, url, present=False)
            _refresh_library(snapshot)
        return result

    if path == "/api/library/favorite":
        result = set_raindrop_important(
            snapshot.cfg,
            str(body.get("id") or ""),
            bool(body.get("important", True)),
        )
        if result.get("ok"):
            _refresh_library(snapshot)
        return result

    if path == "/api/library/remove":
        result = delete_raindrop(snapshot.cfg, str(body.get("id") or ""))
        if result.get("ok"):
            url = str(body.get("url") or "")
            if url:
                _patch_saved_urls(snapshot, url, present=False)
            _refresh_library(snapshot)
        return result

    if path == "/api/library/collection/rename":
        result = rename_raindrop_collection(
            snapshot.cfg,
            str(body.get("id") or ""),
            str(body.get("title") or ""),
        )
        if result.get("ok"):
            _refresh_library(snapshot)
        return result

    if path == "/api/library/collection/icon":
        result = set_collection_icon(str(body.get("id") or ""), body.get("icon") or "")
        if result.get("ok"):
            _refresh_library(snapshot)
        return result

    if path == "/api/library/collection/reorder":
        result = reorder_collections(body.get("ids"))
        if result.get("ok"):
            _refresh_library(snapshot)
        return result

    return None
