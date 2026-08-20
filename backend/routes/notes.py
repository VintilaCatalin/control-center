"""Notes routes: read-note GET, and the note CRUD POST dispatch.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
from urllib.parse import parse_qs

from backend.collectors.notes import delete_note, move_note, new_note, pin_note, read_note, remove_folder, rename_folder, rename_note, write_note


def handle_get(handler, path, route, snapshot):
    if path == "/api/note":
        rel = (parse_qs(route.query).get("rel") or [""])[0]
        try:
            handler._send(json.dumps(read_note(snapshot.cfg, rel)))
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:140]}), code=400)
        return True
    return None


def dispatch_post(cfg, path, body):
    if path == "/api/note/save":
        return write_note(cfg, body.get("rel"), body.get("text") or "")
    if path == "/api/note/new":
        return new_note(cfg, body.get("name"), body.get("folder") or "")
    if path == "/api/note/delete":
        return delete_note(cfg, body.get("rel"))
    if path == "/api/note/rename":
        return rename_note(cfg, body.get("rel"), body.get("name"))
    if path == "/api/note/move":
        return move_note(cfg, body.get("rel"), body.get("folder") or "")
    if path == "/api/note/folder/remove":
        return remove_folder(cfg, body.get("folder"), body.get("destination") or "")
    if path == "/api/note/folder/rename":
        return rename_folder(cfg, body.get("folder"), body.get("name"))
    if path == "/api/note/pin":
        return pin_note(cfg, body.get("rel"), bool(body.get("pinned", True)))
    return None
