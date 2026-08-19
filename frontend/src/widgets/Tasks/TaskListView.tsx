import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { editArea, editProject, reorderTasks } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { EditableGlyph } from '../../primitives/GlyphPicker/EditableGlyph';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { ProjectProgressRing } from './ProjectProgressRing';
import { formatTaskDate, localDateKey, nextUpcomingDate, taskHome, tasksForSelection, type Selection, type SmartViewId } from './taskViews';
import { TaskRow } from './TaskRow';
import styles from './TaskListView.module.css';

const COPY: Record<SmartViewId, { title: string; eyebrow: string; hint: string; emptyTitle: string; emptyBody: string }> = {
  inbox: { title: 'Inbox', eyebrow: 'A place to begin', hint: 'Capture first. Give it a home when the shape becomes clear.', emptyTitle: 'Nothing waiting', emptyBody: 'Your inbox is clear. New thoughts have a quiet place to land.' },
  today: { title: 'Today', eyebrow: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), hint: 'A focused view of what deserves your attention now.', emptyTitle: 'The day is yours', emptyBody: 'No tasks are asking for your attention today.' },
  upcoming: { title: 'Upcoming', eyebrow: 'On the horizon', hint: 'A gentle look at what is taking shape beyond today.', emptyTitle: 'Open horizon', emptyBody: 'Nothing is scheduled ahead. There is room to decide later.' },
  anytime: { title: 'Anytime', eyebrow: 'Ready when you are', hint: 'Filed work with no date and no pressure.', emptyTitle: 'A little breathing room', emptyBody: 'Your projects and areas have no undated tasks.' },
  someday: { title: 'Someday', eyebrow: 'Not now, not lost', hint: 'Ideas worth keeping without asking anything of today.', emptyTitle: 'Space for possibility', emptyBody: 'Set a task aside when it matters, just not yet.' },
  logbook: { title: 'Logbook', eyebrow: 'What you have moved forward', hint: 'A quiet record of completed work.', emptyTitle: 'Your progress starts here', emptyBody: 'Completed tasks will gather here without cluttering active lists.' },
};

