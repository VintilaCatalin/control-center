import { useEffect, useState } from 'react';
import { renameNoteFolder } from '../../api/actions/notes';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './NoteSheets.module.css';

interface Props {
  folder: string | null;
  onClose: () => void;
  onRenamed: (from: string, to: string) => void;
}

export function RenameFolderSheet({ folder, onClose, onRenamed }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folder) {
      setName(folder.split('/').at(-1) || '');
      setError(null);
    }
  }, [folder]);

  async function handleRename() {
    if (!folder || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await renameNoteFolder(folder, name.trim());
      if (!result.ok || !result.folder) throw new Error(result.error ?? "Couldn't rename that folder");
      onRenamed(folder, result.folder);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't rename that folder");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!folder}
      onClose={onClose}
      title="Rename folder"
      size="compact"
      actions={<><button type="button" className={styles.btn} onClick={onClose}>Cancel</button><button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleRename} disabled={busy || !name.trim()}>{busy ? 'Renaming…' : 'Rename'}</button></>}
    >
      <div className={styles.field}>
        <span className={styles.label}>Folder name</span>
        <input className={`${styles.input} ${styles.titleInput}`} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleRename(); }} autoFocus />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
