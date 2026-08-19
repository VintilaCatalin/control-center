import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { addTask, toggleTask, type TaskCreateFields } from '../../api/actions/tasks';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { GlyphIcon } from '../../primitives/GlyphPicker/glyphs';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { localDateKey } from '../Tasks/taskViews';
import styles from './TasksGlance.module.css';

type SmartSource = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'all';
type SourceId = `smart:${SmartSource}` | `area:${string}` | `project:${string}`;

const SOURCE_KEY = 'control-center.overview.tasks.source';
const TASKS_SELECTION_KEY = 'control-center.tasks.selection';
const EMPTY_TASKS: TaskEntry[] = [];
const EMPTY_AREAS: AreaEntry[] = [];
const EMPTY_PROJECTS: ProjectEntry[] = [];
const SMART_SOURCES: { id: SmartSource; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'folder' },
  { id: 'today', label: 'Today', icon: 'calendar' },
  { id: 'upcoming', label: 'Upcoming', icon: 'flag' },
  { id: 'anytime', label: 'Anytime', icon: 'bolt' },
  { id: 'someday', label: 'Someday', icon: 'star' },
  { id: 'all', label: 'All open', icon: 'tools' },
];

function storedSource(): SourceId {
  const value = localStorage.getItem(SOURCE_KEY);
  if (!value) return 'smart:all';
  if (value.startsWith('area:') || value.startsWith('project:')) return value as SourceId;
  return SMART_SOURCES.some((item) => value === `smart:${item.id}`) ? value as SourceId : 'smart:all';
}

function TasksIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  );
}

function CheckIcon() {
  return <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
}

function StarIcon() {
  return <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" /></svg>;
}

function ChevronIcon() {
  return <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>;
}

function sourceContains(task: TaskEntry, source: SourceId, projects: ProjectEntry[]): boolean {
  const [kind, id] = source.split(':');
  if (kind === 'area') {
    const projectIds = new Set(projects.filter((project) => project.area_id === id).map((project) => project.id));
    return task.area_id === id || (!!task.project_id && projectIds.has(task.project_id));
  }
  if (kind === 'project') return task.project_id === id;

  const today = localDateKey();
  const filed = !!(task.area_id || task.project_id);
  if (id === 'inbox') return !filed && !task.scheduled_on && !task.someday;
  if (id === 'today') return (!!task.scheduled_on && task.scheduled_on <= today) || (!!task.deadline_on && task.deadline_on <= today);
  if (id === 'upcoming') return [task.scheduled_on, task.deadline_on].some((date) => !!date && date > today);
  if (id === 'anytime') return filed && !task.scheduled_on && !task.someday;
  if (id === 'someday') return task.someday;
  return true;
}

function quickAddContext(source: SourceId): { label: string; fields: TaskCreateFields } {
  const [kind, id] = source.split(':');
  if (kind === 'area') return { label: 'this Area', fields: { area_id: id } };
  if (kind === 'project') return { label: 'this Project', fields: { project_id: id } };
  if (id === 'today') return { label: 'Today', fields: { scheduled_on: localDateKey() } };
  if (id === 'someday') return { label: 'Someday', fields: { someday: true } };
  return { label: 'Inbox', fields: {} };
}

