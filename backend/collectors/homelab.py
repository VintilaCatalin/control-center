"""Homelab dashboard: service probes, Netdata, Portainer.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import re
import socket
import threading
import time
from urllib.parse import urlparse, parse_qs, urljoin
import requests

from backend.core import _metric_series, _record_metric


GROUP_ORDER = ["home", "media", "network", "infra", "other"]

def _service_lines(cfg):
    # No hardcoded fallback list here on purpose - an unconfigured
    # Homelab must mean an empty services grid, not someone else's real
    # self-hosted infrastructure. Add your own under Settings → Homelab →
    # Services ("Label | url | port | group" per line).
    raw = str(cfg.get("services") or "").strip()
    if not raw: return []
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or "|" not in line: continue
        parts = [p.strip() for p in line.split("|")]
        name, url = parts[0], parts[1] if len(parts) > 1 else ""
        try: port = int(parts[2]) if len(parts) > 2 and parts[2] else None
        except ValueError: port = None
        group = (parts[3].lower() if len(parts) > 3 and parts[3] else "other")
        if name and port: out.append({"name": name, "url": url, "port": port, "group": group})
    return out

def _probe(host, port, timeout=1.2):
    """Latency as well as up/down - a service that answers in 900ms is a
    different kind of fine than one that answers in 4."""
    began = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, round((time.monotonic() - began) * 1000)
    except Exception:
        return False, None


# ──────────────────────────────────────────────
#  NETDATA - live + historical metrics for the actual homelab server.
#  collect_hardware (psutil/pynvml) reports THIS machine's stats, not
#  the server's - Netdata is the only thing in this file that ever
#  talks to the server's own resource usage. A pure read-only REST
#  client against Netdata's own chart retention, so no ring buffer of
#  our own is needed for these values. Every metric block is its own
#  try/except - Netdata's exact chart ids/dimensions vary by version and
#  by what's actually monitored on that box, so one missing chart (no
#  temperature sensor wired up, say) degrades to "no data for that
#  metric" rather than losing CPU/RAM/disk/network too.
# ──────────────────────────────────────────────

_netdata_charts_cache = {"at": 0.0, "charts": None}

def _netdata_get(cfg, path, **params):
    base = str(cfg.get("netdata_url") or "").strip().rstrip("/")
    if not base: return None
    r = requests.get(f"{base}{path}", params=params, timeout=3)
    r.raise_for_status()
    return r.json()

def _netdata_charts(cfg):
    """Which chart ids exist (disk mount, temperature sensor, ...) is
    environment-specific - discovered once and cached for 5 minutes
    rather than re-listing on every 15s poll."""
    cache = _netdata_charts_cache
    if cache["charts"] is not None and time.monotonic() - cache["at"] < 300:
        return cache["charts"]
    try:
        data = _netdata_get(cfg, "/api/v1/charts") or {}
        charts = data.get("charts") or {}
    except Exception:
        charts = cache["charts"] or {}
    cache.update(at=time.monotonic(), charts=charts)
    return charts

def _netdata_series(cfg, chart, after=-1800, points=90):
    """One chart's recent history as [{"t", "v": {dimension: value}}],
    oldest first, or None if the chart doesn't exist / isn't reachable."""
    if not chart: return None
    try:
        data = _netdata_get(cfg, "/api/v1/data", chart=chart, after=after, points=points,
                            format="json", group="average")
        labels = (data or {}).get("labels") or []
        rows = (data or {}).get("data") or []
    except Exception:
        return None
    if not labels or not rows: return None
    out = []
    # Netdata's /api/v1/data returns rows newest-first - reversed here so
    # every consumer of this function actually gets what the docstring
    # above promises (oldest first / chronological), instead of each
    # chart having to know to undo Netdata's own ordering itself.
    for row in reversed(rows):
        if not row: continue
        point = dict(zip(labels, row))
        ts = point.pop(labels[0], None)
        if ts is None: continue
        out.append({"t": ts, "v": point})
    return out or None

def collect_netdata_metrics(cfg):
    if not str(cfg.get("netdata_url") or "").strip():
        return {"configured": False}
    out = {"configured": True}
    charts = _netdata_charts(cfg)

    try:
        cpu = _netdata_series(cfg, "system.cpu")
        if cpu:
            def used_pct(point): return round(sum(v for k, v in point.items() if k != "idle" and v is not None), 1)
            out["cpu"] = {"pct": used_pct(cpu[-1]["v"]),
                          "history": [{"t": p["t"], "v": used_pct(p["v"])} for p in cpu]}
    except Exception: pass

    try:
        ram = _netdata_series(cfg, "system.ram")
        if ram:
            def ram_pct(point):
                total = sum(v for v in point.values() if v is not None)
                used = point.get("used")
                return round(used / total * 100, 1) if total and used is not None else None
            latest = ram[-1]["v"]
            total_mb = sum(v for v in latest.values() if v is not None)
            out["ram"] = {"pct": ram_pct(latest),
                          "used_gb": round((latest.get("used") or 0) / 1024, 1),
                          "total_gb": round(total_mb / 1024, 1) if total_mb else None,
                          "history": [{"t": p["t"], "v": ram_pct(p["v"])} for p in ram if ram_pct(p["v"]) is not None]}
    except Exception: pass

    # Every real mounted filesystem Netdata tracks, not just one "shortest
    # match" guess - a box with a separate data volume (the common
    # homelab shape: a small OS disk plus a big media/storage disk) gets
    # a real per-mount reading for each, not just whichever mount Netdata
    # happened to chart first. tmpfs-ish /run and anything under 4GB
    # total (stray /boot partitions etc.) are filtered out as noise, not
    # because they're being hidden - they're just not "a drive" in any
    # sense a person cares about here.
    try:
        disks = []
        for cid in charts:
            if not cid.startswith("disk_space."): continue
            mount = cid[len("disk_space."):]
            if mount == "/run": continue
            series = _netdata_series(cfg, cid, points=60)
            if not series: continue
            def disk_pct(point):
                used, avail = point.get("used"), point.get("avail")
                total = (used or 0) + (avail or 0)
                return round(used / total * 100, 1) if total and used is not None else None
            latest = series[-1]["v"]
            total_gb = (latest.get("used") or 0) + (latest.get("avail") or 0)
            if total_gb < 4: continue
            disks.append({
                "mount": mount, "pct": disk_pct(latest),
                "used_gb": round(latest.get("used") or 0, 1), "total_gb": round(total_gb, 1),
                "history": [{"t": p["t"], "v": disk_pct(p["v"])} for p in series if disk_pct(p["v"]) is not None],
            })
        disks.sort(key=lambda d: -d["total_gb"])
        out["disks"] = disks[:4]
    except Exception: pass

    # Real per-device read/write throughput (KiB/s) - the genuinely live
    # "drive activity" number a capacity bar can never show. A device
    # that saw zero I/O across the whole window (an unused/empty disk)
    # doesn't get a slot - not a fabricated flat line.
    try:
        disk_io = []
        for cid in charts:
            if not cid.startswith("disk."): continue
            device = cid[len("disk."):]
            # device-mapper/LVM volumes (dm-N) double-count the same I/O
            # their underlying physical device already reports - real
            # activity, just not a second real drive.
            if device.startswith("dm-"): continue
            series = _netdata_series(cfg, cid, points=60)
            if not series: continue
            latest = series[-1]["v"]
            read_kibs = round(abs(latest.get("reads") or 0), 1)
            write_kibs = round(abs(latest.get("writes") or 0), 1)
            history = [{"t": p["t"], "read": round(abs(p["v"].get("reads") or 0), 1),
                        "write": round(abs(p["v"].get("writes") or 0), 1)} for p in series]
            if not any(h["read"] or h["write"] for h in history): continue
            disk_io.append({"device": device, "read_kibs": read_kibs, "write_kibs": write_kibs, "history": history})
        disk_io.sort(key=lambda d: -(d["read_kibs"] + d["write_kibs"]))
        out["disk_io"] = disk_io[:3]
    except Exception: pass

    try:
        net = _netdata_series(cfg, "system.net")
        if net:
            latest = net[-1]["v"]
            out["net"] = {"in_kbps": round(abs(latest.get("received") or 0), 1),
                          "out_kbps": round(abs(latest.get("sent") or 0), 1),
                          "history": [{"t": p["t"], "in": round(abs(p["v"].get("received") or 0), 1),
                                       "out": round(abs(p["v"].get("sent") or 0), 1)} for p in net]}
    except Exception: pass

    try:
        # "shortest match containing temperature" used to land on
        # sensors.temperature_histogram (a bucket histogram, not a reading -
        # every value came back 0). Real per-sensor charts all end in
        # _input (as opposed to _alarm, a 0/1 threshold state); among
        # those, prefer the CPU package sensor since that's the one
        # reading someone actually means by "the machine's temperature".
        temp_candidates = [cid for cid in charts if "temperature" in cid.lower() and cid.lower().endswith("_input")]
        def _temp_rank(cid):
            low = cid.lower()
            if "coretemp" in low and "package" in low: return (0, len(cid))
            if "coretemp" in low: return (1, len(cid))
            return (2, len(cid))
        temp_candidates.sort(key=_temp_rank)
        temp_chart = temp_candidates[0] if temp_candidates else None
        temp = _netdata_series(cfg, temp_chart, points=60) if temp_chart else None
        if temp:
            def first_val(point):
                vals = [v for v in point.values() if v is not None]
                return round(vals[0], 1) if vals else None
            out["temp"] = {"c": first_val(temp[-1]["v"]),
                           "history": [{"t": p["t"], "v": first_val(p["v"])} for p in temp if first_val(p["v"]) is not None]}
    except Exception: pass

    return out


# ──────────────────────────────────────────────
#  PORTAINER - real Docker container state, additive to (not a
#  replacement for) the TCP-probe service grid below. Uses a static
#  Portainer access token (Portainer > My account > Access tokens), not
#  the username/password JWT flow - simpler and it's exactly what a
#  read-only dashboard integration should hold.
# ──────────────────────────────────────────────

_portainer_endpoint_cache = {"at": 0.0, "id": None, "base": None, "token": None}

def _portainer_get(cfg, path, **params):
    base = str(cfg.get("portainer_url") or "").strip().rstrip("/")
    token = str(cfg.get("portainer_token") or "").strip()
    if not base or not token: return None
    r = requests.get(f"{base}{path}", headers={"X-API-Key": token}, params=params, timeout=4)
    r.raise_for_status()
    return r.json()

def _portainer_endpoint_id(cfg):
    configured = str(cfg.get("portainer_endpoint_id") or "").strip()
    if configured: return configured
    base = str(cfg.get("portainer_url") or "").strip()
    token = str(cfg.get("portainer_token") or "").strip()
    cache = _portainer_endpoint_cache
    if cache["id"] and cache["base"] == base and cache["token"] == token and time.monotonic() - cache["at"] < 300:
        return cache["id"]
    try:
        endpoints = _portainer_get(cfg, "/api/endpoints") or []
        eid = endpoints[0]["Id"] if endpoints else None
    except Exception:
        eid = None
    cache.update(at=time.monotonic(), id=eid, base=base, token=token)
    return eid

def collect_docker_containers(cfg):
    base = str(cfg.get("portainer_url") or "").strip()
    token = str(cfg.get("portainer_token") or "").strip()
    if not base or not token:
        return {"configured": False, "containers": [], "running": 0, "total": 0}
    try:
        eid = _portainer_endpoint_id(cfg)
        if not eid:
            return {"configured": True, "error": "Portainer has no Docker environment to read",
                    "containers": [], "running": 0, "total": 0}
        rows = _portainer_get(cfg, f"/api/endpoints/{eid}/docker/containers/json", all="true") or []
        containers = []
        for c in rows:
            state = c.get("State") or "unknown"
            containers.append({
                "id": (c.get("Id") or "")[:12],
                "name": (c.get("Names") or ["?"])[0].lstrip("/"),
                "image": c.get("Image"), "state": state, "status": c.get("Status"),
            })
        containers.sort(key=lambda c: (c["state"] != "running", c["name"].lower()))
        running = sum(1 for c in containers if c["state"] == "running")
        return {"configured": True, "error": None, "containers": containers,
                "running": running, "total": len(containers)}
    except Exception as e:
        return {"configured": True, "error": str(e)[:160], "containers": [], "running": 0, "total": 0}


_NAME_NOISE_RE = re.compile(r"[\s\-_]+")

def _name_key(s):
    return _NAME_NOISE_RE.sub("", s or "").lower()

def collect_homelab(cfg, _shared):
    # A real, user-configured setting now, not a hardcoded IP - see
    # SETTINGS_SCHEMA's "Homelab" group. Genuinely optional: no server
    # configured just means no SSH-online pulse, and each service in the
    # list below is probed at its own URL's host instead of a shared box.
    server_ip = str(cfg.get("homelab_server_ip") or "").strip()
    ssh_online, ssh_ms = _probe(server_ip, 22, 1.5) if server_ip else (False, None)

    services = _service_lines(cfg)
    results = [None] * len(services)
    def check(i, svc):
        host = urlparse(svc["url"]).hostname if svc["url"].startswith("http") else None
        probe_host = server_ip or host
        online, ms = _probe(probe_host, svc["port"]) if probe_host else (False, None)
        results[i] = {**svc, "online": online, "ms": ms, "host": host or server_ip or ""}

    # Netdata and Portainer each make several outbound HTTP calls of their
    # own - run them as siblings of the service probes, not after them, and
    # cap the whole batch at one join timeout. collect_homelab runs
    # synchronously inside Snapshot.loop()'s single scheduling thread (see
    # Snapshot.loop), so if this function ran calls serially, a slow/down
    # Netdata or Portainer would stall every OTHER collector's cadence too,
    # not just this one's.
    netdata_box = {"value": {"configured": False}}
    def fetch_netdata(): netdata_box["value"] = collect_netdata_metrics(cfg)

    docker_box = {"value": {"configured": False, "containers": [], "running": 0, "total": 0}}
    def fetch_docker(): docker_box["value"] = collect_docker_containers(cfg)

    threads = [threading.Thread(target=check, args=(i, svc), daemon=True) for i, svc in enumerate(services)]
    threads.append(threading.Thread(target=fetch_netdata, daemon=True))
    threads.append(threading.Thread(target=fetch_docker, daemon=True))
    for t in threads: t.start()
    for t in threads: t.join(timeout=5)

    found = [r for r in results if r]

    # A service whose name matches a container's name gets that
    # container's live state attached - purely additive enrichment, the
    # TCP probe's "online" stays the source of truth for the status dot
    # either way (a container can be "running" while the app inside it
    # is still starting up and not yet answering its port).
    containers = docker_box["value"].get("containers") or []
    container_keys = [(c, _name_key(c["name"])) for c in containers]
    for svc in found:
        needle = _name_key(svc["name"])
        match = next((c for c, key in container_keys if needle and key and (needle in key or key in needle)), None)
        if match:
            svc["container"] = {"name": match["name"], "state": match["state"], "status": match["status"]}

    groups = []
    for name in GROUP_ORDER:
        members = [r for r in found if r["group"] == name]
        if members:
            groups.append({"group": name, "services": members,
                           "up": sum(1 for m in members if m["online"]), "count": len(members)})

    up, count = sum(1 for r in found if r["online"]), len(found)
    latencies = [r["ms"] for r in found if r["online"] and r["ms"] is not None]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    _record_metric("hl_up_count", up)
    _record_metric("hl_latency_ms", avg_latency)

    return {"server_ip": server_ip, "ssh_online": ssh_online, "ssh_ms": ssh_ms,
            "services": found, "groups": groups, "up": up, "count": count,
            "netdata": netdata_box["value"], "docker": docker_box["value"],
            "history": {"up_count": _metric_series("hl_up_count"),
                        "latency_ms": _metric_series("hl_latency_ms"),
                        "qbit_dl": _metric_series("qbit_dl"),
                        "qbit_up": _metric_series("qbit_up")}}
