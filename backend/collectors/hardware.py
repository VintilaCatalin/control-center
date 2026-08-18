"""Local machine hardware stats collector.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import re
import time
import requests

from backend.core import _metric_series, _record_metric



def _walk_lhm(node, found):
    text = (node.get("Text") or "").strip()
    value = (node.get("Value") or "").strip()
    if text and value: found.append((text, value))
    for child in node.get("Children") or []: _walk_lhm(child, found)

def _lhm_number(value):
    match = re.search(r"-?\d+(?:[.,]\d+)?", value or "")
    return float(match.group().replace(",", ".")) if match else None

_prev_disk_io = {}

def collect_hardware(cfg, _shared):
    out = {"cpu_temp": None, "cpu_load": None, "gpu_temp": None,
           "gpu_load": None, "ram_used": None, "ram_total": None, "ram_pct": None,
           "vram_used": None, "vram_total": None, "uptime": None, "disk_io": []}
    try:
        import psutil
        out["cpu_load"] = round(psutil.cpu_percent(interval=None))
        mem = psutil.virtual_memory()
        out["ram_used"] = round(mem.used / 1024 ** 3, 1)
        out["ram_total"] = round(mem.total / 1024 ** 3, 1)
        out["ram_pct"] = round(mem.used / mem.total * 100) if mem.total else None
        out["uptime"] = int(time.time() - psutil.boot_time())
        disks = []
        for part in psutil.disk_partitions(all=False):
            if "cdrom" in (part.opts or "") or not part.fstype: continue
            try: usage = psutil.disk_usage(part.mountpoint)
            except OSError: continue
            disks.append({"drive": part.device.rstrip("\\"), "used": round(usage.used / 1024 ** 3),
                          "total": round(usage.total / 1024 ** 3), "pct": round(usage.percent)})
        out["disks"] = disks
    except Exception: pass

    # Real per-drive read/write throughput (KiB/s) - psutil only reports
    # cumulative byte counters, so the rate is a delta against the last
    # poll (same idea Netdata's own disk_io chart uses), recorded into the
    # same in-memory history ring buffer everything else on this machine
    # already uses.
    try:
        now_t = time.time()
        disk_io = []
        for device, counters in psutil.disk_io_counters(perdisk=True).items():
            prev = _prev_disk_io.get(device)
            _prev_disk_io[device] = (counters.read_bytes, counters.write_bytes, now_t)
            if not prev: continue
            prev_read, prev_write, prev_t = prev
            dt = now_t - prev_t
            if dt <= 0: continue
            read_kibs = round(max(0, counters.read_bytes - prev_read) / 1024 / dt, 1)
            write_kibs = round(max(0, counters.write_bytes - prev_write) / 1024 / dt, 1)
            _record_metric(f"local_dio_r_{device}", read_kibs)
            _record_metric(f"local_dio_w_{device}", write_kibs)
            reads = _metric_series(f"local_dio_r_{device}")
            writes = _metric_series(f"local_dio_w_{device}")
            if not any(r["v"] for r in reads) and not any(w["v"] for w in writes): continue
            history = [{"t": r["t"], "read": r["v"], "write": writes[i]["v"] if i < len(writes) else 0} for i, r in enumerate(reads)]
            disk_io.append({"device": device, "read_kibs": read_kibs, "write_kibs": write_kibs, "history": history})
        disk_io.sort(key=lambda d: -(d["read_kibs"] + d["write_kibs"]))
        out["disk_io"] = disk_io[:3]
    except Exception: pass

    try:
        import pynvml
        pynvml.nvmlInit()
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            out["gpu_temp"] = pynvml.nvmlDeviceGetTemperature(handle, 0)
            out["gpu_load"] = pynvml.nvmlDeviceGetUtilizationRates(handle).gpu
            vram = pynvml.nvmlDeviceGetMemoryInfo(handle)
            out["vram_used"] = round(vram.used / 1024 ** 3, 1)
            out["vram_total"] = round(vram.total / 1024 ** 3, 1)
        finally: pynvml.nvmlShutdown()
    except Exception: pass

    # This machine's own trend, not the remote homelab server's (Netdata
    # already retains that separately, see the METRIC HISTORY note below) -
    # the "few numbers nothing else already retains" case that mechanism is
    # meant for, just fed from psutil/pynvml instead of a Netdata poll.
    _record_metric("local_cpu_load", out["cpu_load"])
    _record_metric("local_ram_pct", out["ram_pct"])
    _record_metric("local_gpu_load", out["gpu_load"])
    out["cpu_history"] = _metric_series("local_cpu_load")
    out["ram_history"] = _metric_series("local_ram_pct")
    out["gpu_history"] = _metric_series("local_gpu_load")

    try:
        r = requests.get(cfg["lhm_url"], timeout=3)
        found = []
        _walk_lhm(r.json(), found)
        temps = [(label, value) for label, value in found if "°" in value]
        wanted = ("cpu package", "core (tctl", "core average", "cpu die", "core max", "package", "cpu core", "cpu total")
        for needle in wanted:
            if out["cpu_temp"] is not None: break
            for label, value in temps:
                if needle in label.lower():
                    out["cpu_temp"] = round(_lhm_number(value) or 0) or None
                    break
        out["lhm"] = True
    except Exception:
        out["lhm"] = False

    if out["cpu_temp"] is None:
        try:
            import wmi
            w = wmi.WMI(namespace="root\\wmi")
            temperature_info = w.MSAcpi_ThermalZoneTemperature()
            if temperature_info:
                temp_c = round((temperature_info[0].CurrentTemperature - 2732) / 10.0)
                if 10 <= temp_c <= 115: out["cpu_temp"] = temp_c
        except Exception: pass

    return out
