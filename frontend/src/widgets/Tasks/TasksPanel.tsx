import { AnimatePresence } from 'framer-motion';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { addTask, deleteTask } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { TaskEditRow, TaskRow } from './TaskRow';
import { homeLabel, tasksForSmartView } from './taskViews';
import styles from './TasksPanel.module.css';

interface TasksPanelProps {
  tasks: TaskEntry[];
  areas: AreaEntry[];
  projects: ProjectEntry[];
}

// The global Quick Tasks popover's content - title-only capture that
// always lands in Inbox (Things' own "Magic Add": zero decisions at
// capture time, priority/notes/filing/dates all happen later in the real
// Tasks section via TaskListView, not here). Shows the current Inbox as a
// short list underneath so capturing still feels like it went somewhere,
// not a text field into a void.
export function TasksPanel({ tasks, areas, projects }: TasksPanelProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const inbox = tasksForSmartView('inbox', tasks);

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

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="Add to Inbox…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button type="button" className={styles.addBtn} onClick={handleAdd} disabled={!draft.trim() || busy}>
          Add
        </button>
      </div>

      {inbox.length === 0 ? (
        <div className={styles.empty}>Inbox is empty - capture something and file it later in Tasks.</div>
      ) : (
        <div className={styles.scroll}>
          <AnimatePresence initial={false}>
            {inbox.map((t) =>
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
                <TaskRow key={t.id} task={t} onEdit={() => setEditingId(t.id)} homeLabel={homeLabel(t, areas, projects)} />
              ),
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
