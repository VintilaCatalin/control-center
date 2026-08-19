"""Tasks collector + CRUD - Areas/Projects/Tasks, Things-inspired.

Extracted verbatim from the pre-modularization panel/server.py, then
extended with the Areas/Projects grouping layer.
"""

import time

from backend.core import _slug, edit_store, load_store



# ──────────────────────────────────────────────
#  TASKS
# ──────────────────────────────────────────────
# Deliberately separate from Notes - not tied to any markdown file, so it
# stays simple (no file writes, no vault path guards). Lives in the same
# store.json every other lightweight annotation (favorites, hidden panels,
# ...) already uses - no new persistence mechanism. View filtering (Inbox/
# Today/Upcoming/Anytime/Someday/Logbook) happens client-side off the flat
# tasks/areas/projects arrays returned here, same as Notes builds a folder
# tree client-side from a flat folders list - the backend just returns
# sorted flat data and never encodes view semantics.

WHEN_VALUES = ("today", "someday")

# Distinguishes "field omitted from the request" (leave the existing value
# untouched) from "field explicitly set to null" (clear it - e.g. un-filing
# a task back toward Inbox) in edit_task() below. None can't do this job
# itself since null *is* a valid value for every one of these fields.
_UNSET = object()

def collect_tasks(_cfg, _shared):
    store = load_store()
    tasks = store.get("tasks") or []
    tasks = sorted(tasks, key=lambda t: (not t.get("pinned"), t.get("done", False), -float(t.get("created") or 0)))
    return {"tasks": tasks, "areas": store.get("tasks_areas") or [], "projects": store.get("tasks_projects") or []}

def add_task(text, priority="normal", notes="", project_id=None, area_id=None, when=None, when_date=None, deadline=None):
    import uuid
    text = str(text or "").strip()
    if not text: return {"ok": False, "error": "empty task"}
    if priority not in ("low", "normal", "high"): priority = "normal"
    notes = str(notes or "").strip()[:2000] or None
    task = {"id": uuid.uuid4().hex[:12], "text": text[:280], "done": False,
            "priority": priority, "pinned": False, "created": time.time(), "completed": None,
            "notes": notes,
            "project_id": str(project_id) if project_id else None,
            "area_id": str(area_id) if area_id else None,
            "when": when if when in WHEN_VALUES else None,
            "when_date": float(when_date) if when_date else None,
            "deadline": float(deadline) if deadline else None,
            # Reserved for the eventual iCloud Reminders push (Phase B) -
            # unused until that ships, kept here now so adding it later
            # isn't another store migration.
            "caldav_uid": None}
    def mutate(store):
        store.setdefault("tasks", []).append(task)
    edit_store(mutate)
    return {"ok": True, "task": task}

def edit_task(task_id, text=None, priority=None, notes=None, pinned=None,
              project_id=_UNSET, area_id=_UNSET, when=_UNSET, when_date=_UNSET, deadline=_UNSET):
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
            if project_id is not _UNSET:
                t["project_id"] = str(project_id) if project_id else None
            if area_id is not _UNSET:
                t["area_id"] = str(area_id) if area_id else None
            if when is not _UNSET:
                t["when"] = when if when in WHEN_VALUES else None
            if when_date is not _UNSET:
                t["when_date"] = float(when_date) if when_date else None
            if deadline is not _UNSET:
                t["deadline"] = float(deadline) if deadline else None
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


# ──────────────────────────────────────────────
#  AREAS / PROJECTS
# ──────────────────────────────────────────────
# The Things-style grouping layer over tasks. Same id+label+icon shape and
# CRUD pattern as reading_add_topic()/reading_remove_topic()/
# reading_reorder_topics() in backend/collectors/reading.py - copied
# directly rather than reinvented. Task count/progress are deliberately
# NOT stored here - they're derived client-side from the tasks that
# reference a given project, same as Reading's topic counts.

def add_area(label, icon=None):
    label = str(label or "").strip()[:40]
    if not label: return {"ok": False, "error": "a name is required"}
    icon = str(icon or "folder").strip()[:24] or "folder"
    result = {"ok": True}
    def mutate(store):
        nonlocal result
        areas = store.setdefault("tasks_areas", [])
        if any(a.get("label", "").lower() == label.lower() for a in areas):
            result = {"ok": False, "error": "that area already exists"}
            return
        used = {a["id"] for a in areas}
        aid = _slug(label)
        while aid in used: aid += "-2"
        areas.append({"id": aid, "label": label, "icon": icon})
        result = {"ok": True, "id": aid, "areas": areas}
    edit_store(mutate)
    return result

