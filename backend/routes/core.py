"""Core/static routes: the React shell, the legacy panel, the full snapshot,
the generic file picker, the COVER_DIR file server, and static-file fallback.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import mimetypes
import os
import re
from pathlib import Path

from backend.core import LEGACY_INDEX, REACT_DIST, _STATIC_MIME, COVER_DIR, pick_file


def handle_get(handler, path, route, snapshot):
    """Returns True if handled (response already sent), else None."""
    if path in ("/", "/index.html"):
        dist_index = REACT_DIST / "index.html"
        if dist_index.is_file():
            handler._send(dist_index.read_bytes(), "text/html; charset=utf-8")
            return True
        try:
            handler._send(LEGACY_INDEX.read_bytes(), "text/html; charset=utf-8")
        except OSError:
            handler._send("Neither the built frontend nor the legacy panel could be found.", "text/plain", 404)
        return True
    if path in ("/legacy", "/legacy/", "/legacy/index.html"):
        try:
            handler._send(LEGACY_INDEX.read_bytes(), "text/html; charset=utf-8")
        except OSError:
            handler._send("legacy/index.html is missing.", "text/plain", 404)
        return True
    if path == "/api/data":
        handler._send(json.dumps(snapshot.payload()))
        return True
    if path == "/api/pick":
        from urllib.parse import parse_qs
        kind = (parse_qs(route.query).get("kind") or ["exe"])[0]
        handler._send(json.dumps({"path": pick_file(kind)}))
        return True
    if path == "/api/cover":
        from urllib.parse import parse_qs
        wanted = (parse_qs(route.query).get("path") or [""])[0]
        try:
            target = Path(wanted).resolve()
        except Exception:
            handler._send("bad path", "text/plain", 400)
            return True
        if not str(target).startswith(str(COVER_DIR.resolve())) or not target.is_file():
            handler._send("not allowed", "text/plain", 403)
            return True
        kind = {".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp"}.get(target.suffix.lower(), "image/jpeg")
        handler._send(target.read_bytes(), kind)
        return True

    # Static fallback: this MUST run last, after every other GET route in
    # every other domain module has had a chance to match - see do_GET in
    # server.py for the exact try-order.
    if REACT_DIST.is_dir():
        dist_root = REACT_DIST.resolve()
        dist_candidate = (REACT_DIST / path.lstrip("/")).resolve()
        if dist_candidate.is_file() and str(dist_candidate).startswith(str(dist_root)):
            mime = _STATIC_MIME.get(dist_candidate.suffix.lower()) or mimetypes.guess_type(dist_candidate.name)[0] or "application/octet-stream"
            handler._send(dist_candidate.read_bytes(), mime)
            return True
    legacy_dir = LEGACY_INDEX.parent
    candidate = (legacy_dir / path.lstrip("/")).resolve()
    if candidate.is_file() and str(candidate).startswith(str(legacy_dir.resolve())):
        types = {".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2"}
        handler._send(candidate.read_bytes(), types.get(candidate.suffix.lower(), "application/octet-stream"))
        return True
    return None


def handle_post(handler, path, snapshot):
    """/api/open only - reads its own body (matches original inline shape).
    Returns True if handled, else None."""
    if path == "/api/open":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        url = str(body.get("url") or "")
        if not re.match(r"^(https?|spotify)://", url, re.I) and not url.startswith("spotify:"):
            handler._send(json.dumps({"ok": False}), code=400)
            return True
        try:
            os.startfile(url)
            handler._send(json.dumps({"ok": True}))
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:120]}))
        return True
    return None