export function TasksGlance({ hideHeader }: { hideHeader?: boolean } = {}) {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const { push } = useToast();
  const sourceMenu = useMenu();
  const taskData = snapshot?.tasks;
  const remoteTasks = taskData?.tasks ?? EMPTY_TASKS;
  const areas = taskData?.areas ?? EMPTY_AREAS;
  const projects = taskData?.projects ?? EMPTY_PROJECTS;
  const [createdTasks, setCreatedTasks] = useState<TaskEntry[]>([]);
  const [source, setSourceState] = useState<SourceId>(storedSource);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const tasks = useMemo(() => {
    const remoteIds = new Set(remoteTasks.map((task) => task.id));
    return [...createdTasks.filter((task) => !remoteIds.has(task.id)), ...remoteTasks];
  }, [createdTasks, remoteTasks]);

  useEffect(() => {
    if (!taskData || source.startsWith('smart:')) return;
    const [kind, id] = source.split(':');
    const exists = kind === 'area' ? areas.some((area) => area.id === id) : projects.some((project) => project.id === id);
    if (!exists) {
      setSourceState('smart:all');
      localStorage.setItem(SOURCE_KEY, 'smart:all');
    }
  }, [areas, projects, source, taskData]);

  function setSource(next: SourceId) {
    setSourceState(next);
    localStorage.setItem(SOURCE_KEY, next);
  }

  const sourceLabel = useMemo(() => {
    const [kind, id] = source.split(':');
    if (kind === 'area') return areas.find((area) => area.id === id)?.title ?? 'All open';
    if (kind === 'project') return projects.find((project) => project.id === id)?.title ?? 'All open';
    return SMART_SOURCES.find((item) => item.id === id)?.label ?? 'All open';
  }, [areas, projects, source]);

  const sourceTasks = useMemo(() => tasks.filter((task) => sourceContains(task, source, projects)), [projects, source, tasks]);
  const open = sourceTasks.filter((task) => task.status === 'open');
  const pinned = open.filter((task) => task.pinned).slice(0, 4);
  const pinnedIds = new Set(pinned.map((task) => task.id));
  const rest = open.filter((task) => !pinnedIds.has(task.id)).slice(0, 6 - pinned.length);
  const doneCount = sourceTasks.filter((task) => task.status === 'completed').length;
  const donePct = sourceTasks.length > 0 ? Math.round((doneCount / sourceTasks.length) * 100) : 0;
  const addContext = quickAddContext(source);

  const menuItems = useMemo<MenuItem[]>(() => {
    const selectedHint = (id: SourceId) => source === id ? 'Selected' : undefined;
    const items: MenuItem[] = [{ heading: 'Smart views' }];
    SMART_SOURCES.forEach((item) => items.push({
      label: item.label,
      hint: selectedHint(`smart:${item.id}`),
      icon: <GlyphIcon icon={item.icon} size={14} />,
      onClick: () => setSource(`smart:${item.id}`),
    }));

    if (areas.length) {
      items.push({ sep: true }, { heading: 'Areas & projects' });
      areas.forEach((area) => {
        items.push({ label: area.title, hint: selectedHint(`area:${area.id}`), icon: <GlyphIcon icon={area.icon} size={14} />, onClick: () => setSource(`area:${area.id}`) });
        projects.filter((project) => project.area_id === area.id).forEach((project) => items.push({
          label: `↳  ${project.title}`,
          hint: selectedHint(`project:${project.id}`),
          icon: <GlyphIcon icon={project.icon} size={13} />,
          onClick: () => setSource(`project:${project.id}`),
        }));
      });
    }

    const independentProjects = projects.filter((project) => !project.area_id || !areas.some((area) => area.id === project.area_id));
    if (independentProjects.length) {
      items.push({ sep: true }, { heading: 'Projects' });
      independentProjects.forEach((project) => items.push({ label: project.title, hint: selectedHint(`project:${project.id}`), icon: <GlyphIcon icon={project.icon} size={13} />, onClick: () => setSource(`project:${project.id}`) }));
    }
    return items;
  // `setSource` only writes stable React/localStorage setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, projects, source]);

  async function handleAdd() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await addTask(text, 'normal', undefined, addContext.fields);
      if (!result.ok || !result.task) {
        push(result.error ?? 'Could not create task', 'error');
        return;
      }
      setCreatedTasks((current) => [result.task!, ...current]);
      setDraft('');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not create task', 'error');
    } finally {
      setBusy(false);
    }
  }

  function viewAll() {
    if (source !== 'smart:all') localStorage.setItem(TASKS_SELECTION_KEY, source);
    navigateToApp('tasks');
  }

  return (
    <div className={styles.glance}>
      <div className={styles.head}>
        {!hideHeader && <span className={styles.heading}><TasksIcon /> Tasks</span>}
        <button
          type="button"
          className={styles.sourceButton}
          aria-label={`Task source: ${sourceLabel}`}
          aria-haspopup="menu"
          aria-expanded={sourceMenu.open}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            sourceMenu.openAt({ clientX: rect.left, clientY: rect.bottom + 6, preventDefault: () => undefined, stopPropagation: () => undefined });
          }}
        >
          <span>{sourceLabel}</span><ChevronIcon />
        </button>
        <button type="button" className={styles.viewAll} onClick={viewAll}>View all</button>
      </div>

      {sourceTasks.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.ring} style={{ '--pct': donePct } as CSSProperties} />
          <span className={styles.summaryText}>{doneCount} of {sourceTasks.length} done{pinned.length > 0 ? ` · ${pinned.length} pinned` : ''}</span>
        </div>
      )}

      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.input}
          placeholder={`Add to ${addContext.label}…`}
          aria-label={`Quick add to ${addContext.label}`}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void handleAdd()}
        />
      </div>

      {open.length === 0 ? (
        <div className={styles.empty}>{sourceTasks.length ? 'Everything here is complete.' : 'Nothing on your plate.'}</div>
      ) : (
        <div className={styles.lists}>
          {pinned.length > 0 && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Pinned</span>
              <div className={styles.list}>{pinned.map((task) => <TaskRow key={task.id} task={task} />)}</div>
            </div>
          )}
          {rest.length > 0 && (
            <div className={styles.group}>
              {pinned.length > 0 && <span className={styles.groupLabel}>Open</span>}
              <div className={styles.list}>{rest.map((task) => <TaskRow key={task.id} task={task} />)}</div>
            </div>
          )}
        </div>
      )}
      <Menu open={sourceMenu.open} x={sourceMenu.x} y={sourceMenu.y} onClose={sourceMenu.close} items={menuItems} />
    </div>
  );
}

function TaskRow({ task }: { task: TaskEntry }) {
  const { push } = useToast();
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    setPending(true);
    try {
      const result = await toggleTask(task.id, true);
      if (!result.ok) {
        setPending(false);
        push(result.error ?? 'Could not complete task', 'error');
      }
    } catch (error) {
      setPending(false);
      push(error instanceof Error ? error.message : 'Could not complete task', 'error');
    }
  }

  return (
    <button type="button" className={[styles.row, styles[`priority-${task.priority}`]].join(' ')} onClick={() => void handleToggle()} disabled={pending}>
      <span className={styles.checkbox}>{pending && <CheckIcon />}</span>
      <span className={styles.text}>{task.title}</span>
      {task.pinned && <span className={styles.pinStar}><StarIcon /></span>}
    </button>
  );
}
