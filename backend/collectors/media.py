"""Now-playing media + system audio collectors.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import asyncio
import base64
import json
import subprocess


_art_cache = {"key": None, "data": None}
def _media_imports():
    try:
        from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager
        from winrt.windows.storage.streams import DataReader
        return MediaManager, DataReader
    except ImportError:
        from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager
        from winsdk.windows.storage.streams import DataReader
        return MediaManager, DataReader

async def _media_candidates(manager):
    candidates = []
    try:
        sessions = manager.get_sessions()
        size = getattr(sessions, "size", None)
        if size is None: size = len(sessions)
        for i in range(int(size)): candidates.append(sessions.get_at(i))
    except Exception:
        try: candidates = list(manager.get_sessions())
        except Exception: candidates = []
    current = manager.get_current_session()
    if current is not None and current not in candidates: candidates.append(current)
    return candidates

async def _media_best(candidates):
    """The same picking logic backs both the display and the transport
    controls, so play/pause/skip always act on whatever the panel is
    actually showing you - not whatever Windows separately calls 'current',
    which can be a different app than the one with a title on screen."""
    best, best_score, best_props = None, -1, None
    for candidate in candidates:
        try: props = await candidate.try_get_media_properties_async()
        except Exception: continue
        if props is None or not (props.title or "").strip(): continue
        status = 0
        try: status = int(getattr(candidate.get_playback_info(), "playback_status", 0) or 0)
        except Exception: pass
        score = 2 if status == 4 else 1
        if score > best_score: best, best_score, best_props = candidate, score, props
    return best, best_score, best_props

async def _media_snapshot():
    MediaManager, DataReader = _media_imports()
    manager = await MediaManager.request_async()
    candidates = await _media_candidates(manager)
    if not candidates: return {"title": None, "sessions": 0}

    best, best_score, best_props = await _media_best(candidates)
    if best is None:
        return {"title": None, "sessions": len(candidates), "apps": [str(c.source_app_user_model_id or "?") for c in candidates]}

    session, props = best, best_props
    timeline = session.get_timeline_properties()
    out = {"title": props.title or "", "artist": props.artist or "", "album": props.album_title or "",
           "app": session.source_app_user_model_id or "", "playing": best_score == 2, "sessions": len(candidates),
           "position": 0, "duration": 0, "art": None}
    try:
        pos = timeline.position.total_seconds()
        end = timeline.end_time.total_seconds()
        if end > 0: out["position"], out["duration"] = int(pos), int(end)
    except Exception: pass

    key = f"{out['artist']}|{out['album']}|{out['title']}"
    if _art_cache["key"] == key:
        out["art"] = _art_cache["data"]
    elif props.thumbnail:
        try:
            stream = await props.thumbnail.open_read_async()
            reader = DataReader(stream)
            await reader.load_async(stream.size)
            raw = bytes(reader.read_buffer(stream.size)) if hasattr(reader, "read_buffer") else bytes(reader.read_bytes(stream.size))
            encoded = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
            _art_cache.update(key=key, data=encoded)
            out["art"] = encoded
        except Exception: _art_cache.update(key=key, data=None)
    return out

def collect_media(_cfg, _shared):
    try: return asyncio.run(_media_snapshot()) or {"title": None}
    except Exception as e: return {"title": None, "error": str(e)[:120]}

async def _media_control(action, position=None):
    MediaManager, _ = _media_imports()
    manager = await MediaManager.request_async()
    candidates = await _media_candidates(manager)
    if not candidates: return {"ok": False, "error": "nothing is playing"}
    session, _score, _props = await _media_best(candidates)
    if session is None: return {"ok": False, "error": "nothing is playing"}

    if action == "toggle": await session.try_toggle_play_pause_async()
    elif action == "play": await session.try_play_async()
    elif action == "pause": await session.try_pause_async()
    elif action == "next": await session.try_skip_next_async()
    elif action == "prev": await session.try_skip_previous_async()
    elif action == "seek":
        # WinRT TimeSpan is 100ns ticks; the panel sends whole seconds.
        await session.try_change_playback_position_async(int((position or 0) * 10_000_000))
    else:
        return {"ok": False, "error": "unknown action"}
    return {"ok": True}

def media_control(action, position=None):
    try: return asyncio.run(_media_control(action, position))
    except Exception as e: return {"ok": False, "error": str(e)[:140]}


# ──────────────────────────────────────────────
#  AUDIO - system volume and output device
# ──────────────────────────────────────────────

def _audio_endpoint():
    from pycaw.pycaw import AudioUtilities
    return AudioUtilities.GetSpeakers().EndpointVolume

def collect_audio(_cfg, _shared):
    try:
        ev = _audio_endpoint()
        volume = round(ev.GetMasterVolumeLevelScalar() * 100)
        muted = bool(ev.GetMute())
    except Exception as e:
        return {"error": str(e)[:140], "devices": []}

    devices = []
    try:
        # AudioDeviceCmdlets, not raw COM - switching the *default* endpoint
        # goes through an undocumented interface (IPolicyConfig) with a
        # vtable that varies by Windows build, which is a bad thing to get
        # wrong blind. This PowerShell module already does it correctly.
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' } | "
             "Select-Object Index,Name,Default | ConvertTo-Json -Compress"],
            capture_output=True, text=True, timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        raw = json.loads(out.stdout or "[]")
        if isinstance(raw, dict): raw = [raw]
        devices = [{"index": d.get("Index"), "name": d.get("Name"), "default": bool(d.get("Default"))}
                   for d in raw if d.get("Index") is not None]
    except Exception:
        pass
    return {"volume": volume, "muted": muted, "devices": devices}

def set_volume_level(percent):
    ev = _audio_endpoint()
    ev.SetMasterVolumeLevelScalar(max(0, min(100, int(percent))) / 100, None)

def set_mute(muted):
    ev = _audio_endpoint()
    ev.SetMute(1 if muted else 0, None)

def set_audio_device(index):
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command",
         f"Set-AudioDevice -Index {int(index)}"],
        capture_output=True, text=True, timeout=8,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
