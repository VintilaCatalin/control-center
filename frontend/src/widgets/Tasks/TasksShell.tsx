import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { editTask, toggleTask } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TagEntry, TaskEntry } from '../../api/types';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { usePublishAppSidebar } from '../../shell/AppChromeContext';
import { useSidebarCollapsed } from '../../shell/SidebarCollapseContext';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { duration, ease } from '../../tokens/motion';
import { TaskCreateSheet } from './TaskCreateSheet';
import { TaskInspector } from './TaskInspector';
import { TaskListView } from './TaskListView';
import { TasksSidebarNav } from './TasksSidebarNav';
import { selectionFromKey, selectionKey, type Selection } from './taskViews';
import styles from './TasksShell.module.css';

const SELECTION_KEY = 'control-center.tasks.selection';
const EMPTY_TASKS: TaskEntry[] = [];
const EMPTY_AREAS: AreaEntry[] = [];
const EMPTY_PROJECTS: ProjectEntry[] = [];
const EMPTY_TAGS: TagEntry[] = [];

function PlusIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }

export function TasksShell() {
  const { snapshot } = useSnapshotData();
  const { collapsed } = useSidebarCollapsed();
  const { push } = useToast();
  const remoteTasks = snapshot?.tasks?.tasks ?? EMPTY_TASKS;
  const remoteAreas = snapshot?.tasks?.areas ?? EMPTY_AREAS;
  const remoteProjects = snapshot?.tasks?.projects ?? EMPTY_PROJECTS;
  const remoteTags = snapshot?.tasks?.tags ?? EMPTY_TAGS;
  const [tasks, setTasks] = useState<TaskEntry[]>(remoteTasks);
  const [areas, setAreas] = useState<AreaEntry[]>(remoteAreas);
  const [projects, setProjects] = useState<ProjectEntry[]>(remoteProjects);
  const [tags, setTags] = useState<TagEntry[]>(remoteTags);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selection, setSelectionState] = useState<Selection>(() => selectionFromKey(localStorage.getItem(SELECTION_KEY)) ?? { kind: 'smart', id: 'today' });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<Selection | null>(null);

  const openCreate = useCallback((target?: Selection) => {
    setCreateTarget(target ?? null);
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateTarget(null);
  }, []);

  useEffect(() => {
    function handleNewTask(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'n') return;
      event.preventDefault();
      if (!createOpen) openCreate();
    }
    document.addEventListener('keydown', handleNewTask);
    return () => document.removeEventListener('keydown', handleNewTask);
  }, [createOpen, openCreate]);

  useEffect(() => {
    setTasks((current) => {
      const local = new Map(current.map((task) => [task.id, task]));
      const merged = remoteTasks.filter((task) => !hidden.has(task.id)).map((task) => {
        const optimistic = local.get(task.id);
        return optimistic && optimistic.updated_at > task.updated_at ? optimistic : task;
      });
      for (const task of current) if (!remoteTasks.some((item) => item.id === task.id) && !hidden.has(task.id)) merged.push(task);
      return merged;
    });
  }, [remoteTasks, hidden]);
  useEffect(() => setAreas(remoteAreas), [remoteAreas]);
  useEffect(() => setProjects(remoteProjects), [remoteProjects]);
  useEffect(() => setTags(remoteTags), [remoteTags]);

  useEffect(() => {
    if (selection.kind === 'area' && remoteAreas.length && !remoteAreas.some((area) => area.id === selection.id)) setSelection({ kind: 'smart', id: 'inbox' });
    if (selection.kind === 'project' && remoteProjects.length && !remoteProjects.some((project) => project.id === selection.id)) setSelection({ kind: 'smart', id: 'inbox' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteAreas, remoteProjects]);

  function setSelection(next: Selection) {
    setSelectionState(next);
    setSelectedTaskId(null);
    localStorage.setItem(SELECTION_KEY, selectionKey(next));
  }

  const updateTask = useCallback((task: TaskEntry) => {
    setHidden((value) => { const next = new Set(value); next.delete(task.id); return next; });
    setTasks((items) => items.some((item) => item.id === task.id) ? items.map((item) => item.id === task.id ? task : item) : [task, ...items]);
  }, []);

  async function handleToggle(task: TaskEntry, done: boolean, announce = true) {
    const previous = task;
    const optimistic: TaskEntry = { ...task, status: done ? 'completed' : 'open', completed_at: done ? Date.now() / 1000 : null, updated_at: Date.now() / 1000 };
    updateTask(optimistic);
    const result = await toggleTask(task.id, done);
    if (result.ok && result.task) {
      updateTask(result.task);
      if (result.next_task) updateTask(result.next_task);
      if (result.removed_ids.length) handleTasksRemoved(result.removed_ids);
      if (announce && done) push('Task completed', 'success', { label: 'Undo', onClick: () => handleToggle(result.task!, false, false) });
    } else {
      updateTask(previous);
      push(result.error ?? 'Could not update task', 'error');
    }
  }

  function handleTasksRemoved(ids: string[]) {
    const removed = new Set(ids);
    setHidden((value) => new Set([...value, ...removed]));
    setTasks((items) => items.filter((item) => !removed.has(item.id)));
    if (selectedTaskId && removed.has(selectedTaskId)) setSelectedTaskId(null);
  }

  const moveTask = useCallback(async (id: string, home: { kind: 'area' | 'project'; id: string } | null) => {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;
    const fields = home?.kind === 'project' ? { project_id: home.id, area_id: null } : home?.kind === 'area' ? { area_id: home.id, project_id: null } : { area_id: null, project_id: null };
    updateTask({ ...current, ...fields, updated_at: Date.now() / 1000 });
    try {
      const result = await editTask(id, fields);
      if (!result.ok || !result.task) throw new Error(result.error || 'Could not move task');
      updateTask(result.task);
      push(`Moved to ${home ? (home.kind === 'project' ? projects : areas).find((item) => item.id === home.id)?.title ?? home.kind : 'Inbox'}`, 'success');
    } catch (error) { updateTask(current); push(error instanceof Error ? error.message : 'Could not move task', 'error'); }
  }, [areas, projects, push, tasks, updateTask]);

  usePublishAppSidebar(useMemo(() => <TasksSidebarNav tasks={tasks} areas={areas} projects={projects} selection={selection} searchQuery={searchQuery} onSearchChange={setSearchQuery} onMoveTask={moveTask} onSelect={setSelection} onAreasChanged={setAreas} onProjectsChanged={setProjects} collapsed={collapsed} />, [tasks, areas, projects, selection, searchQuery, collapsed, moveTask]));
  const selected = tasks.find((task) => task.id === selectedTaskId) ?? null;

  return <div className={styles.main}>
    <div className={[styles.workspace, selected ? styles.withInspector : ''].filter(Boolean).join(' ')}>
      <TaskListView selection={selection} tasks={tasks} areas={areas} projects={projects} searchQuery={searchQuery} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} onTasksChanged={setTasks} onToggle={handleToggle} onSelect={setSelection} onAreasChanged={setAreas} onProjectsChanged={setProjects} onCreateTask={openCreate} />
      <AnimatePresence>{selected && <motion.div className={styles.inspectorSlot} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }}><TaskInspector task={selected} areas={areas} projects={projects} tags={tags} onTagsChanged={setTags} onClose={() => setSelectedTaskId(null)} onUpdated={updateTask} onTasksRemoved={handleTasksRemoved} /></motion.div>}</AnimatePresence>
    </div>
    <motion.button type="button" className={[styles.fab, selected ? styles.fabWithInspector : ''].filter(Boolean).join(' ')} onClick={() => openCreate()} aria-label="Add task" title="Add task (Ctrl+N)" whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} transition={{ duration: duration.fast, ease }}><span><PlusIcon /></span></motion.button>
    <TaskCreateSheet open={createOpen} selection={createTarget ?? selection} searching={!createTarget && !!searchQuery.trim()} areas={areas} projects={projects} onClose={closeCreate} onCreated={(task, destination) => { updateTask(task); setSearchQuery(''); if (!createTarget) setSelection(destination); setSelectedTaskId(task.id); }} />
  </div>;
}
