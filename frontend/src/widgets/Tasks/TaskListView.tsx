import { AnimatePresence } from 'framer-motion';
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { addTask, deleteTask, editTask, type TaskCreateFields } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { DatePicker } from '../../primitives/DatePicker/DatePicker';
import { PriorityPicker, TaskEditRow, TaskRow } from './TaskRow';
import { formatDue, homeLabel, tasksForSelection, type Selection, type SmartViewId } from './taskViews';
import styles from './TaskListView.module.css';

const TITLES: Record<SmartViewId, { title: string; hint?: string }> = {
  inbox: { title: 'Inbox', hint: 'Capture now, file it later - drag nothing lands here for good.' },
  today: { title: 'Today' },
  upcoming: { title: 'Upcoming', hint: 'Give a task a date (from its edit view) to see it here.' },
  anytime: { title: 'Anytime' },
  someday: { title: 'Someday' },
  logbook: { title: 'Logbook' },
};

function creationFields(sel: Selection): TaskCreateFields {
  if (sel.kind === 'project') return { project_id: sel.id };
  if (sel.kind === 'area') return { area_id: sel.id };
  if (sel.kind === 'smart' && sel.id === 'today') return { when: 'today' };
  if (sel.kind === 'smart' && sel.id === 'someday') return { when: 'someday' };
  return {};
}

interface TaskListViewProps {
  selection: Selection;
  tasks: TaskEntry[];
  areas: AreaEntry[];
  projects: ProjectEntry[];
}

export function TaskListView({ selection, tasks, areas, projects }: TaskListViewProps) {
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState<TaskEntry['priority']>('normal');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<{ x: number; y: number; taskId: string | null } | null>(null);

  const filtered = useMemo(() => tasksForSelection(selection, tasks, projects), [selection, tasks, projects]);

  const project = selection.kind === 'project' ? projects.find((p) => p.id === selection.id) : null;
  const area = selection.kind === 'area' ? areas.find((a) => a.id === selection.id) : null;
  const heading = project?.label ?? area?.label ?? (selection.kind === 'smart' ? TITLES[selection.id].title : '');
  const hint = selection.kind === 'smart' ? TITLES[selection.id].hint : project?.notes;

  const canCompose = !(selection.kind === 'smart' && (selection.id === 'upcoming' || selection.id === 'logbook'));

  const open = filtered.filter((t) => !t.done);
  const done = filtered.filter((t) => t.done);
  const openCount = open.length;
  const doneCount = done.length;

  async function handleAdd() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const fields = { ...creationFields(selection), deadline };
      const res = await addTask(text, priority, undefined, fields);
      if (res.ok) {
        setDraft('');
        setPriority('normal');
        setDeadline(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleTitleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd();
  }

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{heading}</h1>
        {project && (
          <div className={styles.progress}>
            <span className={styles.progressLabel}>
              {openCount} open · {doneCount} done
            </span>
            {openCount + doneCount > 0 && (
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ width: `${(doneCount / (openCount + doneCount)) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        {hint && !project && <p className={styles.hint}>{hint}</p>}
      </div>

      {canCompose && (
        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.addInput}
            placeholder="New to-do…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleTitleKeyDown}
          />
          <PriorityPicker value={priority} onChange={setPriority} />
          <button
            type="button"
            className={[styles.dueBtn, deadline ? styles.dueBtnSet : ''].filter(Boolean).join(' ')}
            onClick={(e) => setDatePickerFor({ x: e.clientX, y: e.clientY, taskId: null })}
          >
            {deadline ? formatDue(deadline) : 'Date'}
          </button>
          <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!draft.trim() || busy}>
            Add
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.empty}>Nothing here.</div>
      ) : (
        <div className={styles.scroll}>
          <AnimatePresence initial={false}>
            {open.map((t) =>
              editingId === t.id ? (
                <TaskEditRow
                  key={t.id}
                  task={t}
                  onDone={() => setEditingId(null)}
                  onDelete={async () => {
                    await deleteTask(t.id);
                    setEditingId(null);
                  }}
                />
              ) : (
                <TaskRow
                  key={t.id}
                  task={t}
                  onEdit={() => setEditingId(t.id)}
                  homeLabel={selection.kind === 'smart' ? homeLabel(t, areas, projects) : null}
                  onDeadlineClick={(e) => setDatePickerFor({ x: e.clientX, y: e.clientY, taskId: t.id })}
                />
              ),
            )}
          </AnimatePresence>
          {done.length > 0 && (
            <div className={styles.doneGroup}>
              <AnimatePresence initial={false}>
                {done.map((t) =>
                  editingId === t.id ? (
                    <TaskEditRow
                      key={t.id}
                      task={t}
                      onDone={() => setEditingId(null)}
                      onDelete={async () => {
                        await deleteTask(t.id);
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <TaskRow key={t.id} task={t} onEdit={() => setEditingId(t.id)} homeLabel={selection.kind === 'smart' ? homeLabel(t, areas, projects) : null} />
                  ),
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <DatePicker
        open={!!datePickerFor}
        x={datePickerFor?.x ?? 0}
        y={datePickerFor?.y ?? 0}
        value={datePickerFor?.taskId ? (tasks.find((t) => t.id === datePickerFor.taskId)?.deadline ?? null) : deadline}
        onChange={(ts) => {
          if (datePickerFor?.taskId) {
            editTask(datePickerFor.taskId, { deadline: ts });
          } else {
            setDeadline(ts);
          }
        }}
        onClose={() => setDatePickerFor(null)}
      />
    </div>
  );
}
