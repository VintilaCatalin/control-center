"""Settings/store/views/pages/shelves/layout routes - the generic
UI-configuration surface (as opposed to games.py's games/apps CRUD).

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import time

from backend.core import (
    CONFIG_FILE, CONFIG_ORIGIN, COVER_DIR, DEFAULTS, DEFAULT_LAYOUTS, DEFAULT_VIEWS,
    SECRET_KEYS, SETTINGS_SCHEMA, STORE_FILE, _slug, edit_store, load_config, load_store,
    save_profile_photo_data, save_uploaded_image_data,
)
from backend.collectors.games import save_cover
from backend.collectors.reading import parse_subscriptions


def handle_get(handler, path, route, snapshot):
    if path == "/api/store":
        handler._send(json.dumps(load_store()))
        return True
    if path == "/api/settings":
        store = load_store()
        effective = load_config()
        values, origins = {}, {}
        for group in SETTINGS_SCHEMA:
            for entry in group["keys"]:
                key = entry["key"]
                if key.startswith("_profile_"):
                    values[key] = store.get("profile", {}).get(key[9:], "")
                    origins[key] = "panel"
                    continue
                values[key] = effective.get(key, "")
                origins[key] = CONFIG_ORIGIN.get(key, "default")
        handler._send(json.dumps({
            "schema": SETTINGS_SCHEMA, "values": values, "origins": origins,
            "secrets": sorted(SECRET_KEYS),
            "views": store.get("views") or DEFAULT_VIEWS,
            "pages": store.get("pages") or [],
            "profile": store.get("profile") or {},
            "config_file": str(CONFIG_FILE),
            "config_problem": CONFIG_ORIGIN.get("_file_problem"),
            "store_file": str(STORE_FILE),
            "onboarding_complete": bool(store.get("onboarding_complete")),
        }))
        return True
    return None


def dispatch_post(path, body, snapshot):
    """/api/settings/*, /api/views, /api/pages*, /api/shelves*, /api/layout*.
    Returns the result dict, or None if `path` isn't one of these routes."""

    if path == "/api/settings/onboarding-complete":
        # First-run onboarding writes through here once - "skip everything"
        # and "connected three things" both end the same way: this flag
        # flips, and the app stops routing to the onboarding flow. Nothing
        # about which integrations got configured is tracked separately
        # here; that's already visible from /api/integrations.
        def mutate(store):
            store["onboarding_complete"] = True
        edit_store(mutate)
        return {"ok": True}

    if path == "/api/settings/feeds-import":
        found = parse_subscriptions(body.get("text"))
        if not found:
            return {"ok": False, "error": "Couldn't find any channels in that. "
                                          "Paste the Takeout subscriptions.csv or an OPML export."}
        add = body.get("feeds") if isinstance(body.get("feeds"), list) else None
        chosen = add if add else [f"{f['label']} | {f['url']}" for f in found]
        def mutate(store):
            current = (store.get("settings", {}).get("feeds")
                       or DEFAULTS["feeds"]).strip().splitlines()
            have = {line.split("|", 1)[-1].strip() for line in current if "|" in line}
            kept = [l.strip() for l in current if l.strip()]
            added = 0
            for line in chosen:
                url = str(line).split("|", 1)[-1].strip()
                if url in have: continue
                have.add(url)
                kept.append(str(line).strip())
                added += 1
            store.setdefault("settings", {})["feeds"] = "\n".join(kept)
            return added
        added = edit_store(mutate)
        snapshot.reload()
        return {"ok": True, "found": len(found), "added": added,
                "channels": [f["label"] for f in found[:40]]}

    if path == "/api/settings/save":
        values = body.get("values") or {}
        if not isinstance(values, dict): return {"ok": False, "error": "bad payload"}
        known = {e["key"] for g in SETTINGS_SCHEMA for e in g["keys"]} | set(DEFAULTS)
        saved, skipped = [], []
        def mutate(store):
            store.setdefault("settings", {})
            store.setdefault("profile", {})
            for key, value in values.items():
                if key not in known:
                    skipped.append(key)
                    continue
                saved.append(key)
                if key.startswith("_profile_"):
                    field = key[9:]
                    if field == "photo" and value and not str(value).startswith(("http", "/api/")):
                        photo_url = save_cover(value, "profile-photo")
                        if photo_url: store["profile"]["photo"] = photo_url
                    else:
                        store["profile"][field] = str(value)
                    continue
                text = "" if value is None else str(value)
                # Blank means "stop overriding", not "set to empty" - so
                # clearing a field in the panel falls back to config.ini
                # rather than wiping a value you never touched here.
                if text.strip() == "": store["settings"].pop(key, None)
                else: store["settings"][key] = text
            return True
        edit_store(mutate)
        snapshot.reload()
        if skipped and not saved:
            return {"ok": False, "error": "Unknown setting keys - restart Control Center to pick up new settings.",
                    "saved": saved, "skipped": skipped}
        return {"ok": True, "saved": saved, "skipped": skipped}

    if path == "/api/settings/profile-photo":
        # The upload counterpart to save_cover() (which only ever
        # handles a path already on disk) - a real file picker in
        # the browser can only ever hand this a data: URL, not a
        # local path, so this decodes and writes it the same way
        # save_cover copies an existing file into COVER_DIR.
        if body.get("remove"):
            def mutate(store):
                store.setdefault("profile", {})["photo"] = ""
            edit_store(mutate)
            for stale in COVER_DIR.glob("profile-photo.*"):
                try: stale.unlink()
                except OSError: pass
            snapshot.reload()
            return {"ok": True, "url": None}
        url = save_profile_photo_data(str(body.get("data") or ""))
        if not url: return {"ok": False, "error": "Couldn't read that image"}
        def mutate(store):
            store.setdefault("profile", {})["photo"] = url
        edit_store(mutate)
        snapshot.reload()
        return {"ok": True, "url": url}

    if path == "/api/settings/background-image":
        # Same upload shape as /api/settings/profile-photo, just
        # writing into store["settings"]["background_image"]
        # instead of store["profile"]["photo"] - a plain settings
        # key like accent_override, not a profile field, so it
        # needs no special-cased read path in GET /api/settings.
        if body.get("remove"):
            def mutate(store):
                store.setdefault("settings", {}).pop("background_image", None)
            edit_store(mutate)
            for stale in COVER_DIR.glob("background-image.*"):
                try: stale.unlink()
                except OSError: pass
            snapshot.reload()
            return {"ok": True, "url": None}
        url = save_uploaded_image_data(str(body.get("data") or ""), "background-image")
        if not url: return {"ok": False, "error": "Couldn't read that image"}
        def mutate(store):
            store.setdefault("settings", {})["background_image"] = url
        edit_store(mutate)
        snapshot.reload()
        return {"ok": True, "url": url}

    if path == "/api/settings/test-connection":
        # One generic reachability check every Integrations card
        # uses (see IntegrationsPage.tsx) instead of a bespoke
        # tester per service - a plain GET against whatever base
        # URL that integration is configured with, timed, with
        # the real status code or error surfaced back.
        import requests
        url = str(body.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            return {"ok": False, "error": "no URL configured"}
        started = time.monotonic()
        try:
            r = requests.get(url, timeout=6, headers={"User-Agent": "desk-panel/1.0"})
            ms = round((time.monotonic() - started) * 1000)
            return {"ok": r.status_code < 500, "status": r.status_code, "ms": ms}
        except Exception as e:
            ms = round((time.monotonic() - started) * 1000)
            return {"ok": False, "error": str(e)[:160], "ms": ms}

    if path == "/api/views":
        incoming = body.get("views")
        if not isinstance(incoming, list) or not incoming:
            return {"ok": False, "error": "views must be a non-empty list"}
        allowed = {v["key"] for v in DEFAULT_VIEWS}
        def mutate(store):
            built = []
            for raw in incoming:
                key = str((raw or {}).get("key") or "")
                if key not in allowed or any(b["key"] == key for b in built): continue
                built.append({"key": key,
                              "label": str((raw or {}).get("label") or key).strip()[:24] or key,
                              "visible": bool((raw or {}).get("visible", True))})
            for view in DEFAULT_VIEWS:
                if not any(b["key"] == view["key"] for b in built):
                    built.append(dict(view))
            # Settings can be renamed and moved but never hidden, or you
            # would have no way back to this screen.
            for view in built:
                if view["key"] == "settings": view["visible"] = True
            store["views"] = built
            return [v["key"] for v in built]
        return {"ok": True, "views": edit_store(mutate)}

    if path == "/api/shelves":
        incoming = body.get("shelves")
        if not isinstance(incoming, list) or not incoming:
            return {"ok": False, "error": "shelves must be a non-empty list"}
        def mutate(store):
            known = {s["id"]: s for s in store["shelves"]}
            built, used = [], set()
            for raw in incoming:
                label = str((raw or {}).get("label") or "").strip()
                if not label: continue
                sid = str((raw or {}).get("id") or "").strip() or _slug(label)
                while sid in used: sid += "-2"
                used.add(sid)
                built.append({"id": sid, "label": label,
                              "claims": (raw or {}).get("claims", known.get(sid, {}).get("claims", []))})
            if built: store["shelves"] = built
            return [s["id"] for s in store["shelves"]]
        return {"ok": True, "shelves": edit_store(mutate)}

    if path == "/api/pages/add":
        label = str(body.get("label") or "").strip()
        if not label: return {"ok": False, "error": "A name is required"}
        def mutate(store):
            used = {p["id"] for p in store.get("pages") or []}
            pid = "page-" + _slug(label)
            while pid in used: pid += "-2"
            store.setdefault("pages", []).append(
                {"id": pid, "label": label, "icon": str(body.get("icon") or "").strip() or "🔗", "items": []})
            return pid
        return {"ok": True, "id": edit_store(mutate)}

    if path == "/api/pages/remove":
        pid = str(body.get("id") or "")
        def mutate(store):
            store["pages"] = [p for p in store.get("pages") or [] if p["id"] != pid]
        return edit_store(mutate) or {"ok": True}

    if path == "/api/pages/rename":
        pid = str(body.get("id") or "")
        label = str(body.get("label") or "").strip()
        def mutate(store):
            for p in store.get("pages") or []:
                if p["id"] == pid:
                    if label: p["label"] = label
                    if body.get("icon") is not None: p["icon"] = str(body["icon"]).strip() or "🔗"
        return edit_store(mutate) or {"ok": True}

    if path == "/api/pages/item/add":
        pid = str(body.get("page") or "")
        label = str(body.get("label") or "").strip()
        url = str(body.get("url") or "").strip()
        if not label or not url: return {"ok": False, "error": "A name and a link are required"}
        icon = body.get("icon") or None
        iid = "item-" + _slug(label) + "-" + str(int(time.time() * 1000))[-6:]
        if icon and not str(icon).startswith(("http", "/api/")):
            icon = save_cover(icon, iid)
        def mutate(store):
            for p in store.get("pages") or []:
                if p["id"] == pid:
                    p.setdefault("items", []).append({"id": iid, "label": label, "url": url, "icon": icon})
                    return iid
            return None
        result = edit_store(mutate)
        return {"ok": bool(result), "id": result} if result else {"ok": False, "error": "no such page"}

    if path == "/api/pages/item/remove":
        pid = str(body.get("page") or "")
        iid = str(body.get("id") or "")
        def mutate(store):
            for p in store.get("pages") or []:
                if p["id"] == pid:
                    p["items"] = [i for i in p.get("items") or [] if i["id"] != iid]
        return edit_store(mutate) or {"ok": True}

    if path == "/api/pages/item/order":
        pid = str(body.get("page") or "")
        ids = [str(i) for i in (body.get("ids") or [])]
        def mutate(store):
            for p in store.get("pages") or []:
                if p["id"] == pid:
                    known = {i["id"]: i for i in p.get("items") or []}
                    p["items"] = [known[i] for i in ids if i in known] + \
                                [i for i in p.get("items") or [] if i["id"] not in ids]
        return edit_store(mutate) or {"ok": True}

    if path == "/api/shelves/width":
        sid = str(body.get("id") or "")
        width = body.get("width")
        if not sid: return {"ok": False, "error": "no id"}
        def mutate(store):
            store.setdefault("widths", {})
            if width: store["widths"][sid] = round(float(width), 3)
            else: store["widths"].pop(sid, None)   # falsy = back to automatic
        return edit_store(mutate) or {"ok": True}

    if path == "/api/layout/resize":
        view = str(body.get("view") or "")
        pid = str(body.get("id") or "")
        w, h = body.get("w"), body.get("h")
        if view not in DEFAULT_LAYOUTS or not pid: return {"ok": False, "error": "bad request"}
        def mutate(store):
            layouts = store.setdefault("layouts", {})
            entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
            entry.setdefault("sizes", {})[pid] = {
                "w": max(1, min(8, int(w or 1))), "h": max(1, min(20, int(h or 1)))}
        return edit_store(mutate) or {"ok": True}

    if path == "/api/layout/order":
        view = str(body.get("view") or "")
        order = [str(i) for i in (body.get("order") or [])]
        if view not in DEFAULT_LAYOUTS: return {"ok": False, "error": "bad request"}
        def mutate(store):
            layouts = store.setdefault("layouts", {})
            entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
            entry["order"] = order
        return edit_store(mutate) or {"ok": True}

    if path == "/api/layout/hide":
        view = str(body.get("view") or "")
        pid = str(body.get("id") or "")
        hide = bool(body.get("hidden", True))
        if view not in DEFAULT_LAYOUTS or not pid: return {"ok": False, "error": "bad request"}
        def mutate(store):
            layouts = store.setdefault("layouts", {})
            entry = layouts.setdefault(view, {})  # bare {} - see effective_layout()
            others = [p for p in entry.get("hidden") or [] if p != pid]
            entry["hidden"] = others + ([pid] if hide else [])
        return edit_store(mutate) or {"ok": True}

    return None
