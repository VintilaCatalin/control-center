import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { addTask, deleteTask, editTask, pinTask, toggleTask } from '../../api/actions/tasks';
import type { TaskEntry } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import styles from './TasksPanel.module.css';

function CheckIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l.9-4L17 3.9a1.7 1.7 0 0 1 2.4 0l.7.7a1.7 1.7 0 0 1 0 2.4L8 19l-4 1z" />
      <path d="M15 5.5L18.5 9" />
    </svg>
  );
}

const PRIORITIES: { id: TaskEntry['priority']; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
];

function PriorityPicker({
  value,
  onChange,
}: {
  value: TaskEntry['priority'];
  onChange: (p: TaskEntry['priority']) => void;
}) {
  return (
    <div className={styles.priorityPicker}>
      {PRIORITIES.map((p) => (
        <button
          key={p.id}
          type="button"
          className={[styles.priorityDot, styles[`priority-${p.id}`], value === p.id ? styles.priorityActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(p.id)}
          title={`${p.label} priority`}
          aria-pressed={value === p.id}
        />
      ))}
    </div>
  );
}

// A small action-oriented task layer, not a project manager - quick
// creation, completion, a 3-state priority dot instead of a field-heavy
// form, and pinning for quick access. Global, not Notes-specific (see
// shell/GlobalUtilities' Quick Tasks popover) - reads/writes the tasks
// list live off the shared snapshot poll, same as everything else in
// the app, so it stays in sync wherever it's opened from.
export function TasksPanel({ tasks }: { tasks: TaskEntry[] }) {
  const [draft, setDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [priority, setPriority] = useState<TaskEntry['priority']>('normal');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function handleAdd() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await addTask(text, priority, notesDraft.trim() || undefined);
      if (res.ok) {
        setDraft('');
        setNotesDraft('');
        setPriority('normal');
      }
    } finally {
      setBusy(false);
    }
  }

  // Enter in the single-line title always submits - there's no
  // multi-line concern there. Shift+Enter is meaningless on an <input>
  // anyway; it only matters in the description textarea below, where
  // plain Enter has to stay a newline (see its own onKeyDown).
  function handleTitleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd();
  }

  // Enter always inserts a newline here (a description is inherently
  // multi-line) - Ctrl/Cmd+Enter is the explicit "I'm done" shortcut,
  // same convention as chat composers, so submitting from the
  // description never requires reaching for the mouse.
  function handleNotesKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.addBlock}>
        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.input}
            placeholder="Add a quick task…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleTitleKeyDown}
          />
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>

        {/* Always present, not hidden behind a toggle - compact by
            default (2 rows), grows as you type. */}
        <textarea
          className={styles.notesInput}
          placeholder="Add a couple lines of detail (optional)…"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onKeyDown={handleNotesKeyDown}
          rows={2}
        />

        <div className={styles.addFooter}>
          <span className={styles.addHint}>Enter to add · ⌘/Ctrl+Enter from the description</span>
          <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!draft.trim() || busy}>
            Add task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className={styles.empty}>No tasks yet.</div>
      ) : (
        <div className={styles.scroll}>
          {open.length > 0 && <TaskGroup tasks={open} editingId={editingId} setEditingId={setEditingId} />}
          {done.length > 0 && <TaskGroup tasks={done} muted editingId={editingId} setEditingId={setEditingId} />}
        </div>
      )}
    </div>
  );
}

