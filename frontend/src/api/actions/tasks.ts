import { postAction } from '../client';
import { normalizeArea, normalizeProject, normalizeTag, normalizeTask } from '../taskCompatibility';
import type { AreaEntry, ProjectEntry, TagEntry, TaskEntry, TaskRecurrence } from '../types';

type Loose = Record<string, unknown>;
export type TaskPriority = TaskEntry['priority'];

export interface TaskCreateFields {
  project_id?: string | null;
  area_id?: string | null;
  someday?: boolean;
  scheduled_on?: string | null;
  deadline_on?: string | null;
  recurrence?: Pick<TaskRecurrence, 'frequency'> & Partial<Pick<TaskRecurrence, 'interval' | 'unit'>> | null;
}

function legacyTimestamp(value: string | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(new Date(year, month - 1, day, 12).getTime() / 1000);
}

function legacyWhen(fields: TaskCreateFields): 'today' | 'someday' | null | undefined {
  if (fields.someday) return 'someday';
  if (fields.scheduled_on === undefined) return undefined;
  if (fields.scheduled_on === null) return null;
  const today = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  const key = `${today.getFullYear()}-${two(today.getMonth() + 1)}-${two(today.getDate())}`;
  return fields.scheduled_on === key ? 'today' : null;
}

export interface TaskMutationResult { ok: boolean; task?: TaskEntry; next_task?: TaskEntry; removed_ids: string[]; error?: string }

function taskResult(raw: Loose): TaskMutationResult {
  return {
    ok: Boolean(raw.ok),
    task: raw.task && typeof raw.task === 'object' ? normalizeTask(raw.task as Loose) : undefined,
    next_task: raw.next_task && typeof raw.next_task === 'object' ? normalizeTask(raw.next_task as Loose) : undefined,
    removed_ids: Array.isArray(raw.removed_ids) ? raw.removed_ids.map(String) : [],
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

export async function addTask(title: string, priority: TaskPriority = 'normal', notes?: string, fields: TaskCreateFields = {}) {
  const raw = await postAction<Loose>('/api/tasks/add', {
    title, text: title, priority, notes, ...fields,
    when: legacyWhen(fields), when_date: legacyTimestamp(fields.scheduled_on), deadline: legacyTimestamp(fields.deadline_on),
  });
  return taskResult(raw);
}

export interface TaskEditFields extends TaskCreateFields { title?: string; priority?: TaskPriority; notes?: string; pinned?: boolean }
export type RecurrenceScope = 'occurrence' | 'series';

export async function editTask(id: string, fields: TaskEditFields, scope: RecurrenceScope = 'occurrence') {
  const raw = await postAction<Loose>('/api/tasks/edit', {
    id, ...fields, scope, text: fields.title,
    when: legacyWhen(fields), when_date: legacyTimestamp(fields.scheduled_on), deadline: legacyTimestamp(fields.deadline_on),
  });
  return taskResult(raw);
}

export async function toggleTask(id: string, done: boolean) { return taskResult(await postAction<Loose>('/api/tasks/toggle', { id, done })); }
export async function pinTask(id: string, pinned: boolean) { return taskResult(await postAction<Loose>('/api/tasks/pin', { id, pinned })); }
export async function deleteTask(id: string, scope: RecurrenceScope = 'occurrence'): Promise<{ ok: boolean; deleted_at?: number; affected_ids: string[]; next_task?: TaskEntry; error?: string }> {
  const raw = await postAction<Loose>('/api/tasks/delete', { id, scope });
  return { ok: Boolean(raw.ok), deleted_at: typeof raw.deleted_at === 'number' ? raw.deleted_at : undefined, affected_ids: Array.isArray(raw.affected_ids) ? raw.affected_ids.map(String) : [], next_task: raw.next_task && typeof raw.next_task === 'object' ? normalizeTask(raw.next_task as Loose) : undefined, error: typeof raw.error === 'string' ? raw.error : undefined };
}
export async function restoreTask(id: string) { return taskResult(await postAction<Loose>('/api/tasks/restore', { id })); }
export function reorderTasks(ids: string[]): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/reorder', { ids }); }

export async function addTag(name: string, color?: string | null): Promise<{ ok: boolean; tag?: TagEntry; error?: string }> {
  const raw = await postAction<Loose>('/api/tasks/tags/add', { name, color });
  return { ok: Boolean(raw.ok), tag: raw.tag && typeof raw.tag === 'object' ? normalizeTag(raw.tag as Loose) : undefined, error: typeof raw.error === 'string' ? raw.error : undefined };
}

export async function setTaskTags(id: string, tag_ids: string[], scope: RecurrenceScope = 'occurrence') { return taskResult(await postAction<Loose>('/api/tasks/tags/set', { id, tag_ids, scope })); }
export function removeTag(id: string): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/tags/remove', { id }); }

function matchingArea(raw: Loose, id?: string): AreaEntry | undefined {
  if (raw.area && typeof raw.area === 'object') return normalizeArea(raw.area as Loose);
  if (Array.isArray(raw.areas)) {
    const found = raw.areas.find((item) => String((item as Loose).id) === id);
    if (found) return normalizeArea(found as Loose);
  }
}

function matchingProject(raw: Loose, id?: string): ProjectEntry | undefined {
  if (raw.project && typeof raw.project === 'object') return normalizeProject(raw.project as Loose);
  if (Array.isArray(raw.projects)) {
    const found = raw.projects.find((item) => String((item as Loose).id) === id);
    if (found) return normalizeProject(found as Loose);
  }
}

export async function addArea(title: string, icon?: string, notes?: string) {
  const raw = await postAction<Loose>('/api/tasks/areas/add', { title, label: title, icon, notes });
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  return { ok: Boolean(raw.ok), id, area: matchingArea(raw, id), error: typeof raw.error === 'string' ? raw.error : undefined };
}

export async function editArea(id: string, fields: { title?: string; icon?: string; notes?: string }) {
  const raw = await postAction<Loose>('/api/tasks/areas/edit', { id, ...fields, label: fields.title });
  return { ok: Boolean(raw.ok), area: matchingArea(raw, id), error: typeof raw.error === 'string' ? raw.error : undefined };
}

export function removeArea(id: string): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/areas/remove', { id }); }
export function reorderAreas(ids: string[]): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/areas/reorder', { ids }); }

export async function addProject(title: string, area_id?: string | null, icon?: string, notes?: string) {
  const raw = await postAction<Loose>('/api/tasks/projects/add', { title, label: title, area_id, icon, notes });
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  return { ok: Boolean(raw.ok), id, project: matchingProject(raw, id), error: typeof raw.error === 'string' ? raw.error : undefined };
}

export async function editProject(id: string, fields: { title?: string; area_id?: string | null; icon?: string; notes?: string }) {
  const raw = await postAction<Loose>('/api/tasks/projects/edit', { id, ...fields, label: fields.title });
  return { ok: Boolean(raw.ok), project: matchingProject(raw, id), error: typeof raw.error === 'string' ? raw.error : undefined };
}

export function removeProject(id: string): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/projects/remove', { id }); }
export function reorderProjects(ids: string[]): Promise<{ ok: boolean; error?: string }> { return postAction('/api/tasks/projects/reorder', { ids }); }

export type { AreaEntry, ProjectEntry };
