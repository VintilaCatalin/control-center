import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';

// The five fixed views (Things' own Inbox/Today/Upcoming/Anytime/Someday/
// Logbook), computed client-side off the flat tasks/areas/projects arrays
// - the backend never encodes view semantics, same as Notes builds a
// folder tree client-side rather than the backend nesting JSON.
export type SmartViewId = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook';

export type Selection = { kind: 'smart'; id: SmartViewId } | { kind: 'area'; id: string } | { kind: 'project'; id: string };

export const SMART_VIEWS: { id: SmartViewId; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'anytime', label: 'Anytime' },
  { id: 'someday', label: 'Someday' },
];

function startOfDay(ts: number): number {
  const d = new Date(ts * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
}

export function today(): number {
  return startOfDay(Date.now() / 1000);
}

// "Today" · "Tomorrow" · "Yesterday" · a weekday name for the next week ·
// otherwise a short date - the same small vocabulary Things itself uses
// for a due chip, never a raw ISO date.
export function formatDue(ts: number): string {
  const t = today();
  const day = startOfDay(ts);
  const diffDays = Math.round((day - t) / 86400);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return new Date(ts * 1000).toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = new Date(ts * 1000).getFullYear() === new Date().getFullYear();
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

function isFiled(t: TaskEntry): boolean {
  return !!(t.project_id || t.area_id);
}

export function tasksForSmartView(id: SmartViewId, tasks: TaskEntry[]): TaskEntry[] {
  const t0 = today();
  switch (id) {
    case 'inbox':
      return tasks.filter((t) => !t.done && !isFiled(t) && !t.when && !t.when_date);
    case 'today':
      return tasks.filter(
        (t) => !t.done && (t.when === 'today' || (!!t.when_date && t.when_date <= t0) || (!!t.deadline && t.deadline <= t0)),
      );
    case 'upcoming':
      return tasks.filter((t) => !t.done && !!t.when_date && t.when_date > t0).sort((a, b) => (a.when_date ?? 0) - (b.when_date ?? 0));
    case 'anytime':
      return tasks.filter((t) => !t.done && isFiled(t) && t.when !== 'someday' && !t.when_date && t.when !== 'today');
    case 'someday':
      return tasks.filter((t) => !t.done && t.when === 'someday');
    case 'logbook':
      return tasks.filter((t) => t.done).sort((a, b) => (b.completed ?? 0) - (a.completed ?? 0));
  }
}

export function tasksForProject(projectId: string, tasks: TaskEntry[]): TaskEntry[] {
  return tasks.filter((t) => t.project_id === projectId);
}

// An Area's own task list: tasks filed straight under it (no project) plus
// every task belonging to one of its Projects - same "Area view rolls up
// its Projects" behavior Things has.
export function tasksForArea(areaId: string, tasks: TaskEntry[], projects: ProjectEntry[]): TaskEntry[] {
  const projectIds = new Set(projects.filter((p) => p.area_id === areaId).map((p) => p.id));
  return tasks.filter((t) => t.area_id === areaId || (t.project_id && projectIds.has(t.project_id)));
}

export function tasksForSelection(
  sel: Selection,
  tasks: TaskEntry[],
  projects: ProjectEntry[],
): TaskEntry[] {
  if (sel.kind === 'smart') return tasksForSmartView(sel.id, tasks);
  if (sel.kind === 'project') return tasksForProject(sel.id, tasks);
  return tasksForArea(sel.id, tasks, projects);
}

// Resolves a task's own "home" label for display in smart views/Inbox,
// where a task's location isn't already implied by the current selection
// (a Project's own view never needs to say which project a task is in).
export function homeLabel(t: TaskEntry, areas: AreaEntry[], projects: ProjectEntry[]): string | null {
  if (t.project_id) {
    const p = projects.find((x) => x.id === t.project_id);
    if (p) return p.label;
  }
  if (t.area_id) {
    const a = areas.find((x) => x.id === t.area_id);
    if (a) return a.label;
  }
  return null;
}
