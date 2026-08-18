"""Immich photo proxy + pin/next routes.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import re
from urllib.parse import parse_qs

from backend.collectors.media_extras import _immich, _photo_pin


def handle_get(handler, path, route, snapshot):
    if path == "/api/photo":
        wanted = (parse_qs(route.query).get("id") or [""])[0]
        if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", wanted):
            handler._send("bad id", "text/plain", 400)
            return True
        try:
            r = _immich(snapshot.cfg, f"/api/assets/{wanted}/thumbnail",
                        params={"size": "preview"})
            if r is None:
                handler._send("immich not configured", "text/plain", 404)
                return True
            r.raise_for_status()
        except Exception as e:
            handler._send(f"immich: {e}", "text/plain", 502)
            return True
        handler.send_response(200)
        handler.send_header("Content-Type", r.headers.get("Content-Type", "image/jpeg"))
        handler.send_header("Content-Length", str(len(r.content)))
        handler.send_header("Cache-Control", "max-age=600")
        handler.end_headers()
        handler.wfile.write(r.content)
        return True
    return None


def handle_post(handler, path, snapshot):
    if path == "/api/photo/pin":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        _photo_pin["on"] = bool(body.get("pinned", True))
        snapshot.refresh("photo")
        handler._send(json.dumps({"ok": True, "pinned": _photo_pin["on"]}))
        return True
    if path == "/api/photo/next":
        _photo_pin["photo"] = None   # forces a real fetch even while pinned
        snapshot.refresh("photo")
        handler._send(json.dumps({"ok": True}))
        return True
    return None
