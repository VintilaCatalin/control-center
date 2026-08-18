"""Recent screenshots/downloads thumbnail, download, and open routes.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import mimetypes
import os
from urllib.parse import parse_qs

from backend.collectors.files import _files_resolve
from backend.collectors.wallpapers import wall_thumb


def handle_get(handler, path, route, snapshot):
    if path == "/api/filesys/thumb":
        q = parse_qs(route.query)
        kind = (q.get("kind") or [""])[0]
        wanted = (q.get("path") or [""])[0]
        if kind not in ("screenshots", "downloads"):
            handler._send("bad kind", "text/plain", 400)
            return True
        target = _files_resolve(snapshot.cfg, kind, wanted)
        if not target:
            handler._send("not allowed", "text/plain", 403)
            return True
        try:
            handler._send(wall_thumb(str(target), size=(220, 160)), "image/jpeg")
        except Exception as e:
            handler._send(f"thumb failed: {e}", "text/plain", 500)
        return True
    if path == "/api/filesys/file":
        q = parse_qs(route.query)
        kind = (q.get("kind") or [""])[0]
        wanted = (q.get("path") or [""])[0]
        if kind not in ("screenshots", "downloads"):
            handler._send("bad kind", "text/plain", 400)
            return True
        target = _files_resolve(snapshot.cfg, kind, wanted)
        if not target:
            handler._send("not allowed", "text/plain", 403)
            return True
        # Content-Disposition's filename is what the browser's own
        # "DownloadURL" drag-to-desktop mechanism uses to name the
        # file it writes - without it, a drag-out lands as a random
        # temp name instead of the screenshot's real filename.
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        handler.send_response(200)
        handler.send_header("Content-Type", mime)
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Content-Disposition", f'attachment; filename="{target.name}"')
        handler.send_header("Cache-Control", "max-age=600")
        handler.end_headers()
        handler.wfile.write(body)
        return True
    return None


def handle_post(handler, path, snapshot):
    if path == "/api/filesys/open":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        kind = str(body.get("kind") or "")
        if kind not in ("screenshots", "downloads"):
            handler._send(json.dumps({"ok": False}), code=400)
            return True
        target = _files_resolve(snapshot.cfg, kind, str(body.get("path") or ""))
        if not target:
            handler._send(json.dumps({"ok": False, "error": "not allowed"}), code=403)
            return True
        try:
            os.startfile(str(target))
            handler._send(json.dumps({"ok": True}))
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:120]}))
        return True
    return None
