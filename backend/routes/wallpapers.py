"""Wallpaper thumbnail/background/search/apply routes.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_GET/do_POST dispatch chains in the pre-modularization panel/server.py.
"""

import json
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs

from backend.core import HERE, edit_store
from backend.collectors.wallpapers import (
    download_wallpaper, set_wallpaper, wall_background, wall_thumb, wallhaven_search,
)


def handle_get(handler, path, route, snapshot):
    if path == "/api/wall":
        q = parse_qs(route.query)
        wanted = (q.get("path") or [""])[0]
        try:
            target = Path(wanted).resolve()
            root = Path(snapshot.cfg["wallpaper_dir"]).resolve()
        except Exception:
            handler._send("bad path", "text/plain", 400)
            return True
        if not str(target).startswith(str(root)) or not target.is_file():
            handler._send("not allowed", "text/plain", 403)
            return True
        # Optional ?w=&h= for a bigger, crisper crop (Scene's hero,
        # hover previews) - defaults to the original 300x250 grid
        # thumbnail when omitted, so every existing caller is
        # unaffected. Clamped so this can't be abused into an
        # arbitrarily expensive resize.
        try:
            w = min(2400, max(1, int((q.get("w") or ["300"])[0])))
            h = min(2400, max(1, int((q.get("h") or ["250"])[0])))
        except ValueError:
            w, h = 300, 250
        try:
            # The URL is stable for a given local file, so let WebView retain
            # the rendered thumbnail between Scene visits. The mtime-backed
            # ETag still invalidates it when the source file changes.
            etag = f'"{target.stat().st_mtime_ns:x}-{w}x{h}"'
            if handler.headers.get("If-None-Match") == etag:
                handler.send_response(304)
                handler.send_header("ETag", etag)
                handler.send_header("Cache-Control", "private, max-age=3600")
                handler.end_headers()
                return True
            body = wall_thumb(str(target), size=(w, h))
            handler.send_response(200)
            handler.send_header("Content-Type", "image/jpeg")
            handler.send_header("Content-Length", str(len(body)))
            handler.send_header("ETag", etag)
            handler.send_header("Cache-Control", "private, max-age=3600")
            handler.end_headers()
            handler.wfile.write(body)
        except Exception as e:
            handler._send(f"thumb failed: {e}", "text/plain", 500)
        return True
    if path == "/api/bg":
        wanted = (parse_qs(route.query).get("path") or [""])[0]
        try:
            target = Path(wanted).resolve()
            root = Path(snapshot.cfg["wallpaper_dir"]).resolve()
        except Exception:
            handler._send("bad path", "text/plain", 400)
            return True
        if not str(target).startswith(str(root)) or not target.is_file():
            handler._send("not allowed", "text/plain", 403)
            return True
        try:
            body = wall_background(str(target))
        except Exception as e:
            handler._send(f"bg failed: {e}", "text/plain", 500)
            return True
        handler.send_response(200)
        handler.send_header("Content-Type", "image/jpeg")
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Cache-Control", "max-age=3600")
        handler.end_headers()
        handler.wfile.write(body)
        return True
    if path == "/api/wallhaven":
        q = parse_qs(route.query)
        try:
            result = wallhaven_search(snapshot.cfg, sorting=(q.get("sorting") or ["toplist"])[0], page=int((q.get("page") or ["1"])[0]), query=(q.get("q") or [""])[0], top_range=(q.get("range") or ["1M"])[0], purity=(q.get("purity") or ["100"])[0], categories=(q.get("categories") or ["111"])[0])
        except Exception as e: result = {"error": str(e)[:160]}
        handler._send(json.dumps(result))
        return True
    return None


def handle_post(handler, path, snapshot):
    if path == "/api/wallpaper":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        target = body.get("path")
        if body.get("url"):
            # A Wallhaven pick isn't on disk yet - downloading the
            # full-res image (several MB) inline used to block this
            # whole request until it finished, so the UI's "applying"
            # spinner sat there for however long the download took
            # on top of the actual apply - the "wallpaper takes a
            # while" complaint. Same fire-and-forget shape
            # set_wallpaper() already uses for the local-path case:
            # respond immediately, do the download+apply in the
            # background.
            url, wall_id = body["url"], body.get("id") or str(int(time.time()))
            def _download_and_apply(url=url, wall_id=wall_id):
                try:
                    path_ = download_wallpaper(snapshot.cfg, url, wall_id)
                    set_wallpaper(snapshot.cfg, path_)
                    snapshot.refresh("wallpapers")
                except Exception:
                    pass
            threading.Thread(target=_download_and_apply, daemon=True).start()
            handler._send(json.dumps({"ok": True}))
            return True
        ok = set_wallpaper(snapshot.cfg, target) if target else False
        snapshot.refresh("wallpapers")
        handler._send(json.dumps({"ok": ok, "path": target}))
        return True
    if path == "/api/wallpaper/favorite":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        wp = str(body.get("path") or "")
        on = bool(body.get("favorite", True))
        if not wp:
            handler._send(json.dumps({"ok": False, "error": "no path"}), code=400)
            return True
        def mutate(store):
            others = [f for f in store.get("wallpaper_favorites") or [] if f != wp]
            store["wallpaper_favorites"] = others + ([wp] if on else [])
        edit_store(mutate)
        snapshot.refresh("wallpapers")
        handler._send(json.dumps({"ok": True}))
        return True
    if path == "/api/wallpaper/fix-desktops":
        # wallpaper_desktops.py's own recovery action (registry flush +
        # Explorer restart) for the rare per-virtual-desktop
        # wallpaper desync - manual only, the UI requires its own
        # confirmation before ever posting here.
        script = HERE.parent / "capabilities" / "wallpaper_desktops.py"
        if not script.is_file():
            handler._send(json.dumps({"ok": False, "error": "wallpaper_desktops.py not found"}), code=404)
            return True
        subprocess.Popen([sys.executable, str(script), "--fix-desktops"],
                         creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
        handler._send(json.dumps({"ok": True}))
        return True
    return None
