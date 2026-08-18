"""Quick-tasks POST dispatch.

Extracted (and re-wired to call through helpers) from make_handler()'s
do_POST dispatch chain in the pre-modularization panel/server.py.
"""

from backend.collectors.tasks import add_task, delete_task, edit_task, pin_task, toggle_task


def dispatch_post(path, body):
    if path == "/api/tasks/add":
        return add_task(body.get("text"), body.get("priority") or "normal", body.get("notes") or "")
    if path == "/api/tasks/edit":
        return edit_task(
            str(body.get("id") or ""),
            text=body.get("text"),
            priority=body.get("priority"),
            notes=body.get("notes"),
            pinned=body.get("pinned"),
        )
    if path == "/api/tasks/toggle":
        return toggle_task(str(body.get("id") or ""), bool(body.get("done", True)))
    if path == "/api/tasks/pin":
        return pin_task(str(body.get("id") or ""), bool(body.get("pinned", True)))
    if path == "/api/tasks/delete":
        return delete_task(str(body.get("id") or ""))
    return None
