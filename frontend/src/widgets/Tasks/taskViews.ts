import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';

export type SmartViewId = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook';
export type Selection = { kind: 'smart'; id: SmartViewId } | { kind: 'area'; id: string } | { kind: 'project'; id: string };

export const SMART_VIEWS: { id: Exclude<SmartViewId, 'logbook'>; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'anytime', label: 'Anytime' },
  { id: 'someday', label: 'Someday' },
];

function two(n: number): string {
  return String(n).padStart(2, '0');
}

export function localDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${two(value.getMonth() + 1)}-${two(value.getDate())}`;
}

export function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function formatTaskDate(value: string): string {
  const date = dateFromKey(value);
  const today = new Date();
  const tomorrow = new Date();
  const yesterday = new Date();
  tomorrow.setDate(today.getDate() + 1);
  yesterday.setDate(today.getDate() - 1);
  const key = localDateKey(date);
  if (key === localDateKey(today)) return 'Today';
  if (key === localDateKey(tomorrow)) return 'Tomorrow';
  if (key === localDateKey(yesterday)) return 'Yesterday';
  const diff = Math.round((date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) / 86_400_000);
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function isOpen(task: TaskEntry): boolean {
  return task.status === 'open';
}

export function isFiled(task: TaskEntry): boolean {
  return !!(task.project_id || task.area_id);
}

export function nextUpcomingDate(task: TaskEntry): string | null {
  const today = localDateKey();
  const candidates = [task.scheduled_on, task.deadline_on].filter((value): value is string => !!value && value > today);
  return candidates.sort()[0] ?? null;
}

export function tasksForSmartView(id: SmartViewId, tasks: TaskEntry[]): TaskEntry[] {
  const today = localDateKey();
  switch (id) {
    case 'inbox':
      return tasks.filter((task) => isOpen(task) && !isFiled(task) && !task.scheduled_on && !task.someday);
    case 'today':
      return tasks.filter((task) => isOpen(task) && (!!task.scheduled_on && task.scheduled_on <= today || !!task.deadline_on && task.deadline_on <= today));
    case 'upcoming':
      return tasks
        .filter((task) => isOpen(task) && !!nextUpcomingDate(task))
        .sort((a, b) => (nextUpcomingDate(a) ?? '').localeCompare(nextUpcomingDate(b) ?? ''));
    case 'anytime':
      return tasks.filter((task) => isOpen(task) && isFiled(task) && !task.scheduled_on && !task.someday);
    case 'someday':
      return tasks.filter((task) => isOpen(task) && task.someday);
    case 'logbook':
      return tasks
        .filter((task) => task.status === 'completed')
        .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
  }
}

export function tasksForProject(projectId: string, tasks: TaskEntry[]): TaskEntry[] {
  return tasks.filter((task) => task.project_id === projectId);
}

export function tasksForArea(areaId: string, tasks: TaskEntry[], projects: ProjectEntry[]): TaskEntry[] {
  const projectIds = new Set(projects.filter((project) => project.area_id === areaId).map((project) => project.id));
  return tasks.filter((task) => task.area_id === areaId || !!task.project_id && projectIds.has(task.project_id));
}

export function tasksForSelection(selection: Selection, tasks: TaskEntry[], projects: ProjectEntry[]): TaskEntry[] {
  if (selection.kind === 'smart') return tasksForSmartView(selection.id, tasks);
  if (selection.kind === 'project') return tasksForProject(selection.id, tasks);
  return tasksForArea(selection.id, tasks, projects);
}

export function taskHome(task: TaskEntry, areas: AreaEntry[], projects: ProjectEntry[]): { label: string; kind: 'area' | 'project' } | null {
  if (task.project_id) {
    const project = projects.find((item) => item.id === task.project_id);
    if (project) return { label: project.title, kind: 'project' };
  }
  if (task.area_id) {
    const area = areas.find((item) => item.id === task.area_id);
    if (area) return { label: area.title, kind: 'area' };
  }
  return null;
}

export function selectionKey(selection: Selection): string {
  return `${selection.kind}:${selection.id}`;
}

export function selectionFromKey(value: string | null): Selection | null {
  if (!value) return null;
  const [kind, id] = value.split(':');
  if (kind === 'smart' && ['inbox', 'today', 'upcoming', 'anytime', 'someday', 'logbook'].includes(id)) return { kind, id: id as SmartViewId };
  if ((kind === 'area' || kind === 'project') && id) return { kind, id };
  return null;
}
