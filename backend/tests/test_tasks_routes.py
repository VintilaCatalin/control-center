import tempfile
import unittest
from datetime import date
from pathlib import Path

from backend.routes.tasks import dispatch_post
from backend.tasks import repository as repository_module
from backend.tasks.repository import TaskRepository


class TaskRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.repo = TaskRepository(root / "tasks.sqlite3", legacy_loader=lambda: {}, legacy_store_path=None)
        self.previous = repository_module._repository
        repository_module._repository = self.repo

    def tearDown(self):
        repository_module._repository = self.previous
        self.tmp.cleanup()

    def test_creation_filing_and_rename_contract(self):
        inbox = dispatch_post("/api/tasks/add", {"title": "Inbox task", "text": "Inbox task"})
        today = dispatch_post(
            "/api/tasks/add",
            {"title": "Today task", "text": "Today task", "scheduled_on": date.today().isoformat(), "when": "today"},
        )
        area_result = dispatch_post("/api/tasks/areas/add", {"title": "Work", "label": "Work", "icon": "folder"})
        area_id = area_result["id"]
        project_result = dispatch_post(
            "/api/tasks/projects/add",
            {"title": "Launch", "label": "Launch", "area_id": area_id, "icon": "folder"},
        )
        project_id = project_result["id"]
        area_task = dispatch_post("/api/tasks/add", {"title": "Area task", "area_id": area_id})
        project_task = dispatch_post("/api/tasks/add", {"title": "Project task", "project_id": project_id})

        renamed_area = dispatch_post("/api/tasks/areas/edit", {"id": area_id, "title": "Studio", "label": "Studio"})
        renamed_project = dispatch_post("/api/tasks/projects/edit", {"id": project_id, "title": "Release", "label": "Release"})

        self.assertTrue(inbox["ok"])
        self.assertIsNone(inbox["task"]["area_id"])
        self.assertIsNone(inbox["task"]["project_id"])
        self.assertEqual(today["task"]["scheduled_on"], date.today().isoformat())
        self.assertEqual(area_task["task"]["area_id"], area_id)
        self.assertIsNone(area_task["task"]["project_id"])
        self.assertEqual(project_task["task"]["project_id"], project_id)
        self.assertIsNone(project_task["task"]["area_id"])
        self.assertEqual(renamed_area["area"]["title"], "Studio")
        self.assertEqual(renamed_project["project"]["title"], "Release")
        self.assertEqual(renamed_project["project"]["area_id"], area_id)

        snapshot = self.repo.snapshot()
        self.assertEqual(len(snapshot["tasks"]), 4)
        self.assertEqual(snapshot["areas"][0]["title"], "Studio")
        self.assertEqual(snapshot["projects"][0]["title"], "Release")

    def test_organization_routes_reorder_and_assign_tags(self):
        first = dispatch_post("/api/tasks/add", {"title": "First"})["task"]
        second = dispatch_post("/api/tasks/add", {"title": "Second"})["task"]
        tag = dispatch_post("/api/tasks/tags/add", {"name": "Deep work"})["tag"]

        assigned = dispatch_post("/api/tasks/tags/set", {"id": first["id"], "tag_ids": [tag["id"]]})
        reordered = dispatch_post("/api/tasks/reorder", {"ids": [first["id"], second["id"]]})

        self.assertTrue(assigned["ok"])
        self.assertEqual(assigned["task"]["tags"][0]["name"], "Deep work")
        self.assertTrue(reordered["ok"])
        self.assertEqual([task["id"] for task in self.repo.snapshot()["tasks"]], [first["id"], second["id"]])

    def test_recurrence_route_contract_includes_next_occurrence_and_series_scope(self):
        recurring = dispatch_post("/api/tasks/add", {
            "title": "Weekly review", "scheduled_on": "2026-09-01",
            "deadline_on": "2026-09-03", "recurrence": {"frequency": "weekly"},
        })["task"]
        completed = dispatch_post("/api/tasks/toggle", {"id": recurring["id"], "done": True})
        upcoming = completed["next_task"]
        self.assertEqual(completed["task"]["status"], "completed")
        self.assertEqual(upcoming["scheduled_on"], "2026-09-08")
        self.assertEqual(upcoming["deadline_on"], "2026-09-10")

        dispatch_post("/api/tasks/edit", {"id": upcoming["id"], "title": "Review everything", "scope": "series"})
        deleted = dispatch_post("/api/tasks/delete", {"id": upcoming["id"], "scope": "series"})
        self.assertTrue(deleted["ok"])
        self.assertIn(upcoming["id"], deleted["affected_ids"])
        remaining = self.repo.snapshot()["tasks"]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["id"], recurring["id"])


if __name__ == "__main__":
    unittest.main()
