"""Games/apps/launchpad routes: covers, icons, art files, Steam news, and
the full games/apps CRUD + launch that used to live in Handler._games_post.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import re
from pathlib import Path
from urllib.parse import parse_qs

from backend.core import edit_store, extract_icon, launch_game, load_store, save_store
from backend.collectors.games import (
    _griddb_art, _xbox_roots, griddb_covers, griddb_icons, fetch_game_news, save_cover,
)


def handle_get(handler, path, route, snapshot):
    if path == "/api/griddb":
        name = (parse_qs(route.query).get("name") or [""])[0]
        art = _griddb_art(snapshot.cfg, name) if name else None
        if art:
            handler._send(json.dumps({"url": art}))
        else:
            handler._send(json.dumps({"error": "not found"}), code=404)
        return True
    if path == "/api/covers":
        q = parse_qs(route.query)
        name = (q.get("name") or [""])[0]
        appid = (q.get("appid") or [""])[0]
        if not name:
            handler._send(json.dumps({"covers": [], "error": "no name"}), code=400)
            return True
        handler._send(json.dumps(griddb_covers(snapshot.cfg, name, appid if appid.isdigit() else None)))
        return True
    if path == "/api/app-icons":
        name = (parse_qs(route.query).get("name") or [""])[0]
        if not name:
            handler._send(json.dumps({"icons": [], "error": "no name"}), code=400)
            return True
        handler._send(json.dumps(griddb_icons(snapshot.cfg, name)))
        return True
    if path == "/api/games/news":
        q = parse_qs(route.query)
        appid = (q.get("appid") or [""])[0]
        name = (q.get("name") or [""])[0]
        source = (q.get("source") or ["steam"])[0]
        if source == "steam" and not appid.isdigit():
            handler._send(json.dumps({"ok": False, "items": [], "error": "bad appid"}), code=400)
            return True
        handler._send(json.dumps(fetch_game_news(name, source, appid)))
        return True
    if path == "/api/art":
        wanted = (parse_qs(route.query).get("path") or [""])[0]
        try:
            target = Path(wanted).resolve()
        except Exception:
            handler._send("bad path", "text/plain", 400)
            return True
        roots = [r.resolve() for r in _xbox_roots(snapshot.cfg)]
        cache = (Path(snapshot.cfg["steam_path"]) / "appcache" / "librarycache")
        if cache.is_dir(): roots.append(cache.resolve())
        if not any(str(target).startswith(str(r)) for r in roots):
            handler._send("outside the game folders", "text/plain", 403)
            return True
        if not target.is_file():
            handler._send("not found", "text/plain", 404)
            return True
        kind = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(target.suffix.lower(), "application/octet-stream")
        handler._send(target.read_bytes(), kind)
        return True
    return None


def dispatch_post(path, body):
    """Every one of these ends the same way: write the store, rebuild the
    games snapshot immediately so the next poll (2s away) already shows it.
    Returns the result dict, or None if `path` isn't a games/apps route."""

    if path == "/api/games/add":
        name = str(body.get("name") or "").strip()
        if not name: return {"ok": False, "error": "A name is required"}
        launch = body.get("launch") or ""
        gid = "m-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        art = body.get("art") or None
        if art and not str(art).startswith(("http", "/api/")):
            art = save_cover(art, gid)
        def mutate(store):
            store["manual"] = [m for m in store["manual"] if m.get("id") != gid]
            store["manual"].append({"id": gid, "name": name, "launch": launch, "art": art})
            if body.get("shelf"): store["place"][gid] = str(body["shelf"])
            store["hidden"] = [h for h in store["hidden"] if h != gid]
            return gid
        return {"ok": True, "id": edit_store(mutate)}

    if path == "/api/games/art":
        gid = str(body.get("id") or "")
        url = body.get("url")
        if not gid: return {"ok": False, "error": "no id"}
        if url and not str(url).startswith(("http", "/api/")):
            url = save_cover(url, gid)
            if not url: return {"ok": False, "error": "Couldn't read that image"}
        def mutate(store):
            if url: store["art"][gid] = url
            else: store["art"].pop(gid, None)      # falsy url = back to automatic
            for entry in store["manual"]:
                if entry.get("id") == gid: entry["art"] = url
        return edit_store(mutate) or {"ok": True, "url": url}

    if path == "/api/games/move":
        gid, shelf = str(body.get("id") or ""), str(body.get("shelf") or "")
        index = body.get("index")
        if not gid or not shelf: return {"ok": False, "error": "id and shelf required"}
        def mutate(store):
            store["place"][gid] = shelf
            for key, ids in store["order"].items():
                if key != shelf: store["order"][key] = [i for i in ids if i != gid]
            ids = [i for i in (store["order"].get(shelf) or []) if i != gid]
            ids.insert(max(0, min(len(ids), int(index))) if index is not None else len(ids), gid)
            store["order"][shelf] = ids
        return edit_store(mutate) or {"ok": True}

    if path == "/api/games/order":
        shelf = str(body.get("shelf") or "")
        ids = [str(i) for i in (body.get("ids") or [])]
        if not shelf: return {"ok": False, "error": "no shelf"}
        def mutate(store):
            moved = set(ids)
            for key in list(store["order"]):
                if key != shelf:
                    store["order"][key] = [i for i in store["order"][key] if i not in moved]
            store["order"][shelf] = ids
            for gid in ids: store["place"][gid] = shelf
        return edit_store(mutate) or {"ok": True}

    if path == "/api/games/hide":
        gid = str(body.get("id") or "")
        hide = bool(body.get("hidden", True))
        def mutate(store):
            others = [h for h in store["hidden"] if h != gid]
            store["hidden"] = others + ([gid] if hide else [])
        return edit_store(mutate) or {"ok": True}

    if path == "/api/games/favorite":
        gid = str(body.get("id") or "")
        on = bool(body.get("favorite", True))
        if not gid: return {"ok": False, "error": "no id"}
        def mutate(store):
            others = [f for f in store.get("favorites") or [] if f != gid]
            store["favorites"] = others + ([gid] if on else [])
        return edit_store(mutate) or {"ok": True}

    if path == "/api/games/remove":
        gid = str(body.get("id") or "")
        def mutate(store):
            was_manual = any(m.get("id") == gid for m in store["manual"])
            store["manual"] = [m for m in store["manual"] if m.get("id") != gid]
            store["art"].pop(gid, None)
            store["place"].pop(gid, None)
            for key, ids in store["order"].items():
                store["order"][key] = [i for i in ids if i != gid]
            # A discovered game can't be deleted, only hidden - it would
            # just reappear on the next scan.
            if not was_manual and gid not in store["hidden"]: store["hidden"].append(gid)
            return was_manual
        return {"ok": True, "deleted": edit_store(mutate)}

    if path == "/api/apps/add":
        label = str(body.get("label") or "").strip()
        if not label: return {"ok": False, "error": "A name is required"}
        aid = "app-" + re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        icon = body.get("icon") or None
        if icon and not str(icon).startswith(("http", "/api/")):
            icon = save_cover(icon, aid)
        # clear=True means "leave it blank" - distinct from just not
        # passing an icon, which still gets the auto-detect attempt
        # (that's what makes adding a new app icon-less rare).
        if not icon and not body.get("clear"):
            icon, _note = extract_icon(body.get("target"), aid)
        def mutate(store):
            store["apps"] = [a for a in store["apps"] if a.get("id") != aid]
            store["apps"].append({"id": aid, "label": label,
                                  "target": body.get("target") or "", "icon": icon})
            return aid
        return {"ok": True, "id": edit_store(mutate)}

    if path == "/api/apps/icon-detect":
        target = body.get("target") or ""
        slug = str(body.get("id") or "app")
        icon, note = extract_icon(target, slug)
        if not icon: return {"ok": False, "error": note}
        return {"ok": True, "icon": icon}

    if path == "/api/apps/icons":
        store = load_store()
        found = 0
        misses = []
        for app in store["apps"]:
            if app.get("icon") and not body.get("force"): continue
            icon, note = extract_icon(app.get("target"), app.get("id") or app.get("label"))
            if icon:
                app["icon"] = icon
                found += 1
            else:
                misses.append(f"{app.get('label')}: {note}")
        save_store(store)
        return {"ok": True, "found": found, "of": len(store["apps"]), "misses": misses[:6]}

    if path == "/api/apps/remove":
        aid = str(body.get("id") or "")
        def mutate(store):
            store["apps"] = [a for a in store["apps"] if a.get("id") != aid]
        return edit_store(mutate) or {"ok": True}

    if path == "/api/apps/order":
        ids = [str(i) for i in (body.get("ids") or [])]
        def mutate(store):
            known = {a["id"]: a for a in store["apps"]}
            store["apps"] = [known[i] for i in ids if i in known] + \
                            [a for a in store["apps"] if a["id"] not in ids]
        return edit_store(mutate) or {"ok": True}

    return None


def handle_post_launch(handler, body):
    """/api/launch - not part of the games/apps store CRUD above, but kept
    alongside it since it's exclusively invoked from games/apps tiles."""
    return {"ok": launch_game(body.get("target"))}
