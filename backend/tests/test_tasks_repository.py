import json
import sqlite3
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

from backend.tasks.repository import TaskRepository


class TaskRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def repository(self, legacy):
        source = self.root / "panel-store.json"
        source.write_text(json.dumps(legacy, indent=2), encoding="utf-8")
        return TaskRepository(
            self.root / "tasks.sqlite3",
            legacy_loader=lambda: legacy,
            legacy_store_path=source,
        ), source

    def test_mixed_legacy_import_is_lossless_and_backed_up(self):
        noon = datetime(2026, 8, 21, 12).timestamp()
        legacy = {
            "tasks_areas": [{"id": "work", "label": "Work", "icon": "chip"}],
            "tasks_projects": [{"id": "launch", "label": "Launch", "area_id": "work", "icon": "sparkle", "notes": "Ship it"}],
            "tasks": [
                {"id": "old", "text": "Flat task", "done": False, "priority": "normal", "pinned": False, "created": 10, "completed": None, "notes": None},
                {"id": "new", "text": "Filed task", "done": True, "priority": "high", "pinned": True, "created": 20, "completed": 30,
                 "notes": "Context", "project_id": "launch", "area_id": "wrong", "when": None, "when_date": noon,
                 "deadline": noon, "caldav_uid": "remote"},
            ],
        }
        repo, source = self.repository(legacy)
        original = source.read_bytes()

        snapshot = repo.snapshot()
        info = repo.migration_info()

        self.assertEqual({task["id"] for task in snapshot["tasks"]}, {"old", "new"})
        self.assertEqual(snapshot["areas"][0]["id"], "work")
        self.assertEqual(snapshot["areas"][0]["notes"], "")
        self.assertEqual(snapshot["projects"][0]["notes"], "Ship it")
        filed = next(task for task in snapshot["tasks"] if task["id"] == "new")
        self.assertEqual(filed["project_id"], "launch")
        self.assertIsNone(filed["area_id"])
        self.assertEqual(filed["scheduled_on"], "2026-08-21")
        self.assertEqual(filed["deadline_on"], "2026-08-21")
        self.assertEqual(filed["status"], "completed")
        self.assertEqual(info["counts"], {"tasks": 2, "areas": 1, "projects": 1})
        self.assertIn("project_area_wins", " ".join(info["issues"]))
        backup = Path(info["backup"])
        self.assertTrue(backup.is_file())
        self.assertEqual(backup.read_bytes(), original)
        self.assertEqual(source.read_bytes(), original)

    def test_today_and_someday_migrate_to_distinct_semantics(self):
        legacy = {
            "tasks": [
                {"id": "today", "text": "Today", "when": "today", "created": 1},
                {"id": "later", "text": "Later", "when": "someday", "created": 2},
            ]
        }
        repo, _ = self.repository(legacy)
        tasks = {task["id"]: task for task in repo.snapshot()["tasks"]}
        self.assertEqual(tasks["today"]["scheduled_on"], date.today().isoformat())
        self.assertFalse(tasks["today"]["someday"])
        self.assertTrue(tasks["later"]["someday"])
        self.assertIsNone(tasks["later"]["scheduled_on"])

    def test_relationships_dates_and_soft_delete_are_validated(self):
        repo, _ = self.repository({})
        area = repo.add_area("Personal", notes="Life admin")
        project = repo.add_project("Move house", area_id=area["id"], notes="Before winter")
        task = repo.add_task("Book movers", project_id=project["id"], scheduled_on="2026-09-01", deadline_on="2026-09-05")
        self.assertEqual(task["project_id"], project["id"])
        self.assertIsNone(task["area_id"])

        moved = repo.edit_task(task["id"], area_id=area["id"])
        self.assertIsNone(moved["project_id"])
        self.assertEqual(moved["area_id"], area["id"])
        with self.assertRaises(ValueError):
            repo.edit_task(task["id"], scheduled_on="not-a-date")
        with self.assertRaises(ValueError):
            repo.add_task("Broken", project_id="missing")

        repo.delete_task(task["id"])
        self.assertEqual(repo.snapshot()["tasks"], [])
        restored = repo.restore_task(task["id"])
        self.assertEqual(restored["title"], "Book movers")

    def test_tags_are_reusable_and_task_order_is_durable(self):
        repo, _ = self.repository({})
        first = repo.add_task("First")
        second = repo.add_task("Second")
        context = repo.add_tag("Context")
        duplicate = repo.add_tag("context")
        focus = repo.add_tag("Focus", "violet")

        self.assertEqual(duplicate["id"], context["id"])
        tagged = repo.set_task_tags(first["id"], [focus["id"], context["id"]])
        self.assertEqual([tag["name"] for tag in tagged["tags"]], ["Context", "Focus"])

        repo.reorder_tasks([first["id"], second["id"]])
        snapshot = repo.snapshot()
        self.assertEqual([task["id"] for task in snapshot["tasks"]], [first["id"], second["id"]])
        self.assertEqual(len(snapshot["tags"]), 2)
        self.assertEqual(len(snapshot["tasks"][0]["tags"]), 2)

        repo.remove_tag(context["id"])
        refreshed = repo.snapshot()
        self.assertEqual([tag["name"] for tag in refreshed["tasks"][0]["tags"]], ["Focus"])

    def test_recurrence_generation_preserves_history_series_and_date_offsets(self):
        repo, _ = self.repository({})
        cases = [
            ({"frequency": "daily"}, "2026-09-01", "2026-10-01", "2026-09-02", "2026-10-02"),
            ({"frequency": "weekly"}, "2026-09-01", None, "2026-09-08", None),
            ({"frequency": "monthly"}, "2026-01-31", None, "2026-02-28", None),
            ({"frequency": "custom", "interval": 2, "unit": "weeks"}, "2026-09-01", None, "2026-09-15", None),
        ]
        for index, (rule, scheduled, deadline, next_scheduled, next_deadline) in enumerate(cases):
            task = repo.add_task(f"Recurring {index}", scheduled_on=scheduled, deadline_on=deadline, recurrence=rule)
            result = repo.set_completed(task["id"], True)
            completed, upcoming = result["task"], result["next_task"]
            self.assertEqual(completed["status"], "completed")
            self.assertIsNotNone(completed["completed_at"])
            self.assertEqual(upcoming["scheduled_on"], next_scheduled)
            self.assertEqual(upcoming["deadline_on"], next_deadline)
            self.assertEqual(upcoming["recurrence_series_id"], completed["recurrence_series_id"])
            self.assertEqual(upcoming["recurrence_previous_id"], completed["id"])
            if rule["frequency"] == "monthly":
                following = repo.set_completed(upcoming["id"], True)["next_task"]
                self.assertEqual(following["scheduled_on"], "2026-03-31")

        snapshot = repo.snapshot()
        self.assertEqual(len([task for task in snapshot["tasks"] if task["status"] == "completed"]), 5)
        self.assertEqual(len([task for task in snapshot["tasks"] if task["status"] == "open"]), 4)

        plain = repo.add_task("One time task", scheduled_on="2026-09-01")
        plain_result = repo.set_completed(plain["id"], True)
        self.assertIsNone(plain_result["next_task"])
        self.assertIsNone(plain_result["task"]["recurrence_series_id"])

    def test_occurrence_and_series_edits_and_deletes_are_distinct(self):
        repo, _ = self.repository({})
        original = repo.add_task("Original", notes="Template", scheduled_on="2026-09-01", recurrence={"frequency": "daily"})
        one_off = repo.edit_task(original["id"], title="Only this one", scope="occurrence")
        self.assertEqual(one_off["title"], "Only this one")
        repo.edit_task(original["id"], priority="high", scope="series")

        first_completion = repo.set_completed(original["id"], True)
        second = first_completion["next_task"]
        self.assertEqual(second["title"], "Original")
        self.assertEqual(second["priority"], "high")
        repo.edit_task(second["id"], title="Series title", notes="Future template", scope="series")
        third = repo.set_completed(second["id"], True)["next_task"]
        self.assertEqual(third["title"], "Series title")
        self.assertEqual(third["notes"], "Future template")

        skipped = repo.delete_task(third["id"], scope="occurrence")
        fourth = skipped["next_task"]
        self.assertIsNotNone(fourth)
        stopped = repo.delete_task(fourth["id"], scope="series")
        self.assertIn(fourth["id"], stopped["affected_ids"])
        snapshot = repo.snapshot()["tasks"]
        self.assertEqual(len([task for task in snapshot if task["status"] == "completed"]), 2)
        self.assertFalse(any(task["status"] == "open" and task["recurrence_series_id"] == original["recurrence_series_id"] for task in snapshot))

    def test_reopening_recurring_completion_removes_generated_occurrence(self):
        repo, _ = self.repository({})
        task = repo.add_task("Daily", scheduled_on="2026-09-01", recurrence={"frequency": "daily"})
        completed = repo.set_completed(task["id"], True)
        next_id = completed["next_task"]["id"]
        reopened = repo.set_completed(task["id"], False)
        self.assertIn(next_id, reopened["removed_ids"])
        self.assertEqual([item["id"] for item in repo.snapshot()["tasks"]], [task["id"]])

    def test_schema_three_migration_is_backed_up_and_recreates_series_table(self):
        repo, _ = self.repository({})
        repo.add_task("Preserved")
        conn = sqlite3.connect(repo.db_path)
        try:
            conn.execute("UPDATE task_meta SET value = '2' WHERE key = 'schema_version'")
            conn.execute("DROP TABLE task_recurrence_series")
            conn.commit()
        finally:
            conn.close()
        migrated = TaskRepository(repo.db_path, legacy_loader=lambda: {}, legacy_store_path=None)
        self.assertEqual(migrated.snapshot()["tasks"][0]["title"], "Preserved")
        conn = sqlite3.connect(repo.db_path)
        try:
            self.assertEqual(conn.execute("SELECT value FROM task_meta WHERE key = 'schema_version'").fetchone()[0], "3")
            backup = conn.execute("SELECT value FROM task_meta WHERE key = 'schema_2_to_3_backup'").fetchone()[0]
            self.assertIn("task_recurrence_series", {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")})
        finally:
            conn.close()
        self.assertTrue(Path(backup).is_file())


if __name__ == "__main__":
    unittest.main()
