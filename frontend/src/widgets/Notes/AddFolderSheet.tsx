import { useState } from 'react';
import { newNote } from '../../api/actions/notes';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './NoteSheets.module.css';

interface AddFolderSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (rel: string) => void;
}

// There's no folder entity on the backend - a folder exists purely
// because a note's path implies it (see server.py's collect_notes()).
// Reuses new_note() exactly the way the old app's "New folder" action
// did: creating the folder means seeding one real note inside it, which
// this then opens immediately so the folder never sits there as an
// empty, unexplained admin artefact - it starts as a real first note.
export function AddFolderSheet({ open, onClose, onCreated }: AddFolderSheetProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName('');
    setError(null);
    onClose();
  }

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await newNote('', name.trim());
      if (!res.ok || !res.rel) {
        setError(res.error ?? "Couldn't create that folder");
        return;
      }
      onCreated(res.rel);
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Add folder"
      subtitle="Starts with one new note inside it, ready to write."
      size="compact"
      actions={
        <>
          <button type="button" className={styles.btn} onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleCreate} disabled={busy || !name.trim()}>
            Create
          </button>
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>Folder name</span>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