interface TaskGroupProps {
  tasks: TaskEntry[];
  muted?: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

function TaskGroup({ tasks, muted, editingId, setEditingId }: TaskGroupProps) {
  return (
    <div className={muted ? styles.doneGroup : undefined}>
      <AnimatePresence initial={false}>
        {tasks.map((t) =>
          editingId === t.id ? (
            <TaskEditRow key={t.id} task={t} onDone={() => setEditingId(null)} />
          ) : (
            <TaskRow key={t.id} task={t} onEdit={() => setEditingId(t.id)} />
          ),
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskRow({ task: t, onEdit }: { task: TaskEntry; onEdit: () => void }) {
  // Optimistic completion - the checkbox has to flip the instant you
  // click it, not ~2-3s later once the next snapshot poll confirms the
  // toggle. `pending` shadows `t.done` locally until either the poll
  // catches up (cleared below) or the request fails (reverted, with a
  // brief error flash instead of silently snapping back).
  const [pending, setPending] = useState<{ done: boolean; failed?: boolean } | null>(null);
  const displayedDone = pending ? pending.done : t.done;

  useEffect(() => {
    if (pending && !pending.failed && t.done === pending.done) setPending(null);
  }, [t.done, pending]);

  async function handleToggle(checked: boolean) {
    setPending({ done: checked });
    try {
      const res = await toggleTask(t.id, checked);
      if (!res.ok) throw new Error('toggle failed');
    } catch {
      setPending({ done: t.done, failed: true });
      setTimeout(() => setPending((p) => (p?.failed ? null : p)), 1600);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: duration.fast, ease }}
      className={styles.task}
    >
      <label className={styles.taskLabel}>
        <input
          type="checkbox"
          className={styles.checkboxInput}
          checked={displayedDone}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span className={[styles.checkboxBox, pending?.failed ? styles.checkboxError : ''].filter(Boolean).join(' ')}>
          <CheckIcon />
        </span>
        <span className={[styles.priorityBadge, styles[`priority-${t.priority}`]].join(' ')} />
        <span className={styles.taskTextCol}>
          <span className={displayedDone ? styles.taskTextDone : styles.taskText}>{t.text}</span>
          {/* Always visible when present - no expand/collapse, title
              stays primary via size/weight, description secondary via
              the dimmer footnote tone below. */}
          {t.notes && <span className={styles.taskNotes}>{t.notes}</span>}
        </span>
      </label>
      {/* Hover-revealed only - the row stays quiet at rest. */}
      <div className={styles.taskActions}>
        <button type="button" className={styles.taskIconBtn} onClick={onEdit} title="Edit">
          <EditIcon />
        </button>
        <button
          type="button"
          className={[styles.taskIconBtn, t.pinned ? styles.taskIconBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => pinTask(t.id, !t.pinned)}
          title={t.pinned ? 'Unpin' : 'Pin'}
        >
          <StarIcon filled={t.pinned} />
        </button>
        <button type="button" className={styles.taskIconBtn} onClick={() => deleteTask(t.id)} title="Delete">
          <TrashIcon />
        </button>
      </div>
    </motion.div>
  );
}

function TaskEditRow({ task: t, onDone }: { task: TaskEntry; onDone: () => void }) {
  const [text, setText] = useState(t.text);
  const [notes, setNotes] = useState(t.notes ?? '');
  const [priority, setPriority] = useState<TaskEntry['priority']>(t.priority);
  const [pinned, setPinned] = useState(t.pinned);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const res = await editTask(t.id, { text: clean, priority, notes: notes.trim(), pinned });
      if (res.ok) onDone();
    } finally {
      setBusy(false);
    }
  }

  function handleTitleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onDone();
  }

  function handleNotesKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') onDone();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: duration.fast, ease }}
      className={styles.taskEdit}
    >
      <div className={styles.editRow}>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          type="text"
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          autoFocus
        />
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>

      <textarea
        className={styles.notesInput}
        placeholder="Add a couple lines of detail (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={handleNotesKeyDown}
        rows={2}
      />

      <div className={styles.editFooter}>
        <button
          type="button"
          className={[styles.pinToggle, pinned ? styles.pinToggleActive : ''].filter(Boolean).join(' ')}
          onClick={() => setPinned((v) => !v)}
        >
          <StarIcon filled={pinned} />
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        <div className={styles.editActions}>
          <button type="button" className={styles.cancelBtn} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className={styles.addBtn} onClick={handleSave} disabled={!text.trim() || busy}>
            Save
          </button>
        </div>
      </div>
    </motion.div>
  );
}
