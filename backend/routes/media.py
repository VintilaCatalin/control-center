"""Now-playing media control + system audio routes.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_POST dispatch chain in the pre-modularization panel/server.py.
"""

import json

from backend.collectors.media import media_control, set_audio_device, set_mute, set_volume_level


def handle_post(handler, path, snapshot):
    if path == "/api/media/control":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        result = media_control(str(body.get("action") or ""), body.get("position"))
        snapshot.refresh("media")
        handler._send(json.dumps(result))
        return True
    if path == "/api/audio/volume":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        try:
            set_volume_level(body.get("percent", 50))
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:140]}))
            return True
        snapshot.refresh("audio")
        handler._send(json.dumps({"ok": True}))
        return True
    if path == "/api/audio/mute":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        try:
            set_mute(bool(body.get("muted", True)))
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:140]}))
            return True
        snapshot.refresh("audio")
        handler._send(json.dumps({"ok": True}))
        return True
    if path == "/api/audio/device":
        length = int(handler.headers.get("Content-Length") or 0)
        try: body = json.loads(handler.rfile.read(length) or b"{}")
        except Exception: body = {}
        if body.get("index") is None:
            handler._send(json.dumps({"ok": False, "error": "no index"}), code=400)
            return True
        try:
            set_audio_device(body["index"])
        except Exception as e:
            handler._send(json.dumps({"ok": False, "error": str(e)[:140]}))
            return True
        snapshot.refresh("audio")
        handler._send(json.dumps({"ok": True}))
        return True
    return None
