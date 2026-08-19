"""Durable Tasks domain storage.

Tasks began as a small array in the general panel store.  Phase 2 promotes
them to their own transactional repository while keeping the existing
Control Center backend and snapshot architecture unchanged.
"""

from .repository import TaskRepository, get_task_repository

__all__ = ["TaskRepository", "get_task_repository"]
