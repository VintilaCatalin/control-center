import { useState } from 'react';
import { NotesGlance } from './NotesGlance';
import { TasksGlance } from './TasksGlance';
import styles from './NotesTasksGlance.module.css';

function TasksIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

type Tab = 'tasks' | 'notes';

// One panel, two tabs - both are genuinely useful glances, but neither
// needs the whole panel to itself, and tabbing keeps both a click away
// instead of splitting Overview's limited real estate between two
// smaller boxes. Each tab keeps its own real header action (Tasks'
// "View all", Notes' "Open Notes") - only the icon+title row is shared.
export function NotesTasksGlance() {
  const [tab, setTab] = useState<Tab>('tasks');

  return (
    <div className={styles.glance}>
      <div className={styles.tabs}>
        <button type="button" className={[styles.tab, tab === 'tasks' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('tasks')}>
          <TasksIcon /> Tasks
        </button>
        <button type="button" className={[styles.tab, tab === 'notes' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('notes')}>
          <NotesIcon /> Notes
        </button>
      </div>

      <div className={styles.body}>{tab === 'tasks' ? <TasksGlance hideHeader /> : <NotesGlance hideHeader />}</div>
    </div>
  );
}
