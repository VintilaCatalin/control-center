import { motion } from 'framer-motion';
import type { DragEvent, MouseEvent } from 'react';
import type { TaskEntry } from '../../api/types';
import { formatTaskDate, localDateKey } from './taskViews';
import styles from './TaskRow.module.css';

export function CheckIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
}

function PinIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m14.3 3 6.7 6.7-2.4 2.4-1.2-1.2-3.5 3.5.5 3.2-1.5 1.5-3.7-3.7L5 19.6l-1-1 4.2-4.2-3.7-3.7L6 9.2l3.2.5 3.5-3.5L11.9 5 14.3 3Z" /></svg>;
}

interface TaskRowProps {
  task: TaskEntry;
  selected?: boolean;
  home?: string | null;
  onSelect: () => void;
  onToggle: (done: boolean) => void;
  reorderable?: boolean;
  dragging?: boolean;
  dropEdge?: 'before' | 'after' | null;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}

export function TaskRow({ task, selected, home, onSelect, onToggle, reorderable, dragging, dropEdge, onDragStart, onDragEnd, onDragOver, onDrop }: TaskRowProps) {
  const done = task.status === 'completed';
  const overdue = !!task.deadline_on && task.deadline_on < localDateKey() && !done;
  function toggle(event: MouseEvent) { event.stopPropagation(); onToggle(!done); }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: dragging ? .42 : 1 }} exit={{ opacity: 0 }} transition={{ duration: .12 }} className={[styles.task, selected ? styles.selected : '', done ? styles.done : '', dropEdge === 'before' ? styles.dropBefore : '', dropEdge === 'after' ? styles.dropAfter : ''].filter(Boolean).join(' ')} onClick={onSelect} onDragOver={onDragOver} onDrop={onDrop} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }} aria-pressed={selected}>
      {reorderable && <span className={styles.dragHandle} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder" aria-label={`Reorder ${task.title}`}>⠿</span>}
      <button type="button" className={styles.check} onClick={toggle} aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}><span className={styles.checkFill}><CheckIcon /></span></button>
      <span className={[styles.priority, task.priority !== 'normal' ? styles[`priority_${task.priority}`] : ''].filter(Boolean).join(' ')} />
      <span className={styles.content}>
        <span className={styles.titleLine}><span className={styles.title}>{task.title}</span>{task.pinned && <span className={styles.pin} title="Pinned"><PinIcon /></span>}</span>
        {!!(task.notes || home || task.scheduled_on || task.deadline_on || task.someday || task.tags.length > 0) && <span className={styles.meta}>
          {home && <span>{home}</span>}
          {task.notes && <span className={styles.note}>{task.notes.replace(/\s+/g, ' ')}</span>}
          {task.scheduled_on && <span className={styles.date}>Do {formatTaskDate(task.scheduled_on).toLowerCase()}</span>}
          {task.deadline_on && <span className={overdue ? styles.overdue : styles.date}>Due {formatTaskDate(task.deadline_on).toLowerCase()}</span>}
          {task.someday && <span>Someday</span>}
          {task.tags.slice(0, 2).map((tag) => <span className={styles.tag} key={tag.id}>#{tag.name}</span>)}
          {task.tags.length > 2 && <span>+{task.tags.length - 2}</span>}
        </span>}
      </span>
    </motion.div>
  );
}
