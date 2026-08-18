import { useState, type CSSProperties } from 'react';
import { addTask, toggleTask } from '../../api/actions/tasks';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { TaskEntry } from '../../api/types';
import { Overlay } from '../../primitives/Overlay/Overlay';
import { TasksPanel } from '../Tasks/TasksPanel';
import styles from './TasksGlance.module.css';

function TasksIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" />
    </svg>
  );
}

// A glance, not a second Tasks app - pinned-first, open tasks only, a
// tactile checkbox row with a real priority-coloured edge (no picker/
// notes/edit chrome, that's what "View all" is for). A small completion
// ring instead of plain text for "how am I doing today" - the same
// radial-progress register This PC's gauges use, for visual consistency
// across Overview's utility panels. Its own independent
// <Overlay><TasksPanel/></Overlay> instance for the full view - the same
// self-contained modal pattern GlobalUtilities' Quick Tasks already
// uses, just a second entry point onto the same backend data.
export function TasksGlance({ hideHeader }: { hideHeader?: boolean } = {}) {
  const { snapshot } = useSnapshotData();
  const tasks = snapshot?.tasks?.tasks ?? [];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewAllOpen, setViewAllOpen] = useState(false);

  const open = tasks.filter((t) => !t.done);
  const pinned = open.filter((t) => t.pinned).slice(0, 4);
  const pinnedIds = new Set(pinned.map((t) => t.id));
  const rest = open.filter((t) => !pinnedIds.has(t.id)).slice(0, 6 - pinned.length);
  const doneCount = tasks.filter((t) => t.done).length;
  const donePct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  async function handleAdd() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await addTask(text);
      if (res.ok) setDraft('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.glance}>
      <div className={styles.head}>
        {!hideHeader && (
          <span className={styles.heading}>
            <TasksIcon /> Tasks
          </span>
        )}
        <button type="button" className={styles.viewAll} onClick={() => setViewAllOpen(true)}>
          View all
        </button>
      </div>

      {tasks.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.ring} style={{ '--pct': donePct } as CSSProperties} />
          <span className={styles.summaryText}>
            {doneCount} of {tasks.length} done{pinned.length > 0 ? ` · ${pinned.length} pinned` : ''}
          </span>
        </div>
      )}

      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="Quick add…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
      </div>

      {open.length === 0 ? (
        <div className={styles.empty}>Nothing on your plate.</div>
      ) : (
        <div className={styles.lists}>
          {pinned.length > 0 && (
            <div className={styles.group}>
              <span className={styles.groupLabel}>Pinned</span>
              <div className={styles.list}>
                {pinned.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div className={styles.group}>
              {pinned.length > 0 && <span className={styles.groupLabel}>Open</span>}
              <div className={styles.list}>
                {rest.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Overlay open={viewAllOpen} onClose={() => setViewAllOpen(false)} title="Quick Tasks" icon={<TasksIcon />}>
        <TasksPanel tasks={tasks} />
      </Overlay>
    </div>
  );
}

function TaskRow({ task }: { task: TaskEntry }) {
  const [pending, setPending] = useState(false);

  function handleToggle() {
    setPending(true);
    toggleTask(task.id, true).catch(() => setPending(false));
  }

  return (
    <button type="button" className={[styles.row, styles[`priority-${task.priority}`]].join(' ')} onClick={handleToggle} disabled={pending}>
      <span className={styles.checkbox}>{pending && <CheckIcon />}</span>
      <span className={styles.text}>{task.text}</span>
      {task.pinned && (
        <span className={styles.pinStar}>
          <StarIcon />
        </span>
      )}
    </button>
  );
}
