"""Reading routes: feed presets, article extraction, hotlink-safe thumb
proxy, Open Library search, and the source/bookmark/item/book POST groups.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import re
from urllib.parse import parse_qs

import requests

from backend.collectors.reading import (
    FEED_PRESETS, _extract_article, add_book, add_bookmark, delete_book, delete_bookmark,
    edit_book, reading_add_source, reading_add_topic, reading_delete_source, reading_edit_source,
    reading_hide_item, reading_import_subscriptions, reading_remove_topic, reading_reorder_topics,
    reading_set_read, reading_set_saved, reading_set_topic_icon, search_open_library,
)


def handle_get(handler, path, route, snapshot):
    if path == "/api/feed-presets":
        handler._send(json.dumps({"presets": FEED_PRESETS}))
        return True
    if path == "/api/reading/article":
        q = parse_qs(route.query)
        item_id = (q.get("id") or [""])[0]
        url = (q.get("url") or [""])[0]
        if not re.fullmatch(r"[a-f0-9]{16}", item_id) or not url:
            handler._send(json.dumps({"ok": False, "error": "bad request"}), code=400)
            return True
        handler._send(json.dumps(_extract_article(url, item_id)))
        return True
    if path == "/api/books/search":
        q = (parse_qs(route.query).get("q") or [""])[0]
        handler._send(json.dumps(search_open_library(q)))
        return True
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
            handler._send("bad url", "text/plain", 400)
            return True
        try:
            r = requests.get(wanted, timeout=10, headers={"User-Agent": "desk-panel/1.0"})
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not ctype.startswith("image/"): raise ValueError("not an image")
        except Exception:
            handler._send("thumb unavailable", "text/plain", 502)
            return True
        handler.send_response(200)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Length", str(len(r.content)))
        handler.send_header("Cache-Control", "max-age=3600")
        handler.end_headers()
        handler.wfile.write(r.content)
        return True
    return None


def dispatch_source(path, body):
    """/api/reading/source/*, /api/reading/bookmark/*, /api/reading/topics/*,
    and /api/reading/import-subscriptions - one group in the original chain."""
    if path == "/api/reading/source/add":
        return reading_add_source(body)
    if path == "/api/reading/source/edit":
        return reading_edit_source(str(body.get("id") or ""), body)
    if path == "/api/reading/source/delete":
        return reading_delete_source(str(body.get("id") or ""))
    if path == "/api/reading/import-subscriptions":
        return reading_import_subscriptions(body.get("text"))
    if path == "/api/reading/bookmark/add":
        return add_bookmark(body)
    if path == "/api/reading/bookmark/delete":
        return delete_bookmark(str(body.get("id") or ""))
    if path == "/api/reading/topics/add":
        return reading_add_topic(body.get("label"), body.get("icon"))
    if path == "/api/reading/topics/remove":
        return reading_remove_topic(str(body.get("id") or ""))
    if path == "/api/reading/topics/icon":
        return reading_set_topic_icon(str(body.get("id") or ""), body.get("icon"))
    if path == "/api/reading/topics/reorder":
        return reading_reorder_topics(body.get("ids"))
    return None


def dispatch_item(path, item_id, body):
    """/api/reading/save, /api/reading/read, /api/reading/hide - each acts
    on a single item id, already validated non-empty by the caller."""
    if path == "/api/reading/save":
        return reading_set_saved(item_id, bool(body.get("saved", True)))
    if path == "/api/reading/read":
        return reading_set_read(item_id, bool(body.get("read", True)))
    if path == "/api/reading/hide":
        return reading_hide_item(item_id)
    return None


def dispatch_books(path, body):
    if path == "/api/books/add":
        return add_book(body)
    if path == "/api/books/edit":
        return edit_book(str(body.get("id") or ""), body)
    if path == "/api/books/delete":
        return delete_book(str(body.get("id") or ""))
    return None
