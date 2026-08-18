"""qBittorrent + Sonarr/Radarr calendar.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import time
from datetime import datetime, timedelta, timezone
import requests

from backend.core import _record_metric



# ──────────────────────────────────────────────
#  HOMELAB EXTRAS
# ──────────────────────────────────────────────

_qbit = {"session": None, "base": None, "user": None, "blocked_until": 0, "why": None}

def _qbit_login(base, user, password):
    """qBittorrent bans an IP after a handful of failed logins, and the old code
    logged in fresh on EVERY poll - eight seconds apart. So one wrong password
    turned into a ban, and the ban then reported itself as 'login refused'
    forever, even after the password was corrected.

    Now the cookie is kept and reused, login only happens when there isn't a
    valid session, and a failure backs off instead of hammering."""
    session = requests.Session()
    # Both headers: qBittorrent's CSRF check rejects a mismatched Origin with a
    # bare 403 and no explanation.
    session.headers.update({"Referer": base, "Origin": base})
    if not user:
        return session, None            # auth bypassed for this subnet
    try:
        r = session.post(f"{base}/api/v2/auth/login", timeout=8,
                         data={"username": user, "password": password})
    except Exception as e:
        return None, f"can't reach the Web UI: {str(e)[:90]}"
    if r.status_code == 403:
        return None, ("qBittorrent returned 403. Either the IP is temporarily "
                      "banned after failed logins (restart qBittorrent or wait "
                      "out Options > Web UI > ban duration), or Web UI "
                      "'Enable Host header validation' is rejecting this address.")
    # Neither the status code nor the SID cookie is a reliable signal: a bare
    # 204 with no cookie is what qBittorrent sends when the requesting IP is
    # on Options > Web UI > "Bypass authentication for clients on
    # localhost/whitelisted subnets" - login is a no-op because it isn't
    # needed, and every later request will work without a cookie too. So the
    # only real proof is calling an endpoint that actually requires auth.
    try:
        check = session.get(f"{base}/api/v2/app/version", timeout=6)
    except Exception as e:
        return None, f"logged in but can't reach the Web UI: {str(e)[:90]}"
    if check.status_code == 200:
        return session, None
    body = (r.text or "").strip()
    return None, f"login returned HTTP {r.status_code}: {body[:70] or 'credentials rejected'}"

def _qbit_session(cfg):
    base = str(cfg["qbit_url"]).strip().rstrip("/")
    user = str(cfg["qbit_user"]).strip()
    password = str(cfg["qbit_pass"])
    # Settings changed? Throw the old session and the old backoff away.
    if _qbit["base"] != base or _qbit["user"] != user:
        _qbit.update(session=None, base=base, user=user, blocked_until=0, why=None)
    if _qbit["session"] is not None:
        return _qbit["session"], None
    if time.monotonic() < _qbit["blocked_until"]:
        return None, _qbit["why"]
    session, why = _qbit_login(base, user, password)
    if session is None:
        _qbit.update(blocked_until=time.monotonic() + 60, why=why)
        return None, why
    _qbit.update(session=session, blocked_until=0, why=None)
    return session, None

def collect_downloads(cfg, _shared):
    base = str(cfg["qbit_url"]).strip().rstrip("/")
    if not base: return {"configured": False, "torrents": []}

    session, why = _qbit_session(cfg)
    if session is None: return {"configured": True, "torrents": [], "error": why}

    try:
        r = session.get(f"{base}/api/v2/torrents/info", timeout=8,
                        params={"filter": "all", "sort": "priority"})
        if r.status_code in (401, 403):
            # Cookie expired. Drop it and let the next poll log in again.
            _qbit["session"] = None
            return {"configured": True, "torrents": [], "error": "session expired, reconnecting"}
        r.raise_for_status()
        rows = r.json() or []
        info = session.get(f"{base}/api/v2/transfer/info", timeout=6).json() or {}
    except Exception as e:
        _qbit["session"] = None
        return {"configured": True, "torrents": [], "error": str(e)[:140]}

    done_states = ("pausedUP", "stoppedUP", "uploading", "stalledUP", "queuedUP", "checkingUP")
    active = [t for t in rows if t.get("state") not in done_states]
    active.sort(key=lambda t: (-(t.get("dlspeed") or 0), -(t.get("progress") or 0)))
    torrents = [{
        "name": t.get("name"), "progress": round((t.get("progress") or 0) * 100, 1),
        "state": t.get("state"), "dl": t.get("dlspeed") or 0, "up": t.get("upspeed") or 0,
        "eta": t.get("eta") if (t.get("eta") or 0) < 8640000 else None,
        "size": t.get("size") or 0, "category": t.get("category") or "",
    } for t in active[:12]]
    dl, up = info.get("dl_info_speed") or 0, info.get("up_info_speed") or 0
    _record_metric("qbit_dl", dl)
    _record_metric("qbit_up", up)
    return {"configured": True, "torrents": torrents, "active": len(active), "total": len(rows),
            "dl": dl, "up": up}

def _arr_calendar(base, key, kind):
    base = str(base).strip().rstrip("/")
    if not base or not str(key).strip(): return []
    today = datetime.now().date()
    try:
        # Without includeSeries the calendar returns episodes with no series
        # object at all, which is why every row read "null - S3E8".
        r = requests.get(f"{base}/api/v3/calendar", timeout=8,
                         params={"apikey": key, "unmonitored": "false",
                                 "includeSeries": "true", "includeEpisodeFile": "true",
                                 "start": today.isoformat(),
                                 "end": (today + timedelta(days=8)).isoformat()})
        r.raise_for_status()
        rows = r.json() or []
    except Exception:
        return []
    out = []
    for item in rows[:24]:
        when = item.get("airDateUtc") or item.get("digitalRelease") or item.get("inCinemas") or item.get("physicalRelease")
        stamp = None
        if when:
            try: stamp = datetime.fromisoformat(str(when).replace("Z", "+00:00")).timestamp()
            except Exception: pass
        # Radarr/Sonarr ship a poster with every calendar row via a remoteUrl
        # (a plain image host, not the Arr server) - the browser can load that
        # directly without an API key, unlike the /MediaCover path.
        images = item.get("series", {}).get("images") if kind == "tv" else item.get("images")
        poster = next((i.get("remoteUrl") for i in (images or []) if i.get("coverType") == "poster" and i.get("remoteUrl")), None)
        if kind == "tv":
            # Belt and braces: series object, then the flat seriesTitle some
            # versions send, then the series id, before ever showing "null".
            series = item.get("series") or {}
            show = (series.get("title") or item.get("seriesTitle")
                    or (f"Series {item.get('seriesId')}" if item.get("seriesId") else "Unknown series"))
            season, episode = item.get("seasonNumber"), item.get("episodeNumber")
            code = f"S{season}E{episode}" if season is not None and episode is not None else ""
            name = item.get("title") or ""
            title, sub = show, " · ".join(bit for bit in (code, name) if bit)
        else:
            title = item.get("title") or "Unknown film"
            sub = str(item.get("year") or "")
        out.append({"kind": kind, "title": title, "sub": sub, "when": stamp, "poster": poster,
                    "has_file": bool(item.get("hasFile") or item.get("hasFile") is None and item.get("movieFile"))})
    out.sort(key=lambda i: i["when"] or 0)
    return out
