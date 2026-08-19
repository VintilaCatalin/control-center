"""Tasks snapshot collector and domain actions.

The HTTP layer keeps Control Center's existing action-style endpoints; durable
storage and validation live in :mod:`backend.tasks.repository`.
"""

from typing import Any

from backend.tasks.repository import get_task_repository


_UNSET = object()


def collect_tasks(_cfg, _shared):
    return get_task_repository().snapshot()


def add_task(title, priority="normal", notes="", project_id=None, area_id=None,
             someday=False, scheduled_on=None, deadline_on=None, recurrence=None, **_legacy):
    task = get_task_repository().add_task(
        title, priority=priority, notes=notes, project_id=project_id,
        area_id=area_id, someday=someday, scheduled_on=scheduled_on,
        deadline_on=deadline_on, recurrence=recurrence,
    )
    return {"ok": True, "task": task}


def edit_task(task_id, title=None, priority=None, notes=None, pinned=None,
              project_id=_UNSET, area_id=_UNSET, someday=_UNSET,
              scheduled_on=_UNSET, deadline_on=_UNSET, recurrence=_UNSET,
              scope="occurrence", **_legacy):
    fields: dict[str, Any] = {}
    for key, value in {"title": title, "priority": priority, "notes": notes, "pinned": pinned}.items():
        if value is not None:
            fields[key] = value
    for key, value in {
        "project_id": project_id, "area_id": area_id, "someday": someday,
        "scheduled_on": scheduled_on, "deadline_on": deadline_on, "recurrence": recurrence,
    }.items():
        if value is not _UNSET:
            fields[key] = value
    task = get_task_repository().edit_task(task_id, scope=scope, **fields)
    return {"ok": True, "task": task}


def toggle_task(task_id, done):
    result = get_task_repository().set_completed(task_id, bool(done))
    return {"ok": True, **result}


def pin_task(task_id, pinned):
    return {"ok": True, "task": get_task_repository().edit_task(task_id, pinned=bool(pinned))}


def delete_task(task_id, scope="occurrence"):
    return {"ok": True, **get_task_repository().delete_task(task_id, scope=scope)}


def restore_task(task_id):
    return {"ok": True, "task": get_task_repository().restore_task(task_id)}


def add_area(title, icon=None, notes=""):
    area = get_task_repository().add_area(title, icon=icon or "folder", notes=notes)
    return {"ok": True, "id": area["id"], "area": area}


def edit_area(area_id, title=None, icon=None, notes=None):
    area = get_task_repository().edit_area(area_id, title=title, icon=icon, notes=notes)
    return {"ok": True, "area": area}


def remove_area(area_id):
    get_task_repository().remove_area(area_id)
    return {"ok": True}


def reorder_areas(ids):
    get_task_repository().reorder_areas(list(ids or []))
    return {"ok": True}


def add_project(title, area_id=None, icon=None, notes=""):
    project = get_task_repository().add_project(title, area_id=area_id, icon=icon or "folder", notes=notes)
    return {"ok": True, "id": project["id"], "project": project}


def edit_project(project_id, title=None, area_id=_UNSET, icon=None, notes=None):
    fields: dict[str, Any] = {"title": title, "icon": icon, "notes": notes}
    if area_id is not _UNSET:
        fields["area_id"] = area_id
    project = get_task_repository().edit_project(project_id, **fields)
    return {"ok": True, "project": project}


def remove_project(project_id):
    get_task_repository().remove_project(project_id)
    return {"ok": True}


def reorder_projects(ids):
    get_task_repository().reorder_projects(list(ids or []))
    return {"ok": True}


def reorder_tasks(ids):
    get_task_repository().reorder_tasks(list(ids or []))
    return {"ok": True}


def add_tag(name, color=None):
    return {"ok": True, "tag": get_task_repository().add_tag(name, color)}


def edit_tag(tag_id, name=None, color=None):
    fields = {"name": name}
    if color is not None:
        fields["color"] = color
    return {"ok": True, "tag": get_task_repository().edit_tag(tag_id, **fields)}


def remove_tag(tag_id):
    get_task_repository().remove_tag(tag_id)
    return {"ok": True}


def set_task_tags(task_id, tag_ids, scope="occurrence"):
    return {"ok": True, "task": get_task_repository().set_task_tags(task_id, list(tag_ids or []), scope=scope)}
