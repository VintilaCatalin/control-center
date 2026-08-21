"""Reading routes: feed presets, article extraction, hotlink-safe thumb
proxy, Open Library search, and the source/topic/item/book POST groups.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import mimetypes
import os
import re
from urllib.parse import parse_qs

import requests

from backend.collectors.reading import (
    FEED_PRESETS, _books_resolve, _extract_article, add_book, delete_book,
    edit_book, find_book_copies, reading_add_source, reading_add_topic, reading_delete_source,
    reading_edit_source, reading_hide_item, reading_import_subscriptions, reading_remove_topic,
    reading_rename_topic, reading_reorder_topics, reading_set_read, reading_set_saved,
    reading_set_topic_icon, search_local_books, search_open_library, sync_local_books,
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
    if path == "/api/books/copies":
        # Legitimate free/public copies only (Gutenberg + IA/OL). Manual
        # paste of Drive / bought links stays a separate client-side path.
        q = parse_qs(route.query)
        handler._send(json.dumps(find_book_copies(
            (q.get("title") or [""])[0],
            (q.get("author") or [""])[0],
            (q.get("key") or [""])[0],
        )))
        return True
    if path == "/api/books/local-search":
        q = parse_qs(route.query)
        handler._send(json.dumps(search_local_books(
            snapshot.cfg,
            (q.get("title") or [""])[0],
            (q.get("author") or [""])[0],
        )))
        return True
    if path == "/api/books/local":
        # Stream an ebook from the configured books folder only.
        rel = (parse_qs(route.query).get("rel") or [""])[0]
        target = _books_resolve(snapshot.cfg, rel)
        if not target:
            handler._send(json.dumps({"ok": False, "error": "not allowed — check Books folder in Settings"}), "application/json", 403)
            return True
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        suffix = target.suffix.lower()
        if suffix == ".epub":
            mime = "application/epub+zip"
        elif suffix == ".fb2":
            mime = "application/x-fictionbook+xml"
        try:
            body = target.read_bytes()
        except OSError as e:
            handler._send(json.dumps({"ok": False, "error": f"read failed: {e}"}), "application/json", 500)
            return True
        # HTTP headers are latin-1 only. Cyrillic/Unicode filenames (common in
        # FB2 libraries) used to abort the socket mid-response — browser then
        # showed a fake "Couldn't reach Control Center" error.
        from urllib.parse import quote as _q
        ascii_name = target.name.encode("ascii", "ignore").decode("ascii").replace('"', "").strip() or "book"
        if not ascii_name.lower().endswith(suffix):
            ascii_name = ascii_name + suffix
        disposition = f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{_q(target.name, safe='')}"
        handler.send_response(200)
        handler.send_header("Content-Type", mime)
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Content-Disposition", disposition)
        handler.send_header("Cache-Control", "max-age=120")
        handler.end_headers()
        handler.wfile.write(body)
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
        # Instagram (and its CDN/fbcdn siblings) are pickier - a bare
        # bot UA often 403s, and /p/{code}/media/?size=l needs a normal
        # browser UA to follow the redirect to a fresh JPEG.
        host = (wanted.split("/", 3)[2] if "://" in wanted else "").lower()
        iggy = any(h in host for h in ("instagram.com", "cdninstagram.com", "fbcdn.net"))
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                if iggy else "desk-panel/1.0"
            ),
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        }
        if iggy:
            headers["Referer"] = "https://www.instagram.com/"
        try:
            r = requests.get(wanted, timeout=12, headers=headers, allow_redirects=True)
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
            if not ctype.startswith("image/"): raise ValueError("not an image")
        except Exception:
            handler._send("thumb unavailable", "text/plain", 502)
            return True
        handler.send_response(200)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Length", str(len(r.content)))
        # Instagram media redirects mint short-lived CDN URLs - don't
        # cache the proxied bytes for long or they'll go stale in the
        # browser while Raindrop's own covers rotate underneath.
        handler.send_header("Cache-Control", "max-age=900" if iggy else "max-age=3600")
        handler.end_headers()
        handler.wfile.write(r.content)
        return True
    return None


def dispatch_source(path, body):
    """/api/reading/source/*, /api/reading/topics/*, and
    /api/reading/import-subscriptions - one group in the original chain."""
    if path == "/api/reading/source/add":
        return reading_add_source(body)
    if path == "/api/reading/source/edit":
        return reading_edit_source(str(body.get("id") or ""), body)
    if path == "/api/reading/source/delete":
        return reading_delete_source(str(body.get("id") or ""))
    if path == "/api/reading/import-subscriptions":
        return reading_import_subscriptions(body.get("text"))
    if path == "/api/reading/topics/add":
        return reading_add_topic(body.get("label"), body.get("icon"))
    if path == "/api/reading/topics/remove":
        return reading_remove_topic(str(body.get("id") or ""))
    if path == "/api/reading/topics/icon":
        return reading_set_topic_icon(str(body.get("id") or ""), body.get("icon"))
    if path == "/api/reading/topics/rename":
        return reading_rename_topic(str(body.get("id") or ""), body.get("label"))
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


def dispatch_books(path, body, cfg=None):
    if path == "/api/books/add":
        return add_book(body)
    if path == "/api/books/edit":
        return edit_book(str(body.get("id") or ""), body)
    if path == "/api/books/delete":
        return delete_book(str(body.get("id") or ""))
    if path == "/api/books/sync-local":
        # Scan books_dir / NAS and add anything not already on the shelf.
        return sync_local_books(cfg or {})
    if path == "/api/books/local/open":
        # EPUB (and other formats browsers can't iframe) open in the OS
        # default reader — still constrained to the books folder.
        rel = str(body.get("rel") or "").strip()
        if not rel and body.get("url"):
            from urllib.parse import urlparse, parse_qs as _pq
            q = _pq(urlparse(str(body.get("url"))).query)
            rel = (q.get("rel") or [""])[0]
        target = _books_resolve(cfg or {}, rel)
        if not target:
            return {"ok": False, "error": "not allowed"}
        try:
            os.startfile(str(target))
            return {"ok": True, "path": str(target)}
        except Exception as e:
            return {"ok": False, "error": str(e)[:120]}
    return None
