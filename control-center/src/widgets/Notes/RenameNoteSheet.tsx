import { useEffect, useState } from 'react';
import { renameNote } from '../../api/actions/notes';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './NoteSheets.module.css';

interface RenameNoteSheetProps {
  open: boolean;
  onClose: () => void;
  rel: string;
  currentName: string;
  onRenamed: (rel: string) => void;
}

export function RenameNoteSheet({ open, onClose, rel, currentName, onRenamed }: RenameNoteSheetProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  async function handleRename() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await renameNote(rel, name.trim());
      if (!res.ok || !res.rel) {
        setError(res.error ?? "Couldn't rename that note");
        return;
      }
      onRenamed(res.rel);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rename note"
      actions={
        <>
          <button type="button" className={styles.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleRename} disabled={busy || !name.trim()}>
            Rename
          </button>
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          autoFocus
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
