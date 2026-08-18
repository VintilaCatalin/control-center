"""Plex item-detail route.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET dispatch chain in the pre-modularization panel/server.py.
"""

import json
from urllib.parse import parse_qs

from backend.collectors.plex import plex_item_detail


def handle_get(handler, path, route, snapshot):
    if path == "/api/plex/item":
        rating_key = (parse_qs(route.query).get("ratingKey") or [""])[0]
        if not rating_key.isdigit():
            handler._send(json.dumps({"error": "bad ratingKey"}), code=400)
            return True
        try:
            handler._send(json.dumps(plex_item_detail(snapshot.cfg, rating_key)))
        except Exception as e:
            handler._send(json.dumps({"error": str(e)[:160]}), code=502)
        return True
    return None
