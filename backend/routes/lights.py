"""Home Assistant lights: brightness/saturation live-adjust + mode routes.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_POST dispatch chain in the pre-modularization panel/server.py.
"""

import json
import re
import subprocess
import sys

from backend.core import HERE
from backend.collectors.lights import set_brightness, set_saturation


def handle_post(handler, path, snapshot):
    if path == "/api/brightness":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        handler._send(json.dumps({"ok": set_brightness(snapshot.cfg, body.get("percent", 100), body.get("mode"))}))
        return True
    if path == "/api/saturation":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        handler._send(json.dumps({"ok": set_saturation(snapshot.cfg, body.get("percent", 100), body.get("mode"))}))
        return True
    if path == "/api/lights":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        script = HERE.parent / "capabilities" / "ha_lights.py"
        if not script.is_file():
            handler._send(json.dumps({"ok": False, "error": "ha_lights.py not found"}), code=404)
            return True
        colour = str(body.get("color") or "").lstrip("#")
        if colour:
            if not re.fullmatch(r"[0-9a-fA-F]{6}", colour):
                handler._send(json.dumps({"ok": False, "error": "not a hex colour"}), code=400)
                return True
            args = ["--color", colour]
        else:
            mode = str(body.get("mode", ""))
            allowed = {"colorful", "white", "bias", "off", "video", "game"}
            if mode not in allowed:
                handler._send(json.dumps({"ok": False}), code=400)
                return True
            args = [f"--{mode}"]
        subprocess.Popen([sys.executable, str(script), *args],
                         creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0))
        handler._send(json.dumps({"ok": True}))
        return True
    return None
