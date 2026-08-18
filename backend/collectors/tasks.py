"""Quick tasks collector + CRUD.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import time

from backend.core import edit_store, load_store



# ──────────────────────────────────────────────
#  QUICK TASKS
# ──────────────────────────────────────────────
# A small action-oriented task layer, deliberately separate from Notes -
# not tied to any markdown file, so it stays simple (no file writes, no
# vault path guards) and can surface in Overview later without dragging
# the whole notes collector along. Lives in the same store.json every
# other lightweight annotation (favorites, hidden panels, ...) already
# uses - no new persistence mechanism.

def collect_tasks(_cfg, _shared):
    store = load_store()
    tasks = store.get("tasks") or []
    tasks = sorted(tasks, key=lambda t: (not t.get("pinned"), t.get("done", False), -float(t.get("created") or 0)))
    return {"tasks": tasks}

def add_task(text, priority="normal", notes=""):
    import uuid
    text = str(text or "").strip()
    if not text: return {"ok": False, "error": "empty task"}
    if priority not in ("low", "normal", "high"): priority = "normal"
    notes = str(notes or "").strip()[:2000] or None
    task = {"id": uuid.uuid4().hex[:12], "text": text[:280], "done": False,
            "priority": priority, "pinned": False, "created": time.time(), "completed": None,
            "notes": notes}
    def mutate(store):
        store.setdefault("tasks", []).append(task)
    edit_store(mutate)
    return {"ok": True, "task": task}

def edit_task(task_id, text=None, priority=None, notes=None, pinned=None):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for t in store.get("tasks") or []:
            if t.get("id") != task_id: continue
            if text is not None:
                clean = str(text).strip()
                if not clean:
                    result = {"ok": False, "error": "empty task"}
                    return
                t["text"] = clean[:280]
            if priority is not None and priority in ("low", "normal", "high"):
                t["priority"] = priority
            if notes is not None:
                t["notes"] = str(notes).strip()[:2000] or None
            if pinned is not None:
                t["pinned"] = bool(pinned)
            result = {"ok": True, "task": t}
    edit_store(mutate)
    return result

def toggle_task(task_id, done):
    def mutate(store):
        for t in store.get("tasks") or []:
            if t.get("id") == task_id:
                t["done"] = bool(done)
                t["completed"] = time.time() if done else None
    edit_store(mutate)
    return {"ok": True}

def pin_task(task_id, pinned):
    def mutate(store):
        for t in store.get("tasks") or []:
            if t.get("id") == task_id:
                t["pinned"] = bool(pinned)
    edit_store(mutate)
    return {"ok": True}

def delete_task(task_id):
    def mutate(store):
        store["tasks"] = [t for t in store.get("tasks") or [] if t.get("id") != task_id]
    edit_store(mutate)
    return {"ok": True}
