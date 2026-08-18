import { postAction } from '../client';
import type { TaskEntry } from '../types';

export type TaskPriority = 'low' | 'normal' | 'high';

export function addTask(
  text: string,
  priority: TaskPriority = 'normal',
  notes?: string,
): Promise<{ ok: boolean; task?: TaskEntry; error?: string }> {
  return postAction('/api/tasks/add', { text, priority, notes });
}

// Partial patch - only the fields present in `fields` are touched
// server-side (server.py's edit_task()), so callers pass just what
// changed rather than the whole task.
export interface TaskEditFields {
  text?: string;
  priority?: TaskPriority;
  notes?: string;
  pinned?: boolean;
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
