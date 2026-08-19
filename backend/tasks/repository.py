"""SQLite-backed Tasks repository and lossless legacy-store import.

The rest of Control Center still owns lightweight UI state in
``panel-store.json``.  Tasks now carry durable user content, relationships,
completion history and date semantics, so they get a small transactional
store of their own.  The first open copies legacy Tasks data into SQLite,
after making an exact backup of the source file.  The source arrays are never
removed or rewritten by this module, which keeps rollback straightforward.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable, Iterator

from backend.core import CONFIG_DIR, STORE_FILE, load_store
from backend.tasks.recurrence import advance_date, day_offset, normalize_recurrence, offset_date


SCHEMA_VERSION = 3
PRIORITIES = {"low", "normal", "high"}
STATUSES = {"open", "completed"}
_UNSET = object()


def _now() -> float:
    return time.time()


def _new_id() -> str:
    return uuid.uuid4().hex


def _clean(value: Any, limit: int, *, required: bool = False) -> str:
    text = str(value or "").strip()[:limit]
    if required and not text:
        raise ValueError("a title is required")
    return text


def _date_string(value: Any) -> str | None:
    """Validate a date-only ISO value without introducing a timezone."""
    if value in (None, ""):
        return None
    text = str(value)
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError as exc:
        raise ValueError("date must be YYYY-MM-DD") from exc


def _legacy_date(value: Any) -> str | None:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(float(value)).date().isoformat()
    except (TypeError, ValueError, OSError, OverflowError):
        return None


class TaskRepository:
    def __init__(
        self,
        db_path: Path | None = None,
        *,
        legacy_loader: Callable[[], dict[str, Any]] = load_store,
        legacy_store_path: Path | None = STORE_FILE,
    ) -> None:
        self.db_path = db_path or (CONFIG_DIR / "tasks.sqlite3")
        self.legacy_loader = legacy_loader
        self.legacy_store_path = legacy_store_path
        self._lock = threading.RLock()
        self._ready = False

    def ensure_ready(self) -> None:
        with self._lock:
            if self._ready:
                return
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            previous_version = self._existing_schema_version()
            schema_backup = self._backup_database(previous_version) if previous_version and previous_version < SCHEMA_VERSION else None
            with self._connect() as conn:
                self._create_schema(conn)
                self._migrate_legacy(conn)
                if schema_backup:
                    self._set_meta(conn, f"schema_{previous_version}_to_{SCHEMA_VERSION}_backup", schema_backup)
            self._ready = True

    def _existing_schema_version(self) -> int | None:
        if not self.db_path.is_file():
            return None
        try:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute("SELECT value FROM task_meta WHERE key = 'schema_version'").fetchone()
            conn.close()
            return int(row[0]) if row else None
        except (sqlite3.Error, TypeError, ValueError):
            return None

    def _backup_database(self, version: int) -> str:
        backup_dir = self.db_path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        target = backup_dir / f"tasks.before-schema{SCHEMA_VERSION}-{stamp}.sqlite3"
        source_conn = sqlite3.connect(self.db_path)
        target_conn = sqlite3.connect(target)
        try:
            source_conn.backup(target_conn)
            integrity = target_conn.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError("Tasks schema backup integrity check failed")
            source_count = source_conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
            target_count = target_conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
            if source_count != target_count:
                raise RuntimeError("Tasks schema backup row verification failed")
        finally:
            target_conn.close()
            source_conn.close()
        return str(target)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _create_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS task_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_areas (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT 'folder',
                sort_key REAL NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_projects (
                id TEXT PRIMARY KEY,
                area_id TEXT REFERENCES task_areas(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT 'folder',
                sort_key REAL NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed')),
                priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
                pinned INTEGER NOT NULL DEFAULT 0,
                project_id TEXT REFERENCES task_projects(id) ON DELETE SET NULL,
                area_id TEXT REFERENCES task_areas(id) ON DELETE SET NULL,
                someday INTEGER NOT NULL DEFAULT 0,
                scheduled_on TEXT,
                deadline_on TEXT,
                completed_at REAL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                deleted_at REAL,
                sort_key REAL NOT NULL DEFAULT 0,
                today_sort_key REAL,
                recurrence_json TEXT,
                recurrence_series_id TEXT,
                recurrence_previous_id TEXT,
                caldav_uid TEXT,
                CHECK(project_id IS NULL OR area_id IS NULL)
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, deleted_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, deleted_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area_id, deleted_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(scheduled_on, deadline_on);

            CREATE TABLE IF NOT EXISTS task_tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                color TEXT,
                sort_key REAL NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_tag_links (
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
                created_at REAL NOT NULL,
                PRIMARY KEY (task_id, tag_id)
            );

            CREATE INDEX IF NOT EXISTS idx_task_tag_links_tag ON task_tag_links(tag_id);

            CREATE TABLE IF NOT EXISTS task_recurrence_series (
                id TEXT PRIMARY KEY,
                recurrence_json TEXT NOT NULL,
                template_json TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            """
        )
        task_columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info(tasks)")}
        if "recurrence_previous_id" not in task_columns:
            conn.execute("ALTER TABLE tasks ADD COLUMN recurrence_previous_id TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_series ON tasks(recurrence_series_id, deleted_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_previous ON tasks(recurrence_previous_id)")
        conn.execute(
            "INSERT OR REPLACE INTO task_meta(key, value) VALUES('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )

    def _meta(self, conn: sqlite3.Connection, key: str) -> str | None:
        row = conn.execute("SELECT value FROM task_meta WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else None

    def _set_meta(self, conn: sqlite3.Connection, key: str, value: Any) -> None:
        conn.execute(
            "INSERT OR REPLACE INTO task_meta(key, value) VALUES(?, ?)",
            (key, json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value),
        )

    def _backup_legacy_store(self) -> str | None:
        source = self.legacy_store_path
        if not source or not source.is_file():
            return None
        backup_dir = source.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        target = backup_dir / f"panel-store.before-tasks-sqlite-{stamp}.json"
        shutil.copy2(source, target)
        if source.read_bytes() != target.read_bytes():
            target.unlink(missing_ok=True)
            raise RuntimeError("Tasks migration backup verification failed")
        return str(target)

    def _migrate_legacy(self, conn: sqlite3.Connection) -> None:
        if self._meta(conn, "legacy_import") is not None:
            return

        existing = sum(
            int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in ("tasks", "task_areas", "task_projects")
        )
        if existing:
            self._set_meta(conn, "legacy_import", {"status": "skipped_nonempty"})
            return

        legacy = self.legacy_loader() or {}
        tasks = list(legacy.get("tasks") or [])
        areas = list(legacy.get("tasks_areas") or [])
        projects = list(legacy.get("tasks_projects") or [])
        backup = self._backup_legacy_store() if tasks or areas or projects else None
        now = _now()
        issues: list[str] = []

        area_ids: set[str] = set()
        for index, raw in enumerate(areas):
            area_id = str(raw.get("id") or _new_id())
            area_ids.add(area_id)
            conn.execute(
                """INSERT INTO task_areas
                   (id, title, notes, icon, sort_key, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    area_id,
                    _clean(raw.get("label") or raw.get("title"), 80, required=True),
                    _clean(raw.get("notes"), 8000),
                    _clean(raw.get("icon") or "folder", 32) or "folder",
                    float(index),
                    now,
                    now,
                ),
            )

        project_ids: set[str] = set()
        project_area: dict[str, str | None] = {}
        for index, raw in enumerate(projects):
            project_id = str(raw.get("id") or _new_id())
            raw_area = str(raw.get("area_id") or "") or None
            area_id = raw_area if raw_area in area_ids else None
            if raw_area and not area_id:
                issues.append(f"project:{project_id}:invalid_area:{raw_area}")
            project_ids.add(project_id)
            project_area[project_id] = area_id
            conn.execute(
                """INSERT INTO task_projects
                   (id, area_id, title, notes, icon, sort_key, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    project_id,
                    area_id,
                    _clean(raw.get("label") or raw.get("title"), 120, required=True),
                    _clean(raw.get("notes"), 8000),
                    _clean(raw.get("icon") or "folder", 32) or "folder",
                    float(index),
                    now,
                    now,
                ),
            )

        for index, raw in enumerate(tasks):
            task_id = str(raw.get("id") or _new_id())
            raw_project = str(raw.get("project_id") or "") or None
            raw_area = str(raw.get("area_id") or "") or None
            project_id = raw_project if raw_project in project_ids else None
            area_id = raw_area if not project_id and raw_area in area_ids else None
            if raw_project and not project_id:
                issues.append(f"task:{task_id}:invalid_project:{raw_project}")
            if raw_area and raw_area not in area_ids:
                issues.append(f"task:{task_id}:invalid_area:{raw_area}")
            if project_id and raw_area and raw_area != project_area.get(project_id):
                issues.append(f"task:{task_id}:project_area_wins")

            created = float(raw.get("created") or raw.get("created_at") or now)
            completed = raw.get("completed") if raw.get("completed") is not None else raw.get("completed_at")
            completed_at = float(completed) if completed not in (None, "") else None
            status = "completed" if bool(raw.get("done")) or raw.get("status") == "completed" else "open"
            if status == "completed" and completed_at is None:
                completed_at = created
            priority = str(raw.get("priority") or "normal")
            if priority not in PRIORITIES:
                priority = "normal"
            scheduled_on = _legacy_date(raw.get("when_date")) or _date_string(raw.get("scheduled_on"))
            when = raw.get("when")
            if when == "today" and not scheduled_on:
                scheduled_on = date.today().isoformat()
            someday = bool(raw.get("someday")) or when == "someday"
            deadline_on = _legacy_date(raw.get("deadline")) or _date_string(raw.get("deadline_on"))
            updated = max(created, completed_at or created)

            conn.execute(
                """INSERT INTO tasks
                   (id, title, notes, status, priority, pinned, project_id, area_id,
                    someday, scheduled_on, deadline_on, completed_at, created_at,
                    updated_at, sort_key, caldav_uid)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    task_id,
                    _clean(raw.get("text") or raw.get("title"), 500, required=True),
                    _clean(raw.get("notes"), 8000) or None,
                    status,
                    priority,
                    int(bool(raw.get("pinned"))),
                    project_id,
                    area_id,
                    int(someday),
                    scheduled_on,
                    deadline_on,
                    completed_at,
                    created,
                    updated,
                    float(index),
                    raw.get("caldav_uid"),
                ),
            )

        self._set_meta(
            conn,
            "legacy_import",
            {
                "status": "imported",
                "at": now,
                "backup": backup,
                "counts": {"tasks": len(tasks), "areas": len(areas), "projects": len(projects)},
                "issues": issues,
            },
        )

    def migration_info(self) -> dict[str, Any]:
        self.ensure_ready()
        with self._connect() as conn:
            raw = self._meta(conn, "legacy_import")
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"status": raw}

    @staticmethod
    def _task(row: sqlite3.Row, tags: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        recurrence = None
        if row["recurrence_json"]:
            try:
                recurrence = json.loads(row["recurrence_json"])
            except json.JSONDecodeError:
                recurrence = None
        return {
            "id": row["id"],
            "title": row["title"],
            "notes": row["notes"],
            "status": row["status"],
            "priority": row["priority"],
            "pinned": bool(row["pinned"]),
            "project_id": row["project_id"],
            "area_id": row["area_id"],
            "someday": bool(row["someday"]),
            "scheduled_on": row["scheduled_on"],
            "deadline_on": row["deadline_on"],
            "completed_at": row["completed_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "sort_key": row["sort_key"],
            "today_sort_key": row["today_sort_key"],
            "recurrence": recurrence,
            "recurrence_series_id": row["recurrence_series_id"],
            "recurrence_previous_id": row["recurrence_previous_id"],
            "caldav_uid": row["caldav_uid"],
            "tags": tags or [],
        }

    @staticmethod
    def _area(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"], "title": row["title"], "notes": row["notes"],
            "icon": row["icon"], "sort_key": row["sort_key"],
        }

    @staticmethod
    def _project(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"], "area_id": row["area_id"], "title": row["title"],
            "notes": row["notes"], "icon": row["icon"], "sort_key": row["sort_key"],
        }

    @staticmethod
    def _tag(row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "name": row["name"], "color": row["color"], "sort_key": row["sort_key"]}

    def _task_with_tags(self, row: sqlite3.Row) -> dict[str, Any]:
        with self._connect() as conn:
            tags = [self._tag(tag) for tag in conn.execute(
                """SELECT g.* FROM task_tags g JOIN task_tag_links l ON l.tag_id = g.id
                   WHERE l.task_id = ? ORDER BY g.sort_key, g.name""", (row["id"],)
            )]
        return self._task(row, tags)

    def snapshot(self) -> dict[str, Any]:
        self.ensure_ready()
        with self._connect() as conn:
            tasks = conn.execute(
                """SELECT * FROM tasks WHERE deleted_at IS NULL
                   ORDER BY pinned DESC, status = 'completed', sort_key, created_at DESC"""
            ).fetchall()
            areas = conn.execute("SELECT * FROM task_areas ORDER BY sort_key, created_at").fetchall()
            projects = conn.execute("SELECT * FROM task_projects ORDER BY sort_key, created_at").fetchall()
            tags = conn.execute("SELECT * FROM task_tags ORDER BY sort_key, name").fetchall()
            links = conn.execute(
                """SELECT l.task_id, g.* FROM task_tag_links l
                   JOIN task_tags g ON g.id = l.tag_id ORDER BY g.sort_key, g.name"""
            ).fetchall()
        tags_by_task: dict[str, list[dict[str, Any]]] = {}
        for row in links:
            tags_by_task.setdefault(str(row["task_id"]), []).append(self._tag(row))
        return {
            "tasks": [self._task(row, tags_by_task.get(str(row["id"]))) for row in tasks],
            "areas": [self._area(row) for row in areas],
            "projects": [self._project(row) for row in projects],
            "tags": [self._tag(row) for row in tags],
        }

    def _validate_home(self, conn: sqlite3.Connection, project_id: Any, area_id: Any) -> tuple[str | None, str | None]:
        project = str(project_id or "") or None
        area = str(area_id or "") or None
        if project:
            if not conn.execute("SELECT 1 FROM task_projects WHERE id = ?", (project,)).fetchone():
                raise ValueError("project not found")
            return project, None
        if area and not conn.execute("SELECT 1 FROM task_areas WHERE id = ?", (area,)).fetchone():
            raise ValueError("area not found")
        return None, area

    def _tags_for_task(self, conn: sqlite3.Connection, task_id: str) -> list[dict[str, Any]]:
        return [self._tag(row) for row in conn.execute(
            """SELECT g.* FROM task_tags g JOIN task_tag_links l ON l.tag_id = g.id
               WHERE l.task_id = ? ORDER BY g.sort_key, g.name""", (task_id,)
        )]

    @staticmethod
    def _decode_json(raw: Any, fallback: Any) -> Any:
        try:
            return json.loads(str(raw)) if raw else fallback
        except (json.JSONDecodeError, TypeError):
            return fallback

    def _series_template(self, row: sqlite3.Row, tag_ids: list[str], occurrence_on: str) -> dict[str, Any]:
        scheduled_offset = day_offset(row["scheduled_on"], occurrence_on)
        deadline_offset = day_offset(row["deadline_on"], occurrence_on)
        if scheduled_offset is None and deadline_offset is None:
            scheduled_offset = 0
        return {
            "title": row["title"], "notes": row["notes"], "priority": row["priority"],
            "pinned": bool(row["pinned"]), "project_id": row["project_id"], "area_id": row["area_id"],
            "someday": bool(row["someday"]), "scheduled_offset_days": scheduled_offset,
            "deadline_offset_days": deadline_offset, "tag_ids": tag_ids,
        }

    def _upsert_series(self, conn: sqlite3.Connection, series_id: str, recurrence: dict[str, Any], row: sqlite3.Row, *, template_fields: set[str] | None = None) -> None:
        now = _now()
        tag_ids = [str(item[0]) for item in conn.execute("SELECT tag_id FROM task_tag_links WHERE task_id = ?", (row["id"],))]
        row_recurrence = self._decode_json(row["recurrence_json"], {})
        representative_on = str(row_recurrence.get("occurrence_on") or recurrence["occurrence_on"])
        recurrence = {**recurrence, "occurrence_on": representative_on}
        existing = conn.execute("SELECT template_json FROM task_recurrence_series WHERE id = ?", (series_id,)).fetchone()
        if existing and template_fields is not None:
            template = self._decode_json(existing["template_json"], {})
            direct_fields = {"title", "notes", "priority", "pinned", "project_id", "area_id", "someday"}
            for field in direct_fields & template_fields:
                template[field] = bool(row[field]) if field in {"pinned", "someday"} else row[field]
            if "scheduled_on" in template_fields:
                template["scheduled_offset_days"] = day_offset(row["scheduled_on"], representative_on)
            if "deadline_on" in template_fields:
                template["deadline_offset_days"] = day_offset(row["deadline_on"], representative_on)
            if template.get("scheduled_offset_days") is None and template.get("deadline_offset_days") is None:
                template["scheduled_offset_days"] = 0
        else:
            template = self._series_template(row, tag_ids, representative_on)
        conn.execute(
            """INSERT INTO task_recurrence_series(id, recurrence_json, template_json, active, created_at, updated_at)
               VALUES (?, ?, ?, 1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET recurrence_json = excluded.recurrence_json,
                   template_json = excluded.template_json, active = 1, updated_at = excluded.updated_at""",
            (series_id, json.dumps(recurrence), json.dumps(template), now, now),
        )

    def _next_occurrence(self, conn: sqlite3.Connection, row: sqlite3.Row) -> sqlite3.Row | None:
        series_id = row["recurrence_series_id"]
        if not series_id:
            return None
        existing = conn.execute(
            "SELECT * FROM tasks WHERE recurrence_previous_id = ? AND deleted_at IS NULL", (row["id"],)
        ).fetchone()
        if existing:
            return existing
        series = conn.execute("SELECT * FROM task_recurrence_series WHERE id = ? AND active = 1", (series_id,)).fetchone()
        if not series:
            return None
        recurrence = normalize_recurrence(self._decode_json(series["recurrence_json"], {}))
        current_rule = normalize_recurrence(self._decode_json(row["recurrence_json"], recurrence), occurrence_on=(self._decode_json(row["recurrence_json"], {}) or {}).get("occurrence_on"))
        if not recurrence or not current_rule:
            return None
        next_on = advance_date(str(current_rule["occurrence_on"]), recurrence)
        next_rule = {**recurrence, "occurrence_on": next_on}
        template = self._decode_json(series["template_json"], {})
        try:
            project_id, area_id = self._validate_home(conn, template.get("project_id"), template.get("area_id"))
        except ValueError:
            project_id, area_id = None, None
            template.update(project_id=None, area_id=None)
            conn.execute("UPDATE task_recurrence_series SET template_json = ?, updated_at = ? WHERE id = ?", (json.dumps(template), _now(), series_id))
        scheduled_on = offset_date(next_on, template.get("scheduled_offset_days"))
        deadline_on = offset_date(next_on, template.get("deadline_offset_days"))
        now = _now()
        next_id = _new_id()
        conn.execute(
            """INSERT INTO tasks
               (id, title, notes, status, priority, pinned, project_id, area_id, someday,
                scheduled_on, deadline_on, created_at, updated_at, sort_key, recurrence_json,
                recurrence_series_id, recurrence_previous_id)
               VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (next_id, _clean(template.get("title"), 500, required=True), _clean(template.get("notes"), 8000) or None,
             template.get("priority") if template.get("priority") in PRIORITIES else "normal", int(bool(template.get("pinned"))),
             project_id, area_id, int(bool(template.get("someday"))), scheduled_on, deadline_on,
             now, now, -now, json.dumps(next_rule), series_id, row["id"]),
        )
        tag_ids = [str(value) for value in template.get("tag_ids") or []]
        known_tags = {str(item[0]) for item in conn.execute("SELECT id FROM task_tags")}
        conn.executemany(
            "INSERT INTO task_tag_links(task_id, tag_id, created_at) VALUES (?, ?, ?)",
            [(next_id, tag_id, now) for tag_id in tag_ids if tag_id in known_tags],
        )
        return conn.execute("SELECT * FROM tasks WHERE id = ?", (next_id,)).fetchone()

    def add_task(self, title: Any, *, priority: Any = "normal", notes: Any = "",
                 project_id: Any = None, area_id: Any = None, someday: Any = False,
                 scheduled_on: Any = None, deadline_on: Any = None,
                 recurrence: Any = None) -> dict[str, Any]:
        self.ensure_ready()
        clean_title = _clean(title, 500, required=True)
        clean_priority = str(priority or "normal")
        if clean_priority not in PRIORITIES:
            clean_priority = "normal"
        now = _now()
        task_id = _new_id()
        with self._lock, self._connect() as conn:
            project, area = self._validate_home(conn, project_id, area_id)
            clean_scheduled = _date_string(scheduled_on)
            clean_deadline = _date_string(deadline_on)
            recurrence_rule = normalize_recurrence(recurrence, occurrence_on=clean_scheduled or clean_deadline or date.today().isoformat())
            series_id = _new_id() if recurrence_rule else None
            conn.execute(
                """INSERT INTO tasks
                   (id, title, notes, status, priority, pinned, project_id, area_id,
                    someday, scheduled_on, deadline_on, created_at, updated_at, sort_key,
                    recurrence_json, recurrence_series_id)
                   VALUES (?, ?, ?, 'open', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (task_id, clean_title, _clean(notes, 8000) or None, clean_priority,
                 project, area, int(bool(someday)), clean_scheduled,
                 clean_deadline, now, now, -now, json.dumps(recurrence_rule) if recurrence_rule else None, series_id),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if recurrence_rule and series_id:
                self._upsert_series(conn, series_id, recurrence_rule, row)
            tags = self._tags_for_task(conn, task_id)
        return self._task(row, tags)

    def edit_task(self, task_id: str, *, scope: str = "occurrence", **fields: Any) -> dict[str, Any]:
        self.ensure_ready()
        if scope not in {"occurrence", "series"}:
            raise ValueError("invalid edit scope")
        allowed = {"title", "notes", "priority", "pinned", "project_id", "area_id",
                   "someday", "scheduled_on", "deadline_on", "recurrence"}
        patch = {key: value for key, value in fields.items() if key in allowed and value is not _UNSET}
        with self._lock, self._connect() as conn:
            current = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)).fetchone()
            if not current:
                raise KeyError("task not found")
            series_id = str(current["recurrence_series_id"] or "") or None
            had_series = bool(series_id)
            values: dict[str, Any] = {}
            if "title" in patch:
                values["title"] = _clean(patch["title"], 500, required=True)
            if "notes" in patch:
                values["notes"] = _clean(patch["notes"], 8000) or None
            if "priority" in patch:
                priority = str(patch["priority"] or "normal")
                if priority not in PRIORITIES:
                    raise ValueError("invalid priority")
                values["priority"] = priority
            if "pinned" in patch:
                values["pinned"] = int(bool(patch["pinned"]))
            if "someday" in patch:
                values["someday"] = int(bool(patch["someday"]))
            if "scheduled_on" in patch:
                values["scheduled_on"] = _date_string(patch["scheduled_on"])
            if "deadline_on" in patch:
                values["deadline_on"] = _date_string(patch["deadline_on"])
            if "project_id" in patch or "area_id" in patch:
                project_raw = patch.get("project_id", current["project_id"])
                area_raw = patch.get("area_id", current["area_id"])
                if "project_id" in patch and project_raw:
                    area_raw = None
                if "area_id" in patch and area_raw:
                    project_raw = None
                project, area = self._validate_home(conn, project_raw, area_raw)
                values.update(project_id=project, area_id=area)

            recurrence_rule: dict[str, Any] | None | object = _UNSET
            if "recurrence" in patch:
                if patch["recurrence"] in (None, "", False):
                    recurrence_rule = None
                else:
                    existing = self._decode_json(current["recurrence_json"], {})
                    occurrence_on = existing.get("occurrence_on") or values.get("scheduled_on") or current["scheduled_on"] or values.get("deadline_on") or current["deadline_on"] or date.today().isoformat()
                    recurrence_rule = normalize_recurrence(patch["recurrence"], occurrence_on=occurrence_on)
                    series_id = series_id or _new_id()

            series_scope = scope == "series" and bool(series_id)
            if series_scope:
                target_ids = [str(row[0]) for row in conn.execute(
                    "SELECT id FROM tasks WHERE recurrence_series_id = ? AND status = 'open' AND deleted_at IS NULL", (series_id,)
                )]
                if current["status"] == "open" and task_id not in target_ids:
                    target_ids.append(task_id)
            else:
                target_ids = [task_id]

            if recurrence_rule is None:
                if series_id:
                    conn.execute("UPDATE task_recurrence_series SET active = 0, updated_at = ? WHERE id = ?", (_now(), series_id))
                    target_ids = [str(row[0]) for row in conn.execute(
                        "SELECT id FROM tasks WHERE recurrence_series_id = ? AND status = 'open' AND deleted_at IS NULL", (series_id,)
                    )] or target_ids
                values.update(recurrence_json=None, recurrence_series_id=None)
            elif recurrence_rule is not _UNSET:
                values["recurrence_series_id"] = series_id
                if not series_scope:
                    values["recurrence_json"] = json.dumps(recurrence_rule)

            if values and target_ids:
                values["updated_at"] = _now()
                assignments = ", ".join(f"{key} = ?" for key in values)
                placeholders = ",".join("?" for _ in target_ids)
                conn.execute(f"UPDATE tasks SET {assignments} WHERE id IN ({placeholders})", (*values.values(), *target_ids))

            if series_scope and recurrence_rule is not _UNSET and recurrence_rule is not None:
                for target_id in target_ids:
                    target = conn.execute("SELECT recurrence_json FROM tasks WHERE id = ?", (target_id,)).fetchone()
                    target_existing = self._decode_json(target["recurrence_json"], {}) if target else {}
                    target_rule = {**recurrence_rule, "occurrence_on": target_existing.get("occurrence_on") or recurrence_rule["occurrence_on"]}
                    conn.execute("UPDATE tasks SET recurrence_json = ?, recurrence_series_id = ?, updated_at = ? WHERE id = ?", (json.dumps(target_rule), series_id, _now(), target_id))

            if series_id and recurrence_rule is not None and (series_scope or recurrence_rule is not _UNSET):
                representative = conn.execute(
                    "SELECT * FROM tasks WHERE recurrence_series_id = ? AND status = 'open' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
                    (series_id,),
                ).fetchone()
                if representative:
                    active_rule = recurrence_rule if recurrence_rule is not _UNSET else normalize_recurrence(self._decode_json(representative["recurrence_json"], {}))
                    if active_rule:
                        fields_for_template = {key for key in patch if key != "recurrence"} if had_series else None
                        self._upsert_series(conn, series_id, active_rule, representative, template_fields=fields_for_template)
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            tags = self._tags_for_task(conn, task_id)
        return self._task(row, tags)

    def set_completed(self, task_id: str, completed: bool) -> dict[str, Any]:
        self.ensure_ready()
        now = _now()
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)).fetchone()
            if not row:
                raise KeyError("task not found")
            already_in_state = (row["status"] == "completed") == completed
            next_row = None
            removed_ids: list[str] = []
            conn.execute(
                "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
                ("completed" if completed else "open", now if completed else None, now, task_id),
            )
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not already_in_state and completed:
                next_row = self._next_occurrence(conn, row)
            elif not already_in_state and not completed:
                generated = conn.execute(
                    """SELECT id FROM tasks WHERE recurrence_previous_id = ? AND status = 'open'
                       AND deleted_at IS NULL""", (task_id,)
                ).fetchall()
                removed_ids = [str(item["id"]) for item in generated]
                if removed_ids:
                    placeholders = ",".join("?" for _ in removed_ids)
                    conn.execute(f"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id IN ({placeholders})", (now, now, *removed_ids))
            tags = self._tags_for_task(conn, task_id)
            next_tags = self._tags_for_task(conn, str(next_row["id"])) if next_row else []
        return {
            "task": self._task(row, tags),
            "next_task": self._task(next_row, next_tags) if next_row else None,
            "removed_ids": removed_ids,
        }

    def delete_task(self, task_id: str, *, scope: str = "occurrence") -> dict[str, Any]:
        self.ensure_ready()
        if scope not in {"occurrence", "series"}:
            raise ValueError("invalid delete scope")
        now = _now()
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)).fetchone()
            if not row:
                raise KeyError("task not found")
            series_id = row["recurrence_series_id"]
            next_row = None
            if scope == "series" and series_id:
                conn.execute("UPDATE task_recurrence_series SET active = 0, updated_at = ? WHERE id = ?", (now, series_id))
                affected_ids = [str(item[0]) for item in conn.execute(
                    "SELECT id FROM tasks WHERE recurrence_series_id = ? AND status = 'open' AND deleted_at IS NULL", (series_id,)
                )]
                if affected_ids:
                    placeholders = ",".join("?" for _ in affected_ids)
                    conn.execute(f"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id IN ({placeholders})", (now, now, *affected_ids))
            else:
                affected_ids = [task_id]
                conn.execute("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", (now, now, task_id))
                if row["status"] == "open" and series_id:
                    next_row = self._next_occurrence(conn, row)
            next_tags = self._tags_for_task(conn, str(next_row["id"])) if next_row else []
        return {
            "id": task_id, "deleted_at": now, "affected_ids": affected_ids,
            "next_task": self._task(next_row, next_tags) if next_row else None,
        }

    def restore_task(self, task_id: str) -> dict[str, Any]:
        self.ensure_ready()
        with self._lock, self._connect() as conn:
            found = conn.execute("SELECT 1 FROM tasks WHERE id = ? AND deleted_at IS NOT NULL", (task_id,)).fetchone()
            if not found:
                raise KeyError("deleted task not found")
            conn.execute("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?", (_now(), task_id))
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return self._task_with_tags(row)

    def reorder_tasks(self, ids: list[Any]) -> None:
        self.ensure_ready()
        wanted = [str(value) for value in ids]
        if len(wanted) != len(set(wanted)):
            raise ValueError("task order contains duplicates")
        with self._lock, self._connect() as conn:
            known = {str(row[0]) for row in conn.execute("SELECT id FROM tasks WHERE deleted_at IS NULL")}
            if set(wanted) - known:
                raise ValueError("unknown task in order")
            for index, task_id in enumerate(wanted):
                conn.execute("UPDATE tasks SET sort_key = ?, updated_at = ? WHERE id = ?", (index, _now(), task_id))

    def add_tag(self, name: Any, color: Any = None) -> dict[str, Any]:
        self.ensure_ready()
        clean_name = _clean(name, 40, required=True)
        clean_color = _clean(color, 24) or None
        now = _now()
        with self._lock, self._connect() as conn:
            existing = conn.execute("SELECT * FROM task_tags WHERE name = ? COLLATE NOCASE", (clean_name,)).fetchone()
            if existing:
                return self._tag(existing)
            tag_id = _new_id()
            sort_key = float(conn.execute("SELECT COALESCE(MAX(sort_key), -1) + 1 FROM task_tags").fetchone()[0])
            conn.execute(
                "INSERT INTO task_tags(id, name, color, sort_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (tag_id, clean_name, clean_color, sort_key, now, now),
            )
            row = conn.execute("SELECT * FROM task_tags WHERE id = ?", (tag_id,)).fetchone()
        return self._tag(row)

    def edit_tag(self, tag_id: str, **fields: Any) -> dict[str, Any]:
        self.ensure_ready()
        values: dict[str, Any] = {}
        if "name" in fields and fields["name"] is not None:
            values["name"] = _clean(fields["name"], 40, required=True)
        if "color" in fields:
            values["color"] = _clean(fields["color"], 24) or None
        with self._lock, self._connect() as conn:
            if not conn.execute("SELECT 1 FROM task_tags WHERE id = ?", (tag_id,)).fetchone():
                raise KeyError("tag not found")
            if values:
                values["updated_at"] = _now()
                assignments = ", ".join(f"{key} = ?" for key in values)
                try:
                    conn.execute(f"UPDATE task_tags SET {assignments} WHERE id = ?", (*values.values(), tag_id))
                except sqlite3.IntegrityError as exc:
                    raise ValueError("that tag already exists") from exc
            row = conn.execute("SELECT * FROM task_tags WHERE id = ?", (tag_id,)).fetchone()
        return self._tag(row)

    def remove_tag(self, tag_id: str) -> None:
        self.ensure_ready()
        with self._lock, self._connect() as conn:
            if not conn.execute("SELECT 1 FROM task_tags WHERE id = ?", (tag_id,)).fetchone():
                raise KeyError("tag not found")
            conn.execute("DELETE FROM task_tags WHERE id = ?", (tag_id,))

    def set_task_tags(self, task_id: str, tag_ids: list[Any], *, scope: str = "occurrence") -> dict[str, Any]:
        self.ensure_ready()
        if scope not in {"occurrence", "series"}:
            raise ValueError("invalid edit scope")
        wanted = list(dict.fromkeys(str(value) for value in tag_ids))
        with self._lock, self._connect() as conn:
            task = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)).fetchone()
            if not task:
                raise KeyError("task not found")
            known = {str(row[0]) for row in conn.execute("SELECT id FROM task_tags")}
            if set(wanted) - known:
                raise ValueError("unknown tag")
            series_id = task["recurrence_series_id"]
            if scope == "series" and series_id:
                target_ids = [str(row[0]) for row in conn.execute(
                    "SELECT id FROM tasks WHERE recurrence_series_id = ? AND status = 'open' AND deleted_at IS NULL", (series_id,)
                )]
                if not target_ids:
                    target_ids = [task_id]
            else:
                target_ids = [task_id]
            now = _now()
            placeholders = ",".join("?" for _ in target_ids)
            conn.execute(f"DELETE FROM task_tag_links WHERE task_id IN ({placeholders})", target_ids)
            conn.executemany(
                "INSERT INTO task_tag_links(task_id, tag_id, created_at) VALUES (?, ?, ?)",
                [(target_id, tag_id, now) for target_id in target_ids for tag_id in wanted],
            )
            conn.execute(f"UPDATE tasks SET updated_at = ? WHERE id IN ({placeholders})", (now, *target_ids))
            if scope == "series" and series_id:
                series = conn.execute("SELECT template_json FROM task_recurrence_series WHERE id = ?", (series_id,)).fetchone()
                if series:
                    template = self._decode_json(series["template_json"], {})
                    template["tag_ids"] = wanted
                    conn.execute("UPDATE task_recurrence_series SET template_json = ?, updated_at = ? WHERE id = ?", (json.dumps(template), now, series_id))
            tags = [self._tag(row) for row in conn.execute(
                """SELECT g.* FROM task_tags g JOIN task_tag_links l ON l.tag_id = g.id
                   WHERE l.task_id = ? ORDER BY g.sort_key, g.name""", (task_id,)
            )]
            task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return self._task(task, tags)

    def add_area(self, title: Any, *, icon: Any = "folder", notes: Any = "") -> dict[str, Any]:
        self.ensure_ready()
        now = _now()
        area_id = _new_id()
        clean_title = _clean(title, 80, required=True)
        with self._lock, self._connect() as conn:
            duplicate = conn.execute("SELECT 1 FROM task_areas WHERE lower(title) = lower(?)", (clean_title,)).fetchone()
            if duplicate:
                raise ValueError("that area already exists")
            sort_key = float(conn.execute("SELECT COALESCE(MAX(sort_key), -1) + 1 FROM task_areas").fetchone()[0])
            conn.execute(
                "INSERT INTO task_areas VALUES (?, ?, ?, ?, ?, ?, ?)",
                (area_id, clean_title, _clean(notes, 8000), _clean(icon, 32) or "folder", sort_key, now, now),
            )
            row = conn.execute("SELECT * FROM task_areas WHERE id = ?", (area_id,)).fetchone()
        return self._area(row)

    def edit_area(self, area_id: str, **fields: Any) -> dict[str, Any]:
        self.ensure_ready()
        values: dict[str, Any] = {}
        if "title" in fields and fields["title"] is not None:
            values["title"] = _clean(fields["title"], 80, required=True)
        if "notes" in fields and fields["notes"] is not None:
            values["notes"] = _clean(fields["notes"], 8000)
        if "icon" in fields and fields["icon"] is not None:
            values["icon"] = _clean(fields["icon"], 32) or "folder"
        with self._lock, self._connect() as conn:
            if not conn.execute("SELECT 1 FROM task_areas WHERE id = ?", (area_id,)).fetchone():
                raise KeyError("area not found")
            if values:
                values["updated_at"] = _now()
                assignments = ", ".join(f"{key} = ?" for key in values)
                conn.execute(f"UPDATE task_areas SET {assignments} WHERE id = ?", (*values.values(), area_id))
            row = conn.execute("SELECT * FROM task_areas WHERE id = ?", (area_id,)).fetchone()
        return self._area(row)

    def remove_area(self, area_id: str) -> None:
        self.ensure_ready()
        with self._lock, self._connect() as conn:
            if not conn.execute("SELECT 1 FROM task_areas WHERE id = ?", (area_id,)).fetchone():
                raise KeyError("area not found")
            conn.execute("UPDATE task_projects SET area_id = NULL, updated_at = ? WHERE area_id = ?", (_now(), area_id))
            conn.execute("UPDATE tasks SET area_id = NULL, updated_at = ? WHERE area_id = ?", (_now(), area_id))
            conn.execute("DELETE FROM task_areas WHERE id = ?", (area_id,))

    def reorder_areas(self, ids: list[Any]) -> None:
        self.ensure_ready()
        wanted = [str(value) for value in ids]
        with self._lock, self._connect() as conn:
            known = {str(row[0]) for row in conn.execute("SELECT id FROM task_areas")}
            if set(wanted) - known:
                raise ValueError("unknown area in order")
            remaining = [str(row[0]) for row in conn.execute("SELECT id FROM task_areas ORDER BY sort_key") if str(row[0]) not in wanted]
            for index, area_id in enumerate(wanted + remaining):
                conn.execute("UPDATE task_areas SET sort_key = ?, updated_at = ? WHERE id = ?", (index, _now(), area_id))

    def add_project(self, title: Any, *, area_id: Any = None, icon: Any = "folder", notes: Any = "") -> dict[str, Any]:
        self.ensure_ready()
        now = _now()
        project_id = _new_id()
        with self._lock, self._connect() as conn:
            _, clean_area = self._validate_home(conn, None, area_id)
            sort_key = float(conn.execute("SELECT COALESCE(MAX(sort_key), -1) + 1 FROM task_projects").fetchone()[0])
            conn.execute(
                """INSERT INTO task_projects
                   (id, area_id, title, notes, icon, sort_key, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (project_id, clean_area, _clean(title, 120, required=True), _clean(notes, 8000),
                 _clean(icon, 32) or "folder", sort_key, now, now),
            )
            row = conn.execute("SELECT * FROM task_projects WHERE id = ?", (project_id,)).fetchone()
        return self._project(row)

    def edit_project(self, project_id: str, **fields: Any) -> dict[str, Any]:
        self.ensure_ready()
        with self._lock, self._connect() as conn:
            current = conn.execute("SELECT * FROM task_projects WHERE id = ?", (project_id,)).fetchone()
            if not current:
                raise KeyError("project not found")
            values: dict[str, Any] = {}
            if "title" in fields and fields["title"] is not None:
                values["title"] = _clean(fields["title"], 120, required=True)
            if "notes" in fields and fields["notes"] is not None:
                values["notes"] = _clean(fields["notes"], 8000)
            if "icon" in fields and fields["icon"] is not None:
                values["icon"] = _clean(fields["icon"], 32) or "folder"
            if "area_id" in fields:
                _, values["area_id"] = self._validate_home(conn, None, fields["area_id"])
            if values:
                values["updated_at"] = _now()
                assignments = ", ".join(f"{key} = ?" for key in values)
                conn.execute(f"UPDATE task_projects SET {assignments} WHERE id = ?", (*values.values(), project_id))
            row = conn.execute("SELECT * FROM task_projects WHERE id = ?", (project_id,)).fetchone()
        return self._project(row)

    def remove_project(self, project_id: str) -> None:
        self.ensure_ready()
        with self._lock, self._connect() as conn:
            if not conn.execute("SELECT 1 FROM task_projects WHERE id = ?", (project_id,)).fetchone():
                raise KeyError("project not found")
            conn.execute("UPDATE tasks SET project_id = NULL, updated_at = ? WHERE project_id = ?", (_now(), project_id))
            conn.execute("DELETE FROM task_projects WHERE id = ?", (project_id,))

    def reorder_projects(self, ids: list[Any]) -> None:
        self.ensure_ready()
        wanted = [str(value) for value in ids]
        with self._lock, self._connect() as conn:
            known = {str(row[0]) for row in conn.execute("SELECT id FROM task_projects")}
            if set(wanted) - known:
                raise ValueError("unknown project in order")
            remaining = [str(row[0]) for row in conn.execute("SELECT id FROM task_projects ORDER BY sort_key") if str(row[0]) not in wanted]
            for index, project_id in enumerate(wanted + remaining):
                conn.execute("UPDATE task_projects SET sort_key = ?, updated_at = ? WHERE id = ?", (index, _now(), project_id))


_repository: TaskRepository | None = None
_repository_lock = threading.Lock()


def get_task_repository() -> TaskRepository:
    global _repository
    with _repository_lock:
        if _repository is None:
            _repository = TaskRepository()
        return _repository
