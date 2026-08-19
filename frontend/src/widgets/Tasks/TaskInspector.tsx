import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { addTag, deleteTask, editTask, restoreTask, setTaskTags, toggleTask, type RecurrenceScope } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TagEntry, TaskEntry, TaskRecurrence } from '../../api/types';
import { DatePicker } from '../../primitives/DatePicker/DatePicker';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { formatTaskDate, taskHome } from './taskViews';
import { CheckIcon } from './TaskRow';
import styles from './TaskInspector.module.css';

function Icon({ path }: { path: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

interface TaskInspectorProps {
  task: TaskEntry;
  areas: AreaEntry[];
  projects: ProjectEntry[];
  tags: TagEntry[];
  onTagsChanged: (tags: TagEntry[]) => void;
  onClose: () => void;
  onUpdated: (task: TaskEntry) => void;
  onTasksRemoved: (ids: string[]) => void;
}

export function TaskInspector({ task, areas, projects, tags, onTagsChanged, onClose, onUpdated, onTasksRemoved }: TaskInspectorProps) {
  const { push } = useToast();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [picker, setPicker] = useState<{ kind: 'schedule' | 'deadline'; x: number; y: number } | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [editScope, setEditScope] = useState<RecurrenceScope>('occurrence');
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [customInterval, setCustomInterval] = useState(2);
  const [customUnit, setCustomUnit] = useState<TaskRecurrence['unit']>('weeks');
  const [deleteChoicesOpen, setDeleteChoicesOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const done = task.status === 'completed';

  useEffect(() => { setTitle(task.title); setNotes(task.notes ?? ''); }, [task.id, task.title, task.notes]);
  useEffect(() => { setEditScope('occurrence'); setRecurrenceOpen(false); setDeleteChoicesOpen(false); }, [task.id]);
  useEffect(() => {
    if (task.recurrence?.frequency !== 'custom') return;
    setCustomInterval(task.recurrence.interval);
    setCustomUnit(task.recurrence.unit);
  }, [task.recurrence]);
  useEffect(() => {
    const field = notesRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(108, field.scrollHeight)}px`;
  }, [notes]);

  async function update(fields: Parameters<typeof editTask>[1]) {
    const result = await editTask(task.id, fields, editScope);
    if (result.ok && result.task) onUpdated(result.task);
    else push(result.error ?? 'Could not update task', 'error');
  }

  async function saveText() {
    const clean = title.trim();
    if (!clean) { setTitle(task.title); return; }
    if (clean !== task.title || notes.trim() !== (task.notes ?? '')) await update({ title: clean, notes: notes.trim() });
  }

  async function handleToggle() {
    const result = await toggleTask(task.id, !done);
    if (result.ok && result.task) {
      onUpdated(result.task);
      if (result.next_task) onUpdated(result.next_task);
      if (result.removed_ids.length) onTasksRemoved(result.removed_ids);
    }
  }

  async function handleDelete(scope: RecurrenceScope = 'occurrence') {
    const removed = task;
    const result = await deleteTask(task.id, scope);
    if (!result.ok) { push(result.error ?? 'Could not delete task', 'error'); return; }
    onTasksRemoved(result.affected_ids.length ? result.affected_ids : [task.id]);
    if (result.next_task) onUpdated(result.next_task);
    if (task.recurrence_series_id) {
      push(scope === 'series' ? 'Future recurring tasks removed' : 'Occurrence removed', 'info');
      return;
    }
    push('Task moved out of sight', 'info', { label: 'Undo', onClick: async () => {
      const restored = await restoreTask(removed.id);
      if (restored.ok && restored.task) onUpdated(restored.task);
    } });
  }

  async function assignTags(tagIds: string[]) {
    setTagBusy(true);
    try {
      const result = await setTaskTags(task.id, tagIds, editScope);
      if (!result.ok || !result.task) throw new Error(result.error || 'Could not update tags');
      onUpdated(result.task);
    } catch (error) { push(error instanceof Error ? error.message : 'Could not update tags', 'error'); }
    finally { setTagBusy(false); }
  }

  async function createTag() {
    const name = tagDraft.trim();
    if (!name || tagBusy) return;
    setTagBusy(true);
    try {
      const result = await addTag(name);
      if (!result.ok || !result.tag) throw new Error(result.error || 'Could not create tag');
      if (!tags.some((tag) => tag.id === result.tag!.id)) onTagsChanged([...tags, result.tag]);
      const ids = [...new Set([...task.tags.map((tag) => tag.id), result.tag.id])];
      const assigned = await setTaskTags(task.id, ids, editScope);
      if (!assigned.ok || !assigned.task) throw new Error(assigned.error || 'Could not assign tag');
      onUpdated(assigned.task); setTagDraft('');
    } catch (error) { push(error instanceof Error ? error.message : 'Could not create tag', 'error'); }
    finally { setTagBusy(false); }
  }

  function openPicker(kind: 'schedule' | 'deadline', event: MouseEvent<HTMLButtonElement>) {
    setPicker({ kind, x: event.clientX - 150, y: event.clientY + 12 });
  }

  const homeValue = task.project_id ? `project:${task.project_id}` : task.area_id ? `area:${task.area_id}` : 'inbox';
  const home = taskHome(task, areas, projects);
  const recurrenceLabel = task.recurrence ? task.recurrence.frequency === 'custom' ? `Every ${task.recurrence.interval} ${task.recurrence.interval === 1 ? task.recurrence.unit.slice(0, -1) : task.recurrence.unit}` : task.recurrence.frequency[0].toUpperCase() + task.recurrence.frequency.slice(1) : 'Does not repeat';

  async function setRecurrence(recurrence: Parameters<typeof editTask>[1]['recurrence']) {
    const result = await editTask(task.id, { recurrence }, task.recurrence_series_id ? 'series' : 'occurrence');
    if (result.ok && result.task) {
      onUpdated(result.task);
      setRecurrenceOpen(false);
    } else push(result.error ?? 'Could not update recurrence', 'error');
  }

  return <aside className={styles.inspector} aria-label="Task details">
    <header className={styles.topbar}>
      <span className={styles.eyebrow}>{done ? 'Completed task' : 'Task details'}</span>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close task details">×</button>
    </header>

    <div className={styles.scroll}>
      <div className={styles.titleBlock}>
        <button type="button" className={[styles.heroCheck, done ? styles.heroCheckDone : ''].filter(Boolean).join(' ')} onClick={handleToggle} aria-label={done ? 'Reopen task' : 'Complete task'}><CheckIcon /></button>
        <textarea className={styles.title} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveText} rows={2} aria-label="Task title" />
      </div>
      <textarea ref={notesRef} className={styles.notes} value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={saveText} placeholder="Add notes…" rows={5} aria-label="Task notes" />

      {task.recurrence_series_id && <div className={styles.editScope}>
        <span>Apply edits to</span>
        <div className={styles.scopeSegmented} role="group" aria-label="Recurring task edit scope">
          <button type="button" className={editScope === 'occurrence' ? styles.scopeActive : ''} onClick={() => setEditScope('occurrence')}>This task</button>
          <button type="button" className={editScope === 'series' ? styles.scopeActive : ''} onClick={() => setEditScope('series')}>Future series</button>
        </div>
      </div>}

      <div className={styles.properties}>
        <label className={styles.property}>
          <span className={styles.propertyIcon}><Icon path="M4 7h16M7 3v4M17 3v4M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></span>
          <span className={styles.propertyLabel}>Do on</span>
          <button type="button" className={[styles.propertyValue, task.scheduled_on ? styles.valueSet : ''].filter(Boolean).join(' ')} onClick={(event) => openPicker('schedule', event)} title="Choose when you want to work on this task" aria-label="Choose when to work on this task">{task.scheduled_on ? formatTaskDate(task.scheduled_on) : 'Not scheduled'}</button>
        </label>
        <label className={styles.property}>
          <span className={styles.propertyIcon}><Icon path="M6 3v18M6 5h11l-2 4 2 4H6" /></span>
          <span className={styles.propertyLabel}>Due by</span>
          <button type="button" className={[styles.propertyValue, task.deadline_on ? styles.deadlineSet : ''].filter(Boolean).join(' ')} onClick={(event) => openPicker('deadline', event)} title="Set when this task must be finished" aria-label="Set when this task must be finished">{task.deadline_on ? formatTaskDate(task.deadline_on) : 'No deadline'}</button>
        </label>
        <label className={styles.property}>
          <span className={styles.propertyIcon}><Icon path="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9M9 19v-6h6v6" /></span>
          <span className={styles.propertyLabel}>Home</span>
          <select className={styles.select} value={homeValue} onChange={(event) => {
            const [kind, id] = event.target.value.split(':');
            if (kind === 'project') update({ project_id: id, area_id: null });
            else if (kind === 'area') update({ area_id: id, project_id: null });
            else update({ area_id: null, project_id: null });
          }} aria-label="Task home">
            <option value="inbox">Inbox</option>
            {areas.map((area) => <option key={area.id} value={`area:${area.id}`}>Area · {area.title}</option>)}
            {projects.map((project) => <option key={project.id} value={`project:${project.id}`}>Project · {project.title}</option>)}
          </select>
        </label>
        <div className={styles.property}>
          <span className={styles.propertyIcon}><Icon path="M12 3v18M5 7h10.5a3.5 3.5 0 0 1 0 7H8.5a3.5 3.5 0 0 0 0 7H19" /></span>
          <span className={styles.propertyLabel}>Priority</span>
          <div className={styles.segmented}>{(['normal', 'low', 'high'] as const).map((priority) => <button key={priority} type="button" className={task.priority === priority ? styles.segmentActive : ''} onClick={() => update({ priority })}>{priority === 'normal' ? 'None' : priority[0].toUpperCase() + priority.slice(1)}</button>)}</div>
        </div>
        <button type="button" className={styles.property} onClick={() => setTagsOpen((value) => !value)} aria-expanded={tagsOpen}>
          <span className={styles.propertyIcon}><Icon path="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.83 0l-6.37-6.37a2 2 0 0 1 0-2.83l8-8A2 2 0 0 1 12.83 3H19a1 1 0 0 1 1 1v6.17a2 2 0 0 1-.4 1.43ZM16 8h.01" /></span>
          <span className={styles.propertyLabel}>Tags</span>
          <span className={styles.tagSummary}>{task.tags.length ? task.tags.map((tag) => tag.name).join(', ') : 'None'}</span>
        </button>
        {tagsOpen && <div className={styles.tagEditor}>
          {tags.length > 0 && <div className={styles.tagOptions}>{tags.map((tag) => {
            const assigned = task.tags.some((item) => item.id === tag.id);
            return <button key={tag.id} type="button" className={assigned ? styles.tagAssigned : ''} onClick={() => assignTags(assigned ? task.tags.filter((item) => item.id !== tag.id).map((item) => item.id) : [...task.tags.map((item) => item.id), tag.id])} disabled={tagBusy}><span>{assigned ? '✓' : ''}</span>{tag.name}</button>;
          })}</div>}
          <div className={styles.tagCreate}><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createTag(); }} placeholder="New tag" aria-label="New tag name" /><button type="button" onClick={createTag} disabled={!tagDraft.trim() || tagBusy}>Add</button></div>
        </div>}
        <button type="button" className={styles.property} onClick={() => setRecurrenceOpen((value) => !value)} aria-expanded={recurrenceOpen}>
          <span className={styles.propertyIcon}><Icon path="M17.5 6.5A7 7 0 0 0 5 9M5 9V4M5 9h5M6.5 17.5A7 7 0 0 0 19 15M19 15v5M19 15h-5" /></span>
          <span className={styles.propertyLabel}>Repeat</span>
          <span className={[styles.tagSummary, task.recurrence ? styles.valueSet : ''].filter(Boolean).join(' ')}>{recurrenceLabel}</span>
        </button>
        {recurrenceOpen && <div className={styles.recurrenceEditor}>
          <div className={styles.recurrencePresets}>
            <button type="button" className={!task.recurrence ? styles.recurrenceActive : ''} onClick={() => void setRecurrence(null)}>Never</button>
            {(['daily', 'weekly', 'monthly'] as const).map((frequency) => <button key={frequency} type="button" className={task.recurrence?.frequency === frequency ? styles.recurrenceActive : ''} onClick={() => void setRecurrence({ frequency })}>{frequency[0].toUpperCase() + frequency.slice(1)}</button>)}
          </div>
          <div className={styles.customRecurrence}>
            <span>Every</span>
            <input type="number" min="1" max="365" value={customInterval} onChange={(event) => setCustomInterval(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} aria-label="Custom recurrence interval" />
            <select value={customUnit} onChange={(event) => setCustomUnit(event.target.value as TaskRecurrence['unit'])} aria-label="Custom recurrence unit"><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select>
            <button type="button" onClick={() => void setRecurrence({ frequency: 'custom', interval: customInterval, unit: customUnit })}>Apply</button>
          </div>
          <p>New occurrences follow the planned date, even when you complete one late.</p>
        </div>}
        <button type="button" className={styles.property} onClick={() => update({ someday: !task.someday, scheduled_on: task.someday ? task.scheduled_on : null })}>
          <span className={styles.propertyIcon}><Icon path="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></span>
          <span className={styles.propertyLabel}>Someday</span>
          <span className={[styles.switch, task.someday ? styles.switchOn : ''].filter(Boolean).join(' ')}><span /></span>
        </button>
      </div>

      <div className={styles.context}>{home ? `Filed in ${home.label}` : 'Unfiled · Inbox'}<span>Created {new Date(task.created_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
      {deleteChoicesOpen && <div className={styles.deleteChoices} role="group" aria-label="Delete recurring task">
        <strong>Remove recurring task</strong>
        <span>{done ? 'Keep this completed record, or stop the future series.' : 'Skip only this occurrence, or stop the entire future series.'}</span>
        <div><button type="button" onClick={() => void handleDelete('occurrence')}>{done ? 'Delete this record' : 'This occurrence'}</button><button type="button" onClick={() => void handleDelete('series')}>Future series</button><button type="button" onClick={() => setDeleteChoicesOpen(false)}>Cancel</button></div>
      </div>}
    </div>
    <footer className={styles.footer}>
      <button type="button" className={[styles.pinButton, task.pinned ? styles.pinActive : ''].filter(Boolean).join(' ')} onClick={() => void update({ pinned: !task.pinned })}><Icon path="m14.3 3 6.7 6.7-2.4 2.4-1.2-1.2-3.5 3.5.5 3.2-1.5 1.5-3.7-3.7L5 19.6l-1-1 4.2-4.2-3.7-3.7L6 9.2l3.2.5 3.5-3.5L11.9 5 14.3 3Z" />{task.pinned ? 'Pinned' : 'Pin'}</button>
      <button type="button" className={styles.deleteButton} onClick={() => task.recurrence_series_id ? setDeleteChoicesOpen(true) : void handleDelete()}>Delete</button>
    </footer>

    <DatePicker open={!!picker} x={picker?.x ?? 0} y={picker?.y ?? 0} value={picker?.kind === 'schedule' ? task.scheduled_on ?? null : task.deadline_on ?? null} intent={picker?.kind ?? 'schedule'} onChange={(value) => update(picker?.kind === 'schedule' ? { scheduled_on: value, someday: false } : { deadline_on: value })} onClose={() => setPicker(null)} />
  </aside>;
}
