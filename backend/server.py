#!/usr/bin/env python
"""
server.py - the data backend for Control Center.

This is the thin entry point: it builds the COLLECTORS registry out of the
backend.collectors.* modules, wires up the Handler class (which mostly
delegates to backend.routes.*), the Snapshot poller, and main(). The actual
collector logic lives in backend/collectors/*.py, the actual per-route logic
lives in backend/routes/*.py, and the infrastructure both depend on (config
loading, the settings-store, small shared helpers) lives in backend/core.py.
"""

import argparse
import json
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# backend/server.py is launched directly (`python backend/server.py`,
# cwd=backend/ - see control_center.py's SERVER/Popen), not as
# `python -m backend.server` from the repo root, so the repo root (the
# parent of this package) needs to be on sys.path before the `backend.*`
# imports below will resolve.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core import CONFIG_FILE, CONFIG_ORIGIN, HERE, REACT_DIST, SECRET_KEYS, STORE_FILE, load_config, load_token

from backend.collectors.accent import collect_accent
from backend.collectors.calendar import collect_calendar
from backend.collectors.downloads import collect_downloads
from backend.collectors.files import collect_files
from backend.collectors.games import collect_apps, collect_games, collect_ui
from backend.collectors.hardware import collect_hardware
from backend.collectors.homelab import collect_homelab
from backend.collectors.lights import collect_lights
from backend.collectors.media import collect_audio, collect_media
from backend.collectors.media_extras import collect_photo, collect_popular, collect_upcoming
from backend.collectors.notes import collect_notes
from backend.collectors.plex import collect_plex
from backend.collectors.reading import collect_feeds, collect_reading
from backend.collectors.tasks import collect_tasks
from backend.collectors.wallpapers import collect_wallpapers
from backend.collectors.weather import collect_weather

from backend.routes import (
    core as routes_core,
    files as routes_files,
    games as routes_games,
    lights as routes_lights,
    media as routes_media,
    media_extras as routes_media_extras,
    notes as routes_notes,
    plex as routes_plex,
    reading as routes_reading,
    settings as routes_settings,
    tasks as routes_tasks,
    wallpapers as routes_wallpapers,
)

INTERVALS = {
    "media": 2, "hardware": 4, "lights": 10, "plex": 30,
    "weather": 900, "games": 600, "wallpapers": 60, "feeds": 900,
    "homelab": 15, "downloads": 8, "upcoming": 900, "notes": 20, "ui": 5, "tasks": 10,
    "photo": 20, "popular": 1800, "audio": 15, "calendar": 900,
    "files": 20, "reading": 900,
}

COLLECTORS = {
    "accent": collect_accent, "weather": collect_weather, "media": collect_media,
    "hardware": collect_hardware, "lights": collect_lights, "plex": collect_plex,
    "games": collect_games, "wallpapers": collect_wallpapers, "feeds": collect_feeds,
    "homelab": collect_homelab, "downloads": collect_downloads,
    "upcoming": collect_upcoming, "notes": collect_notes, "tasks": collect_tasks, "apps": collect_apps,
    "photo": collect_photo, "popular": collect_popular,
    "ui": collect_ui, "audio": collect_audio,
    "calendar": collect_calendar, "files": collect_files, "reading": collect_reading,
}

class Snapshot:
    def __init__(self, cfg):
        self.cfg = cfg
        self.lock = threading.Lock()
        self.data = {key: {} for key in COLLECTORS}
        self.data["accent"] = {"hex": None}
        self.stamps = {key: 0.0 for key in COLLECTORS}
        self.versions = {key: 0 for key in COLLECTORS}
        self.epoch = str(time.time_ns())
        self.error_version = 0
        self.errors = {}
    def reload(self):
        """Re-read settings and re-run every collector. Called after a settings
        save, so changing the Plex token fixes the Plex tab in one poll rather
        than after you restart the panel."""
        self.cfg = load_config()
        for key in COLLECTORS:
            threading.Thread(target=self.refresh, args=(key,), daemon=True).start()

    def refresh(self, key):
        try:
            value = COLLECTORS[key](self.cfg, self.data)
            with self.lock:
                if self.data.get(key) != value:
                    self.data[key] = value
                    self.versions[key] += 1
                self.stamps[key] = time.time()
                if key in self.errors:
                    self.errors.pop(key, None)
                    self.error_version += 1
        except Exception as e:
            message = str(e)[:200]
            with self.lock:
                if self.errors.get(key) != message:
                    self.errors[key] = message
                    self.error_version += 1
    def loop(self):
        # First pass in parallel. Sequentially, one feed on a 12s timeout held up
        # every collector queued behind it, so the nav and the launchpad showed
        # up half a minute after the window opened.
        first = [threading.Thread(target=self.refresh, args=(key,), daemon=True)
                 for key in COLLECTORS]
        for t in first: t.start()
        for t in first: t.join(timeout=20)
        next_run = {key: time.time() + INTERVALS.get(key, 30) for key in COLLECTORS}
        next_run["accent"] = 0
        while True:
            now = time.time()
            for key in COLLECTORS:
                interval = INTERVALS.get(key, 30) if key != "accent" else 2
                if now >= next_run.get(key, 0):
                    self.refresh(key)
                    next_run[key] = now + interval
            time.sleep(0.5)
    def payload(self, since=None, epoch=None):
        """Return a full snapshot, or the sections changed since a cursor.

        The no-cursor response remains the legacy/full API. React sends its
        last cursor after its initial load, so frequent hardware/media polls
        no longer resend large unchanged collections such as Reading.
        """
        with self.lock:
            versions = {**self.versions, "_errors": self.error_version}
            delta = bool(since) and epoch == self.epoch
            changed = [key for key in COLLECTORS if not delta or self.versions[key] > since.get(key, -1)]
            if not delta or self.error_version > since.get("_errors", -1): changed.append("errors")
            payload = {"ts": time.time(), "iso": datetime.now(timezone.utc).astimezone().isoformat(),
                       "epoch": self.epoch, "versions": versions, "changed": changed}
            payload.update({key: self.data[key] for key in changed if key in COLLECTORS})
            if "errors" in changed: payload["errors"] = dict(self.errors)
            return payload

