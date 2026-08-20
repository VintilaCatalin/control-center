import { useEffect, useMemo, useState } from 'react';
import { removeNoteFolder } from '../../api/actions/notes';
import type { NoteEntry } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { ChevronDownIcon } from './icons';
import styles from './NoteSheets.module.css';

interface Props {
  folder: string | null;
  folders: string[];
  notes: NoteEntry[];
  onClose: () => void;
  onRemoved: (folder: string, moved: { from: string; to: string }[]) => void;
}

export function RemoveFolderSheet({ folder, folders, notes, onClose, onRemoved }: Props) {
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affected = useMemo(() => folder ? notes.filter((note) => note.folder === folder || note.folder.startsWith(`${folder}/`)) : [], [folder, notes]);
  const destinations = useMemo(() => folder ? folders.filter((item) => item !== folder && !item.startsWith(`${folder}/`)) : [], [folder, folders]);

  useEffect(() => {
    if (folder) {
      setDestination('');
      setError(null);
    }
  }, [folder]);

  async function handleRemove() {
    if (!folder || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeNoteFolder(folder, destination);
      if (!result.ok) throw new Error(result.error ?? "Couldn't remove that folder");
      onRemoved(folder, result.moved ?? []);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't remove that folder");
    } finally {
      setBusy(false);
    }
  }

  const count = affected.length;
  return (
    <Sheet
      open={!!folder}
      onClose={onClose}
      title={`Remove ${folder?.split('/').at(-1) || 'folder'}?`}
      subtitle={count ? `${count} ${count === 1 ? 'note' : 'notes'} will be moved first. Nothing is deleted.` : 'The folder will be removed. No note content is deleted.'}
      size="compact"
      actions={<><button type="button" className={styles.btn} onClick={onClose}>Cancel</button><button type="button" className={`${styles.btn} ${styles.danger}`} onClick={handleRemove} disabled={busy}>{busy ? 'Removing…' : 'Remove folder'}</button></>}
    >
      {count > 0 && <div className={styles.field}>
        <span className={styles.label}>Move notes to</span>
        <span className={styles.selectWrap}>
          <select className={styles.select} value={destination} onChange={(event) => setDestination(event.target.value)} autoFocus>
            <option value="">Unfiled</option>
            {destinations.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className={styles.selectChevron}><ChevronDownIcon /></span>
        </span>
      </div>}
      <span className={styles.hint}>Nested folders stay grouped beneath the destination. Attachments and unrelated files are left untouched.</span>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
