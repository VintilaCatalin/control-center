import { useEffect, useRef, useState } from 'react';
import { addTask, type TaskCreateFields } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { Overlay } from '../../primitives/Overlay/Overlay';
import { localDateKey, type Selection } from './taskViews';
import styles from './TaskCreateSheet.module.css';

interface Props {
  open: boolean;
  selection: Selection;
  searching: boolean;
  areas: AreaEntry[];
  projects: ProjectEntry[];
  onClose: () => void;
  onCreated: (task: TaskEntry, destination: Selection) => void;
}

type WhenChoice = 'none' | 'today' | 'tomorrow' | 'someday';

function tomorrowKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateKey(tomorrow);
}

function defaults(selection: Selection, searching: boolean, areas: AreaEntry[], projects: ProjectEntry[]) {
  if (searching) return { home: 'inbox', when: 'none' as WhenChoice };
  if (selection.kind === 'project') return { home: `project:${selection.id}`, when: 'none' as WhenChoice };
  if (selection.kind === 'area') return { home: `area:${selection.id}`, when: 'none' as WhenChoice };
  if (selection.id === 'today') return { home: 'inbox', when: 'today' as WhenChoice };
  if (selection.id === 'upcoming') return { home: 'inbox', when: 'tomorrow' as WhenChoice };
  if (selection.id === 'someday') return { home: 'inbox', when: 'someday' as WhenChoice };
  if (selection.id === 'anytime') {
    if (projects[0]) return { home: `project:${projects[0].id}`, when: 'none' as WhenChoice };
    if (areas[0]) return { home: `area:${areas[0].id}`, when: 'none' as WhenChoice };
  }
  return { home: 'inbox', when: 'none' as WhenChoice };
}

export function TaskCreateSheet({ open, selection, searching, areas, projects, onClose, onCreated }: Props) {
  const initial = defaults(selection, searching, areas, projects);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [home, setHome] = useState(initial.home);
  const [when, setWhen] = useState<WhenChoice>(initial.when);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedContext = useRef<string | null>(null);
  const contextKey = `${selection.kind}:${selection.id}:${searching ? 'search' : 'view'}`;

  useEffect(() => {
    if (!open) {
      initializedContext.current = null;
      return;
    }
    if (initializedContext.current === contextKey) return;
    initializedContext.current = contextKey;
    const next = defaults(selection, searching, areas, projects);
    setTitle('');
    setNotes('');
    setHome(next.home);
    setWhen(next.when);
    setError(null);
  }, [open, contextKey, selection, searching, areas, projects]);

  async function create() {
    const clean = title.trim();
    if (!clean || busy) return;
    const fields: TaskCreateFields = {};
    if (home.startsWith('project:')) fields.project_id = home.slice(8);
    if (home.startsWith('area:')) fields.area_id = home.slice(5);
    if (when === 'today') fields.scheduled_on = localDateKey();
    if (when === 'tomorrow') fields.scheduled_on = tomorrowKey();
    if (when === 'someday') fields.someday = true;
    setBusy(true);
    setError(null);
    try {
      const result = await addTask(clean, 'normal', notes.trim() || undefined, fields);
      if (!result.ok || !result.task) throw new Error(result.error || 'Task could not be created');
      const derived: Selection = fields.project_id
        ? { kind: 'project', id: fields.project_id }
        : fields.area_id
          ? { kind: 'area', id: fields.area_id }
          : when === 'today'
            ? { kind: 'smart', id: 'today' }
            : when === 'tomorrow'
              ? { kind: 'smart', id: 'upcoming' }
              : when === 'someday'
                ? { kind: 'smart', id: 'someday' }
                : { kind: 'smart', id: 'inbox' };
      const staysInContext = !searching && (
        selection.kind === 'project' && fields.project_id === selection.id
        || selection.kind === 'area' && fields.area_id === selection.id
        || selection.kind === 'smart' && selection.id === 'today' && when === 'today'
        || selection.kind === 'smart' && selection.id === 'upcoming' && when === 'tomorrow'
        || selection.kind === 'smart' && selection.id === 'someday' && when === 'someday'
        || selection.kind === 'smart' && selection.id === 'anytime' && home !== 'inbox' && when === 'none'
        || selection.kind === 'smart' && selection.id === 'inbox' && home === 'inbox' && when === 'none'
      );
      const destination = staysInContext ? selection : derived;
      onCreated(result.task, destination);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Task could not be created');
    } finally {
      setBusy(false);
    }
  }

  return <Overlay open={open} onClose={onClose} title="New task" width={720} footer={<><button type="button" className={styles.cancel} onClick={onClose}>Cancel</button><button type="button" className={styles.create} onClick={create} disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Save task'}</button></>}>
    <div className={styles.editor}>
      <div className={styles.titleRow}><span className={styles.checkPreview} aria-hidden="true" /><input className={styles.titleInput} value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); }} placeholder="What needs doing?" autoFocus /></div>
      <textarea className={styles.notesInput} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" rows={4} />
      <div className={styles.options}>
        <label className={styles.field}><span>List</span><select value={home} onChange={(event) => setHome(event.target.value)}><option value="inbox">Inbox</option>{areas.length > 0 && <optgroup label="Areas">{areas.map((area) => <option key={area.id} value={`area:${area.id}`}>{area.title}</option>)}</optgroup>}{projects.length > 0 && <optgroup label="Projects">{projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.title}</option>)}</optgroup>}</select></label>
        <label className={styles.field}><span>Schedule</span><select value={when} onChange={(event) => setWhen(event.target.value as WhenChoice)} aria-label="Choose when to work on this task"><option value="none">Anytime</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="someday">Someday</option></select></label>
      </div>
    </div>
    {selection.kind === 'smart' && selection.id === 'anytime' && home === 'inbox' && <p className={styles.hint}>Choose an Area or Project to keep this task in Anytime.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </Overlay>;
}
