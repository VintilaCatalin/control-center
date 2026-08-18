"""Recent screenshots/downloads files collector.

Extracted verbatim from the pre-modularization panel/server.py.
"""

from pathlib import Path


# ──────────────────────────────────────────────
#  FILES - recent screenshots and downloads, draggable out to the OS
# ──────────────────────────────────────────────

FILE_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}

def _files_root(cfg, kind):
    key = "screenshots_dir" if kind == "screenshots" else "downloads_dir"
    return Path(str(cfg[key]).strip())

def _list_recent_files(root, limit=24):
    if not root.is_dir(): return []
    files = [p for p in root.iterdir() if p.is_file() and not p.name.startswith(".")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[:limit]:
        try: stat = p.stat()
        except OSError: continue
        out.append({"name": p.name, "path": str(p), "size": stat.st_size,
                    "when": stat.st_mtime, "is_image": p.suffix.lower() in FILE_IMG_EXTS})
    return out

def collect_files(cfg, _shared):
    return {
        "screenshots": _list_recent_files(_files_root(cfg, "screenshots")),
        "downloads": _list_recent_files(_files_root(cfg, "downloads")),
    }

def _files_resolve(cfg, kind, wanted):
    """Same containment pattern as note_path()/the wallpaper routes - resolve
    and prove the path is actually inside the one folder this kind is
    allowed to serve from, so a crafted ?path= can't walk anywhere else."""
    root = _files_root(cfg, kind).resolve()
    target = Path(wanted).resolve()
    if not str(target).startswith(str(root)) or not target.is_file():
        return None
    return target
