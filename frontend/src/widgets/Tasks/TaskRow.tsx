import { motion } from 'framer-motion';
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { ReactNode } from 'react';
import { editTask, pinTask, toggleTask, type TaskEditFields } from '../../api/actions/tasks';
import type { TaskEntry } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { formatDue } from './taskViews';
import styles from './TaskRow.module.css';

export function CheckIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l.9-4L17 3.9a1.7 1.7 0 0 1 2.4 0l.7.7a1.7 1.7 0 0 1 0 2.4L8 19l-4 1z" />
      <path d="M15 5.5L18.5 9" />
    </svg>
  );
}

export const PRIORITIES: { id: TaskEntry['priority']; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
];

export function PriorityPicker({
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

interface TaskRowProps {
  task: TaskEntry;
  onEdit: () => void;
  // Where this task lives, already resolved to a display label by the
  // caller (TaskRow itself never looks up areas/projects) - shown only in
  // views where a task's home isn't already implied by the selection
  // (smart views, Inbox), not inside a project's own task list.
  homeLabel?: string | null;
  onDeadlineClick?: (e: ReactMouseEvent) => void;
}

export function TaskRow({ task: t, onEdit, homeLabel, onDeadlineClick }: TaskRowProps) {
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

  const now = Date.now() / 1000;
  const overdue = !!t.deadline && t.deadline < now && !displayedDone;

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
          {t.notes && <span className={styles.taskNotes}>{t.notes}</span>}
          {(homeLabel || t.deadline) && (
            <span className={styles.taskMeta}>
              {homeLabel && <span className={styles.taskHome}>{homeLabel}</span>}
              {t.deadline && (
                <button
                  type="button"
                  className={[styles.dueChip, overdue ? styles.dueChipOverdue : ''].filter(Boolean).join(' ')}
                  onClick={(e) => {
                    e.preventDefault();
                    onDeadlineClick?.(e);
                  }}
                >
                  {formatDue(t.deadline)}
                </button>
              )}
            </span>
          )}
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
      </div>
    </motion.div>
  );
}

interface TaskEditRowProps {
  task: TaskEntry;
  onDone: () => void;
  onDelete: () => void;
  // Extra fields (project/area/when/deadline) the caller wants editable
  // inline - omitted entirely in contexts (e.g. Quick Capture) that only
  // ever deal with title/priority/notes.
  extra?: (fields: { text: string; notes: string; priority: TaskEntry['priority'] }, save: (patch: TaskEditFields) => void) => ReactNode;
}

export function TaskEditRow({ task: t, onDone, onDelete, extra }: TaskEditRowProps) {
  const [text, setText] = useState(t.text);
  const [notes, setNotes] = useState(t.notes ?? '');
  const [priority, setPriority] = useState<TaskEntry['priority']>(t.priority);
  const [pinned, setPinned] = useState(t.pinned);
  const [busy, setBusy] = useState(false);
  const [extraPatch, setExtraPatch] = useState<TaskEditFields>({});

  async function handleSave() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const res = await editTask(t.id, { text: clean, priority, notes: notes.trim(), pinned, ...extraPatch });
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

      {extra?.({ text, notes, priority }, (patch) => setExtraPatch((p) => ({ ...p, ...patch })))}

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
          <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Delete">
            <TrashIcon />
          </button>
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
