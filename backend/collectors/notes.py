"""Notes (Obsidian vault) collector + CRUD.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.core import edit_store, load_store



# ──────────────────────────────────────────────
#  NOTES - the Obsidian vault, live
# ──────────────────────────────────────────────

def notes_root(cfg):
    return Path(os.path.expandvars(str(cfg["notes_dir"]).strip()))

def note_path(cfg, wanted):
    """Resolve and prove it's inside the vault. This is the only place in the
    panel that writes files you care about, so nothing else gets to skip it."""
    if not str(cfg["notes_dir"]).strip():
        # An empty setting must never resolve to notes_root()'s cwd
        # fallback for a *write* path - collect_notes() already refuses to
        # read from it, but every note-writing action funnels through here
        # specifically so this one guard covers all of them.
        raise ValueError("no notes folder configured")
    root = notes_root(cfg).resolve()
    target = (root / str(wanted).lstrip("/\\")).resolve()
    if not str(target).startswith(str(root)): raise ValueError("outside the notes folder")
    if target.suffix.lower() not in (".md", ".markdown", ".txt"): raise ValueError("not a note")
    return target

def collect_notes(cfg, _shared):
    # An empty setting must read as "not configured", not "use the current
    # directory" - Path("") resolves to cwd, which is_dir() happily
    # reports True for, and this would then silently list whatever .md
    # files happen to exist in the backend's own working directory instead
    # of telling a fresh install it needs a folder chosen.
    if not str(cfg["notes_dir"]).strip():
        return {"dir": "", "notes": [], "total": 0, "folders": [], "configured": False}
    root = notes_root(cfg)
    if not root.is_dir():
        return {"dir": str(root), "notes": [], "total": 0, "folders": [], "configured": True,
                "error": "That folder doesn't exist - choose a notes folder in Settings."}
    limit = int(cfg.get("notes_limit", "300"))
    # Pinning is a panel-store annotation, not vault content - Obsidian
    # owns these files, so "pinned" lives in store.json (same pattern as
    # wallpaper_favorites) rather than as invented frontmatter nothing
    # else would recognise.
    pinned_set = set(load_store().get("pinned_notes") or [])
    notes = []
    for path in root.rglob("*"):
        if path.suffix.lower() not in (".md", ".markdown", ".txt") or not path.is_file(): continue
        if any(part.startswith(".") for part in path.relative_to(root).parts): continue
        try: stat = path.stat()
        except OSError: continue
        preview = ""
        try:
            head = path.read_text(encoding="utf-8", errors="ignore")[:400]
            lines = [l.strip() for l in head.splitlines()
                     if l.strip() and not l.strip().startswith(("#", "---", "```"))]
            preview = lines[0][:120] if lines else ""
        except Exception: pass
        rel = path.relative_to(root)
        rel_str = str(rel).replace("\\", "/")
        notes.append({"name": path.stem, "rel": rel_str,
                      "folder": str(rel.parent).replace("\\", "/") if str(rel.parent) != "." else "",
                      "when": stat.st_mtime, "size": stat.st_size, "preview": preview,
                      "pinned": rel_str in pinned_set})
    notes.sort(key=lambda n: -n["when"])
    folders = sorted({n["folder"] for n in notes if n["folder"]}, key=str.lower)
    return {"dir": str(root), "notes": notes[:limit], "total": len(notes),
            "folders": folders, "configured": True}

def read_note(cfg, rel):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    return {"ok": True, "rel": rel, "text": target.read_text(encoding="utf-8", errors="replace"),
            "when": target.stat().st_mtime}

def write_note(cfg, rel, text):
    target = note_path(cfg, rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".panel-tmp")
    tmp.write_text(str(text), encoding="utf-8", newline="\n")
    tmp.replace(target)      # never leave a half-written note in the vault
    return {"ok": True, "rel": rel, "when": target.stat().st_mtime}

def delete_note(cfg, rel):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    target.unlink()
    return {"ok": True}

def rename_note(cfg, rel, new_name):
    target = note_path(cfg, rel)
    if not target.is_file(): return {"ok": False, "error": "note not found"}
    stem = re.sub(r'[<>:"/\\|?*]', "", str(new_name or "").strip())
    if not stem: return {"ok": False, "error": "name can't be empty"}
    dest = target.with_name(stem + target.suffix)
    if dest.exists() and dest != target: return {"ok": False, "error": "a note with that name already exists"}
    target.rename(dest)
    rel_dest = dest.relative_to(notes_root(cfg).resolve())
    return {"ok": True, "rel": str(rel_dest).replace("\\", "/")}

def new_note(cfg, name, folder=""):
    stem = re.sub(r'[<>:"/\\|?*]', "", str(name or "").strip()) or datetime.now().strftime("Note %Y-%m-%d %H%M")
    rel = f"{folder}/{stem}.md" if folder else f"{stem}.md"
    target = note_path(cfg, rel)
    if target.exists():
        rel = f"{folder}/{stem} 2.md" if folder else f"{stem} 2.md"
        target = note_path(cfg, rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"# {stem}\n\n", encoding="utf-8", newline="\n")
    return {"ok": True, "rel": rel}

def pin_note(cfg, rel, pinned):
    rel = str(rel or "")
    if not rel: return {"ok": False, "error": "no rel"}
    def mutate(store):
        others = [r for r in store.get("pinned_notes") or [] if r != rel]
        store["pinned_notes"] = others + ([rel] if pinned else [])
    edit_store(mutate)
    return {"ok": True}
