"""Tasks POST dispatch - tasks themselves plus the Areas/Projects grouping
layer over them.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_POST dispatch chain in the pre-modularization panel/server.py.
"""

from backend.collectors.tasks import (
    add_area, add_project, add_task, delete_task, edit_area, edit_project, edit_task,
    pin_task, remove_area, remove_project, reorder_areas, reorder_projects, toggle_task,
)


def dispatch_post(path, body):
    if path == "/api/tasks/add":
        return add_task(
            body.get("text"), body.get("priority") or "normal", body.get("notes") or "",
            project_id=body.get("project_id"), area_id=body.get("area_id"),
            when=body.get("when"), when_date=body.get("when_date"), deadline=body.get("deadline"),
        )
    if path == "/api/tasks/edit":
        kwargs = {}
        for field in ("project_id", "area_id", "when", "when_date", "deadline"):
            if field in body:
                kwargs[field] = body[field]
        return edit_task(
            str(body.get("id") or ""),
            text=body.get("text"),
            priority=body.get("priority"),
            notes=body.get("notes"),
            pinned=body.get("pinned"),
            **kwargs,
        )
    if path == "/api/tasks/toggle":
        return toggle_task(str(body.get("id") or ""), bool(body.get("done", True)))
    if path == "/api/tasks/pin":
        return pin_task(str(body.get("id") or ""), bool(body.get("pinned", True)))
    if path == "/api/tasks/delete":
        return delete_task(str(body.get("id") or ""))

    if path == "/api/tasks/areas/add":
        return add_area(body.get("label"), body.get("icon"))
    if path == "/api/tasks/areas/edit":
        return edit_area(str(body.get("id") or ""), label=body.get("label"), icon=body.get("icon"))
    if path == "/api/tasks/areas/remove":
        return remove_area(str(body.get("id") or ""))
    if path == "/api/tasks/areas/reorder":
        return reorder_areas(body.get("ids"))

    if path == "/api/tasks/projects/add":
        return add_project(body.get("label"), body.get("area_id"), body.get("icon"), body.get("notes") or "")
    if path == "/api/tasks/projects/edit":
        kwargs = {}
        if "area_id" in body:
            kwargs["area_id"] = body["area_id"]
        return edit_project(str(body.get("id") or ""), label=body.get("label"), icon=body.get("icon"), notes=body.get("notes"), **kwargs)
    if path == "/api/tasks/projects/remove":
        return remove_project(str(body.get("id") or ""))
    if path == "/api/tasks/projects/reorder":
        return reorder_projects(body.get("ids"))

    return None
