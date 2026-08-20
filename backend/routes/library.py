"""On-demand Raindrop raindrop fetches for a specific collection."""

import json
from urllib.parse import parse_qs

from backend.collectors.library import fetch_raindrops


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