def make_handler(snapshot):
    # Every domain's GET routes are tried in turn (falling through to the
    # next module, then to static-file serving in routes_core) - same
    # sequential-if-chain behaviour do_GET always had, just spread across
    # modules instead of one 220-line method.
    GET_MODULES = [
        routes_games, routes_settings, routes_reading, routes_notes, routes_plex,
        routes_media_extras, routes_wallpapers, routes_files,
        routes_core,  # static fallback MUST be tried last
    ]

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *_args): pass
        def _send(self, body, content_type="application/json", code=200):
            if isinstance(body, str): body = body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            route = urlparse(self.path)
            path = route.path
            for module in GET_MODULES:
                if module.handle_get(self, path, route, snapshot) is not None:
                    return
            return self._send("not found", "text/plain", 404)

        def _body(self):
            length = int(self.headers.get("Content-Length") or 0)
            try: return json.loads(self.rfile.read(length) or b"{}")
            except Exception: return {}

        def do_POST(self):
            route = urlparse(self.path)
            if route.path.startswith("/api/note"):
                body = self._body()
                try:
                    result = routes_notes.dispatch_post(snapshot.cfg, route.path, body)
                    if result is None: return self._send("not found", "text/plain", 404)
                except Exception as e:
                    return self._send(json.dumps({"ok": False, "error": str(e)[:140]}), code=400)
                snapshot.refresh("notes")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/tasks"):
                body = self._body()
                result = routes_tasks.dispatch_post(route.path, body)
                if result is None: return self._send("not found", "text/plain", 404)
                snapshot.refresh("tasks")
                return self._send(json.dumps(result))
            if (route.path.startswith("/api/reading/source/") or route.path.startswith("/api/reading/bookmark/")
                    or route.path.startswith("/api/reading/topics/")
                    or route.path == "/api/reading/import-subscriptions"):
                body = self._body()
                result = routes_reading.dispatch_source(route.path, body)
                if result is None: return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/reading/"):
                body = self._body()
                item_id = str(body.get("id") or "")
                if not item_id:
                    return self._send(json.dumps({"ok": False, "error": "no id"}), code=400)
                result = routes_reading.dispatch_item(route.path, item_id, body)
                if result is None: return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if route.path.startswith("/api/books/"):
                body = self._body()
                result = routes_reading.dispatch_books(route.path, body)
                if result is None: return self._send("not found", "text/plain", 404)
                snapshot.refresh("reading")
                return self._send(json.dumps(result))
            if (route.path.startswith("/api/games/") or route.path.startswith("/api/apps/")
                    or route.path.startswith("/api/settings/") or route.path.startswith("/api/pages")
                    or route.path.startswith("/api/shelves") or route.path.startswith("/api/layout")
                    or route.path == "/api/views"):
                body = self._body()
                result = routes_games.dispatch_post(route.path, body)
                if result is None:
                    result = routes_settings.dispatch_post(route.path, body, snapshot)
                if result is None: return self._send("not found", "text/plain", 404)
                if route.path.startswith("/api/apps/"): snapshot.refresh("apps")
                elif (route.path == "/api/views" or route.path.startswith("/api/pages")
                        or route.path.startswith("/api/layout")): snapshot.refresh("ui")
                elif route.path.startswith("/api/games/") or route.path.startswith("/api/shelves"):
                    snapshot.refresh("games")
                return self._send(json.dumps(result))
            if route.path == "/api/launch":
                body = self._body()
                return self._send(json.dumps(routes_games.handle_post_launch(self, body)))
            if routes_core.handle_post(self, route.path, snapshot) is not None: return
            if routes_files.handle_post(self, route.path, snapshot) is not None: return
            if routes_wallpapers.handle_post(self, route.path, snapshot) is not None: return
            if routes_lights.handle_post(self, route.path, snapshot) is not None: return
            if routes_media_extras.handle_post(self, route.path, snapshot) is not None: return
            if routes_media.handle_post(self, route.path, snapshot) is not None: return
            return self._send("not found", "text/plain", 404)
    return Handler

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--diag", action="store_true")
    ap.add_argument("--probe", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    snapshot = Snapshot(cfg)
    if args.diag:
        # --diag was accepted and then ignored, so it fell through and started a
        # SECOND server on the same port. Now it reports and exits.
        for key in COLLECTORS: snapshot.refresh(key)
        payload = snapshot.payload()
        errors = payload.get("errors") or {}
        print(f"config     : {CONFIG_FILE} {'(found)' if CONFIG_FILE.exists() else '(absent - fine)'}")
        if CONFIG_ORIGIN.get("_file_problem"):
            print(f"             ! {CONFIG_ORIGIN['_file_problem']}")
        print(f"store      : {STORE_FILE} {'(found)' if STORE_FILE.exists() else '(not yet written)'}")
        interesting = ["plex_token", "griddb_key", "feeds", "notes_dir", "services",
                       "qbit_url", "sonarr_key", "wallpaper_dir", "art_overrides"]
        print("settings   : where each value is coming from")
        for key in interesting:
            origin = CONFIG_ORIGIN.get(key, "default")
            value = str(cfg.get(key, "")).replace("\n", " / ")
            if key in SECRET_KEYS: value = ("set (" + str(len(value)) + " chars)") if value.strip() else "EMPTY"
            flag = "  <- still the built-in default" if origin == "default" else ""
            print(f"             {key:15} [{origin}] {value[:60]}{flag}")
        print(f"token      : {'set' if load_token() else 'MISSING - HA lights will be empty'}")
        for key in COLLECTORS:
            data = payload.get(key) or {}
            if key in errors: note = "ERROR " + errors[key]
            elif key == "games": note = f"{data.get('total', 0)} games, {len(data.get('shelves') or [])} shelves, sources={data.get('by_source')}"
            elif key == "media": note = data.get("title") or data.get("error") or "nothing playing"
            elif key == "hardware": note = f"cpu={data.get('cpu_temp')}C load={data.get('cpu_load')}% gpu={data.get('gpu_temp')}C lhm={data.get('lhm')}"
            elif key == "lights": note = f"{len(data.get('lights') or [])} entities {data.get('error') or ''}".strip()
            elif key == "plex": note = f"configured={data.get('configured')} sections={len(data.get('sections') or [])} {data.get('error') or ''}".strip()
            elif key == "wallpapers": note = f"{data.get('total', 0)} in {data.get('dir')} {data.get('error') or ''}".strip()
            elif key == "feeds": note = ", ".join(f"{f['label']}={len(f.get('items') or [])}{' ERR' if f.get('error') else ''}" for f in (data.get("feeds") or [])) or "none configured"
            elif key == "homelab": note = f"ssh={data.get('ssh_online')} {data.get('up')}/{data.get('count')} up · " + ", ".join(f"{s['name']}{'' if s['online'] else ' DOWN'}" for s in (data.get("services") or []))
            elif key == "downloads": note = (f"{data.get('active')} active of {data.get('total')}, {round((data.get('dl') or 0)/1048576, 1)} MB/s" if data.get("configured") else "no qbit_url in config.ini") + (" · " + data["error"] if data.get("error") else "")
            elif key == "upcoming": note = (f"{len(data.get('items') or [])} in the next week" if data.get("configured") else "no sonarr_url/radarr_url in config.ini")
            elif key == "notes": note = f"{data.get('total', 0)} notes in {data.get('dir')} {data.get('error') or ''}".strip()
            elif key == "apps": note = f"{len(data.get('apps') or [])} launchpad items"
            elif key == "ui": note = ", ".join(v["label"] + ("" if v.get("visible", True) else " (hidden)") for v in (data.get("views") or []))
            else: note = json.dumps(data, default=str)[:110]
            print(f"{key:11}: {note}")
        return

    if args.probe:
        for key in COLLECTORS: snapshot.refresh(key)
        payload = snapshot.payload()
        media = payload.get("media") or {}
        if media.get("art"): media["art"] = f"<{len(media['art'])} bytes of base64>"
        print(json.dumps(payload, indent=2, default=str))
        return
    threading.Thread(target=snapshot.loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(snapshot))
    print(f"panel serving on http://127.0.0.1:{args.port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == "__main__":
    main()
