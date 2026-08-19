import { postAction } from '../client';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../types';

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskWhen = 'today' | 'someday';

export interface TaskCreateFields {
  project_id?: string | null;
  area_id?: string | null;
  when?: TaskWhen | null;
  when_date?: number | null;
  deadline?: number | null;
}

export function addTask(
  text: string,
  priority: TaskPriority = 'normal',
  notes?: string,
  fields?: TaskCreateFields,
): Promise<{ ok: boolean; task?: TaskEntry; error?: string }> {
  return postAction('/api/tasks/add', { text, priority, notes, ...fields });
}

// Partial patch - only the fields present in `fields` are touched
// server-side (backend/collectors/tasks.py's edit_task()), so callers pass
// just what changed rather than the whole task. project_id/area_id/when/
// when_date/deadline are true tri-state: omit the key to leave it alone,
// pass the value to set it, pass `null` to explicitly clear it (e.g.
// un-filing a task back toward Inbox) - see edit_task()'s _UNSET sentinel.
export interface TaskEditFields {
  text?: string;
  priority?: TaskPriority;
  notes?: string;
  pinned?: boolean;
  project_id?: string | null;
  area_id?: string | null;
  when?: TaskWhen | null;
  when_date?: number | null;
  deadline?: number | null;
}

export function editTask(id: string, fields: TaskEditFields): Promise<{ ok: boolean; task?: TaskEntry; error?: string }> {
  return postAction('/api/tasks/edit', { id, ...fields });
}

export function toggleTask(id: string, done: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/tasks/toggle', { id, done });
}

export function pinTask(id: string, pinned: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/tasks/pin', { id, pinned });
}

export function deleteTask(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/tasks/delete', { id });
}

// Areas/Projects - the Things-style grouping layer. Same shape as
// api/actions/reading.ts's topic actions (addTopic/removeTopic/
// reorderTopics), mirrored deliberately rather than reinvented.

export function addArea(label: string, icon?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/tasks/areas/add', { label, icon });
}

export function editArea(id: string, fields: { label?: string; icon?: string }): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/areas/edit', { id, ...fields });
}

export function removeArea(id: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/areas/remove', { id });
}

export function reorderAreas(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/areas/reorder', { ids });
}

export function addProject(
  label: string,
  area_id?: string | null,
  icon?: string,
  notes?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/tasks/projects/add', { label, area_id, icon, notes });
}

export function editProject(
  id: string,
  fields: { label?: string; area_id?: string | null; icon?: string; notes?: string },
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/projects/edit', { id, ...fields });
}

export function removeProject(id: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/projects/remove', { id });
}

export function reorderProjects(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/tasks/projects/reorder', { ids });
}

export type { AreaEntry, ProjectEntry };
