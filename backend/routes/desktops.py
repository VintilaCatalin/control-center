"""Virtual desktop switcher route.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_POST dispatch chain in the pre-modularization panel/server.py.
"""

import json

from backend.collectors.desktops import go_to_desktop


def handle_post(handler, path, snapshot):
    if path == "/api/desktop/go":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        ok = go_to_desktop(snapshot.cfg, body.get("n"))
        snapshot.refresh("desktops")
        handler._send(json.dumps({"ok": ok}))
        return True
    return None