def edit_area(area_id, label=None, icon=None):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for a in store.get("tasks_areas") or []:
            if a.get("id") != area_id: continue
            if label is not None:
                clean = str(label).strip()[:40]
                if not clean:
                    result = {"ok": False, "error": "a name is required"}
                    return
                a["label"] = clean
            if icon is not None:
                a["icon"] = str(icon).strip()[:24] or a["icon"]
            result = {"ok": True, "areas": store["tasks_areas"]}
            return
    edit_store(mutate)
    return result

def remove_area(area_id):
    area_id = str(area_id or "")
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        areas = store.get("tasks_areas") or []
        if not any(a.get("id") == area_id for a in areas):
            return
        store["tasks_areas"] = [a for a in areas if a.get("id") != area_id]
        # A Project never disappears when its Area does - it just floats
        # unsectioned, same "reassign, don't cascade-delete" rule Reading
        # uses when a topic is removed out from under its sources.
        for p in store.get("tasks_projects") or []:
            if p.get("area_id") == area_id: p["area_id"] = None
        for t in store.get("tasks") or []:
            if t.get("area_id") == area_id: t["area_id"] = None
        result = {"ok": True, "areas": store["tasks_areas"]}
    edit_store(mutate)
    return result

def reorder_areas(ids):
    wanted = [str(i) for i in (ids or [])]
    result = {"ok": False, "error": "bad request"}
    def mutate(store):
        nonlocal result
        areas = store.get("tasks_areas") or []
        by_id = {a["id"]: a for a in areas}
        ordered = [by_id[i] for i in wanted if i in by_id]
        remaining = [a for a in areas if a["id"] not in set(wanted)]
        store["tasks_areas"] = ordered + remaining
        result = {"ok": True, "areas": store["tasks_areas"]}
    edit_store(mutate)
    return result

def add_project(label, area_id=None, icon=None, notes=""):
    label = str(label or "").strip()[:60]
    if not label: return {"ok": False, "error": "a name is required"}
    icon = str(icon or "folder").strip()[:24] or "folder"
    notes = str(notes or "").strip()[:2000]
    result = {"ok": True}
    def mutate(store):
        nonlocal result
        area_ids = {a["id"] for a in store.get("tasks_areas") or []}
        projects = store.setdefault("tasks_projects", [])
        used = {p["id"] for p in projects}
        pid = _slug(label)
        while pid in used: pid += "-2"
        projects.append({"id": pid, "label": label,
                          "area_id": str(area_id) if area_id in area_ids else None,
                          "icon": icon, "notes": notes})
        result = {"ok": True, "id": pid, "projects": projects}
    edit_store(mutate)
    return result

def edit_project(project_id, label=None, area_id=_UNSET, icon=None, notes=None):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        area_ids = {a["id"] for a in store.get("tasks_areas") or []}
        for p in store.get("tasks_projects") or []:
            if p.get("id") != project_id: continue
            if label is not None:
                clean = str(label).strip()[:60]
                if not clean:
                    result = {"ok": False, "error": "a name is required"}
                    return
                p["label"] = clean
            if area_id is not _UNSET:
                p["area_id"] = str(area_id) if area_id in area_ids else None
            if icon is not None:
                p["icon"] = str(icon).strip()[:24] or p["icon"]
            if notes is not None:
                p["notes"] = str(notes).strip()[:2000]
            result = {"ok": True, "projects": store["tasks_projects"]}
            return
    edit_store(mutate)
    return result

def remove_project(project_id):
    project_id = str(project_id or "")
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        projects = store.get("tasks_projects") or []
        if not any(p.get("id") == project_id for p in projects):
            return
        store["tasks_projects"] = [p for p in projects if p.get("id") != project_id]
        # A Task never disappears when its Project does - it falls back
        # toward Inbox/Anytime (project_id cleared) rather than vanishing.
        for t in store.get("tasks") or []:
            if t.get("project_id") == project_id: t["project_id"] = None
        result = {"ok": True, "projects": store["tasks_projects"]}
    edit_store(mutate)
    return result

def reorder_projects(ids):
    wanted = [str(i) for i in (ids or [])]
    result = {"ok": False, "error": "bad request"}
    def mutate(store):
        nonlocal result
        projects = store.get("tasks_projects") or []
        by_id = {p["id"]: p for p in projects}
        ordered = [by_id[i] for i in wanted if i in by_id]
        remaining = [p for p in projects if p["id"] not in set(wanted)]
        store["tasks_projects"] = ordered + remaining
        result = {"ok": True, "projects": store["tasks_projects"]}
    edit_store(mutate)
    return result
