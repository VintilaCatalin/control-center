import type { AreaEntry, ProjectEntry, TagEntry, TaskEntry, TasksData } from './types';

type Loose = Record<string, unknown>;

function localDateFromTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  const two = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function todayKey(): string {
  const now = new Date();
  const two = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function normalizeTask(value: Loose, index = 0): TaskEntry {
  if (value.status === 'open' || value.status === 'completed') return { ...(value as unknown as TaskEntry), tags: Array.isArray(value.tags) ? value.tags.map((tag, tagIndex) => normalizeTag(tag as Loose, tagIndex)) : [] };
  const created = Number(value.created ?? value.created_at ?? Date.now() / 1000);
  const completed = typeof value.completed === 'number' ? value.completed : null;
  const when = typeof value.when === 'string' ? value.when : null;
  return {
    id: String(value.id ?? ''),
    title: String(value.title ?? value.text ?? ''),
    notes: typeof value.notes === 'string' ? value.notes : null,
    status: value.done ? 'completed' : 'open',
    priority: value.priority === 'low' || value.priority === 'high' ? value.priority : 'normal',
    pinned: Boolean(value.pinned),
    project_id: value.project_id ? String(value.project_id) : null,
    area_id: value.area_id ? String(value.area_id) : null,
    someday: value.someday === true || when === 'someday',
    scheduled_on: localDateFromTimestamp(value.when_date) ?? (when === 'today' ? todayKey() : null),
    deadline_on: localDateFromTimestamp(value.deadline),
    completed_at: completed,
    created_at: created,
    updated_at: Math.max(created, completed ?? created),
    sort_key: typeof value.sort_key === 'number' ? value.sort_key : index,
    today_sort_key: null,
    recurrence: null,
    recurrence_series_id: null,
    caldav_uid: typeof value.caldav_uid === 'string' ? value.caldav_uid : null,
    tags: [],
  };
}

export function normalizeTag(value: Loose, index = 0): TagEntry {
  return { id: String(value.id ?? ''), name: String(value.name ?? ''), color: typeof value.color === 'string' ? value.color : null, sort_key: typeof value.sort_key === 'number' ? value.sort_key : index };
}

export function normalizeArea(value: Loose, index = 0): AreaEntry {
  return {
    id: String(value.id ?? ''),
    title: String(value.title ?? value.label ?? ''),
    notes: typeof value.notes === 'string' ? value.notes : '',
    icon: typeof value.icon === 'string' && value.icon ? value.icon : 'folder',
    sort_key: typeof value.sort_key === 'number' ? value.sort_key : index,
  };
}

export function normalizeProject(value: Loose, index = 0): ProjectEntry {
  return {
    id: String(value.id ?? ''),
    title: String(value.title ?? value.label ?? ''),
    notes: typeof value.notes === 'string' ? value.notes : '',
    icon: typeof value.icon === 'string' && value.icon ? value.icon : 'folder',
    area_id: value.area_id ? String(value.area_id) : null,
    sort_key: typeof value.sort_key === 'number' ? value.sort_key : index,
  };
}

export function normalizeTasksData(value: Loose): TasksData {
  const tasks = Array.isArray(value.tasks) ? value.tasks : [];
  const areas = Array.isArray(value.areas) ? value.areas : [];
  const projects = Array.isArray(value.projects) ? value.projects : [];
  const tags = Array.isArray(value.tags) ? value.tags : [];
  return {
    tasks: tasks.map((item, index) => normalizeTask(item as Loose, index)),
    areas: areas.map((item, index) => normalizeArea(item as Loose, index)),
    projects: projects.map((item, index) => normalizeProject(item as Loose, index)),
    tags: tags.map((item, index) => normalizeTag(item as Loose, index)),
  };
}