interface Props {
  selection: Selection;
  tasks: TaskEntry[];
  areas: AreaEntry[];
  projects: ProjectEntry[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onToggle: (task: TaskEntry, done: boolean) => void;
  onSelect: (selection: Selection) => void;
  onAreasChanged: (areas: AreaEntry[]) => void;
  onProjectsChanged: (projects: ProjectEntry[]) => void;
  onTasksChanged: (tasks: TaskEntry[]) => void;
  onCreateTask: (destination: Selection) => void;
  searchQuery: string;
}

function EmptyState({ title, body, kind }: { title: string; body: string; kind: Selection['kind'] | SmartViewId }) {
  return <motion.div className={styles.empty} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className={styles.emptyOrb}><span>{kind === 'today' ? '✓' : kind === 'project' ? '↗' : '·'}</span></div>
    <strong>{title}</strong><p>{body}</p>
  </motion.div>;
}

function CompletedDisclosure({ count, children }: { count: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  if (!count) return null;
  return <section className={styles.completed}>
    <button type="button" className={styles.completedToggle} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span>{count} completed</span><span className={expanded ? styles.completedChevronOpen : styles.completedChevron}>›</span>
    </button>
    {expanded && <motion.div className={styles.completedRows} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{children}</motion.div>}
  </section>;
}

function EntityHeader({ entity, kind, tasks, onChange }: { entity: AreaEntry | ProjectEntry; kind: 'area' | 'project'; tasks: TaskEntry[]; onChange: (next: AreaEntry | ProjectEntry) => void }) {
  const [title, setTitle] = useState(entity.title);
  const [notes, setNotes] = useState(entity.notes);
  useEffect(() => { setTitle(entity.title); setNotes(entity.notes); }, [entity.id, entity.title, entity.notes]);
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const pct = tasks.length ? Math.round(completed / tasks.length * 100) : 0;

  async function save() {
    const clean = title.trim() || entity.title;
    const fields = { title: clean, notes: notes.trim() };
    if (kind === 'area') {
      const result = await editArea(entity.id, fields);
      if (result.ok && result.area) onChange(result.area); else setTitle(entity.title);
    } else {
      const result = await editProject(entity.id, fields);
      if (result.ok && result.project) onChange(result.project); else setTitle(entity.title);
    }
  }

  async function setIcon(icon: string) {
    const result = await editArea(entity.id, { icon });
    if (result.ok && result.area) onChange(result.area);
  }

  return <header className={styles.entityHeader}>
    {kind === 'area'
      ? <EditableGlyph value={entity.icon} onChange={setIcon} label="Change area icon" />
      : <span className={styles.projectHeaderRing}><ProjectProgressRing completed={completed} total={tasks.length} size={30} /></span>}
    <div className={styles.entityCopy}>
      <span className={styles.eyebrow}>{kind}</span>
      <input className={styles.entityTitle} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`${kind} title`} />
      <textarea className={styles.entityNotes} value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={save} placeholder={kind === 'project' ? 'Describe the outcome this project is moving toward…' : 'What belongs in this area of your life?'} rows={2} aria-label={`${kind} description`} />
      <div className={styles.entityMeta}><span>{tasks.filter((task) => task.status === 'open').length} open</span>{tasks.length > 0 && <><div className={styles.progressTrack}><motion.div className={styles.progressBar} animate={{ width: `${pct}%` }} /></div><span>{pct}%</span></>}</div>
    </div>
  </header>;
}

export function TaskListView(props: Props) {
  const { selection, tasks, areas, projects, selectedTaskId, onSelectTask, onToggle, onSelect, onAreasChanged, onProjectsChanged, onTasksChanged, onCreateTask, searchQuery } = props;
  const [taskDrag, setTaskDrag] = useState<string | null>(null);
  const [taskDrop, setTaskDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  const { push } = useToast();
  const query = searchQuery.trim().toLocaleLowerCase();
  const searching = query.length > 0;
  const filtered = useMemo(() => searching ? tasks.filter((task) => {
    const home = taskHome(task, areas, projects)?.label ?? '';
    return [task.title, task.notes ?? '', home, ...task.tags.map((tag) => tag.name)].some((value) => value.toLocaleLowerCase().includes(query));
  }) : tasksForSelection(selection, tasks, projects), [selection, tasks, projects, searching, query, areas]);
  const project = !searching && selection.kind === 'project' ? projects.find((item) => item.id === selection.id) : undefined;
  const area = !searching && selection.kind === 'area' ? areas.find((item) => item.id === selection.id) : undefined;
  const areaProjects = area ? projects.filter((item) => item.area_id === area.id) : [];
  const visible = area && !searching ? filtered.filter((task) => task.area_id === area.id) : filtered;
  const manualOrder = !searching && (selection.kind === 'project' || selection.kind === 'area' || selection.kind === 'smart' && (selection.id === 'inbox' || selection.id === 'someday'));

  async function dropTask(targetId: string, edge: 'before' | 'after') {
    if (!taskDrag || taskDrag === targetId) { setTaskDrop(null); return; }
    const sourceIndex = visible.findIndex((task) => task.id === taskDrag);
    const targetIndex = visible.findIndex((task) => task.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || visible[sourceIndex].status !== visible[targetIndex].status || visible[sourceIndex].pinned !== visible[targetIndex].pinned) return;
    const ordered = [...visible];
    const [moved] = ordered.splice(sourceIndex, 1);
    let insert = ordered.findIndex((task) => task.id === targetId);
    if (edge === 'after') insert += 1;
    ordered.splice(insert, 0, moved);
    const orderedIds = new Set(ordered.map((task) => task.id));
    let cursor = 0;
    const next = tasks.map((task) => orderedIds.has(task.id) ? ordered[cursor++] : task);
    onTasksChanged(next); setTaskDrag(null); setTaskDrop(null);
    try {
      const result = await reorderTasks(ordered.map((task) => task.id));
      if (!result.ok) throw new Error(result.error);
    } catch (error) {
      onTasksChanged(tasks);
      push(error instanceof Error ? error.message : 'Could not reorder tasks', 'error');
    }
  }

  function rows(items: TaskEntry[], showHome = selection.kind === 'smart' || searching, allowReorder = true) {
    return <AnimatePresence initial={false}>{items.map((task) => {
      const reorderable = allowReorder && manualOrder && task.status === 'open';
      return <TaskRow key={task.id} task={task} selected={task.id === selectedTaskId} home={showHome ? taskHome(task, areas, projects)?.label ?? null : null} onSelect={() => onSelectTask(task.id)} onToggle={(done) => onToggle(task, done)} reorderable={reorderable} dragging={taskDrag === task.id} dropEdge={taskDrop?.id === task.id ? taskDrop.edge : null} onDragStart={reorderable ? (event) => { setTaskDrag(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-control-center-task', task.id); } : undefined} onDragEnd={() => { setTaskDrag(null); setTaskDrop(null); }} onDragOver={reorderable ? (event: DragEvent<HTMLElement>) => { if (!event.dataTransfer.types.includes('application/x-control-center-task')) return; const source = visible.find((item) => item.id === taskDrag); if (source && (source.status !== task.status || source.pinned !== task.pinned)) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setTaskDrop({ id: task.id, edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }); } : undefined} onDrop={reorderable ? (event) => { event.preventDefault(); if (taskDrop) dropTask(task.id, taskDrop.edge); } : undefined} />;
    })}</AnimatePresence>;
  }

  function body() {
    if (!visible.length) {
      if (searching) return <EmptyState title="No matching tasks" body="Try a title, note, project, area, or tag." kind="smart" />;
      if (area) return <div className={styles.compactEmpty}>No tasks are assigned directly to this Area.</div>;
      const empty = selection.kind === 'smart' ? COPY[selection.id] : { emptyTitle: selection.kind === 'project' ? 'A clear starting point' : 'Nothing loose in this area', emptyBody: selection.kind === 'project' ? 'Add the first step. Momentum starts smaller than the outcome.' : 'Direct tasks will live here; projects keep their own focused lists.' };
      return <EmptyState title={empty.emptyTitle} body={empty.emptyBody} kind={selection.kind === 'smart' ? selection.id : selection.kind} />;
    }
    if (!searching && selection.kind === 'smart' && selection.id === 'logbook') {
      const groups = new Map<string, TaskEntry[]>();
      visible.forEach((task) => {
        const key = localDateKey(new Date((task.completed_at ?? task.updated_at) * 1000));
        groups.set(key, [...(groups.get(key) ?? []), task]);
      });
      return <div className={styles.history}>{[...groups].map(([day, items]) => <section className={styles.historyGroup} key={day}>
        <div className={styles.historyHeading}><span><strong>{formatTaskDate(day)}</strong><small>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</small></span><span>{items.length}</span></div>
        {rows(items, true, false)}
      </section>)}</div>;
    }
    if (!searching && selection.kind === 'smart' && selection.id === 'upcoming') {
      const groups = new Map<string, TaskEntry[]>();
      visible.forEach((task) => { const key = nextUpcomingDate(task)!; groups.set(key, [...(groups.get(key) ?? []), task]); });
      return <>{[...groups].map(([date, items]) => <section className={styles.dateGroup} key={date}><div className={styles.dateHeading}><strong>{formatTaskDate(date)}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span></div>{rows(items)}</section>)}</>;
    }
    const open = visible.filter((task) => task.status === 'open');
    const done = visible.filter((task) => task.status === 'completed');
    return <>{rows(open)}<CompletedDisclosure key={`${selection.kind}:${selection.id}`} count={done.length}>{rows(done)}</CompletedDisclosure></>;
  }

  const smart = selection.kind === 'smart' ? COPY[selection.id] : null;
  return <section className={styles.pane}>
    <div className={styles.scroll}>
      <div className={styles.inner}>
        {searching ? <header className={styles.smartHeader}><span className={styles.eyebrow}>Search</span><h1>Results</h1><p>{visible.length} {visible.length === 1 ? 'task' : 'tasks'} matching “{searchQuery.trim()}”</p></header> : smart && <header className={styles.smartHeader}><span className={styles.eyebrow}>{smart.eyebrow}</span><h1>{smart.title}</h1><p>{smart.hint}</p></header>}
        {!searching && project && <EntityHeader entity={project} kind="project" tasks={filtered} onChange={(next) => onProjectsChanged(projects.map((item) => item.id === next.id ? next as ProjectEntry : item))} />}
        {!searching && area && <EntityHeader entity={area} kind="area" tasks={filtered} onChange={(next) => onAreasChanged(areas.map((item) => item.id === next.id ? next as AreaEntry : item))} />}

        {!searching && !area && !(selection.kind === 'smart' && selection.id === 'logbook') && <button type="button" className={styles.quickAdd} onClick={() => onCreateTask(selection)}><span>+</span>New task…<kbd>Ctrl N</kbd></button>}

        {area ? <div className={styles.areaWorkspace}>
          <div className={styles.areaLooseTasks}>
            <button type="button" className={styles.quickAdd} onClick={() => onCreateTask({ kind: 'area', id: area.id })}><span>+</span>New task…<kbd>Ctrl N</kbd></button>
            {rows(visible.filter((task) => task.status === 'open'))}
            <CompletedDisclosure count={visible.filter((task) => task.status === 'completed').length}>{rows(visible.filter((task) => task.status === 'completed'))}</CompletedDisclosure>
          </div>
          {areaProjects.length > 0 && <div className={styles.projectOutline} aria-label={`Projects in ${area.title}`}>{areaProjects.map((item) => {
              const projectTasks = filtered.filter((task) => task.project_id === item.id);
              const openTasks = projectTasks.filter((task) => task.status === 'open');
              const completedTasks = projectTasks.filter((task) => task.status === 'completed');
              return <section key={item.id} className={styles.projectGroup}>
                <div className={styles.projectHeading}>
                  <button type="button" className={styles.projectOpen} onClick={() => onSelect({ kind: 'project', id: item.id })} title={`Open ${item.title}`}>
                    <ProjectProgressRing completed={completedTasks.length} total={projectTasks.length} size={20} />
                    <strong>{item.title}</strong>
                    <span>{openTasks.length > 0 ? `${openTasks.length} open` : projectTasks.length ? 'Complete' : ''}</span>
                  </button>
                  <button type="button" className={styles.projectAdd} onClick={() => onCreateTask({ kind: 'project', id: item.id })} aria-label={`Add task to ${item.title}`} title={`Add task to ${item.title}`}>+</button>
                </div>
                <div className={[styles.list, styles.projectList].join(' ')}>
                  {rows(openTasks, false, false)}
                  <CompletedDisclosure count={completedTasks.length}>{rows(completedTasks, false, false)}</CompletedDisclosure>
                </div>
              </section>;
            })}</div>}
        </div> : <div className={styles.list}>{body()}</div>}
      </div>
    </div>
  </section>;
}
