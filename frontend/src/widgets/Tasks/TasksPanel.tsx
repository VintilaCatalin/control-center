import { AnimatePresence, motion } from 'framer-motion';
import { useState, type KeyboardEvent } from 'react';
import { addTask, toggleTask } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { tasksForSmartView } from './taskViews';
import { CheckIcon } from './TaskRow';
import styles from './TasksPanel.module.css';

interface Props { tasks: TaskEntry[]; areas: AreaEntry[]; projects: ProjectEntry[] }

export function TasksPanel({ tasks }: Props) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const inbox = tasksForSmartView('inbox', tasks).filter((task) => !hidden.has(task.id));

  async function create() {
    const title = draft.trim(); if (!title || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await addTask(title);
      if (!result.ok) throw new Error(result.error || 'Task could not be created');
      setDraft('');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Task could not be created';
      setError(message); push(message, 'error');
    } finally { setBusy(false); }
  }

  async function complete(task: TaskEntry) {
    setHidden((value) => new Set(value).add(task.id));
    const result = await toggleTask(task.id, true);
    if (!result.ok) setHidden((value) => { const next = new Set(value); next.delete(task.id); return next; });
  }

  return <div className={styles.panel}>
    <div className={styles.intro}><span>Quick capture</span><strong>Inbox</strong></div>
    <div className={[styles.composer, error ? styles.composerFailed : ''].filter(Boolean).join(' ')}><span>+</span><input value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') create(); }} placeholder="What’s on your mind?" aria-invalid={!!error} autoFocus /><button type="button" onClick={create} disabled={!draft.trim() || busy}>{busy ? 'Adding…' : 'Add'}</button></div>
    {error && <span className={styles.error} role="alert">{error}</span>}
    <div className={styles.rule} />
    <div className={styles.scroll}>
      {inbox.length === 0 ? <div className={styles.empty}><span>✓</span><strong>Inbox clear</strong><p>Capture now. Organize later.</p></div> : <AnimatePresence initial={false}>{inbox.slice(0, 8).map((task) => <motion.div key={task.id} className={styles.row} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}><button type="button" onClick={() => complete(task)} aria-label={`Complete ${task.title}`}><CheckIcon /></button><span>{task.title}</span></motion.div>)}</AnimatePresence>}
    </div>
  </div>;
}
