import { useEffect, useState } from 'react';
import { newNote } from '../../api/actions/notes';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { ChevronDownIcon } from './icons';
import styles from './NoteSheets.module.css';

interface NewNoteSheetProps {
  open: boolean;
  onClose: () => void;
  folders: string[];
  defaultFolder?: string;
  onCreated: (rel: string) => void;
}

const NEW_FOLDER = '__new__';

export function NewNoteSheet({ open, onClose, folders, defaultFolder, onCreated }: NewNoteSheetProps) {
  const [name, setName] = useState('');
  const [folderChoice, setFolderChoice] = useState(defaultFolder ?? '');
  const [newFolderName, setNewFolderName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setFolderChoice(defaultFolder ?? '');
  }, [open, defaultFolder]);

  function reset() {
    setName('');
    setFolderChoice(defaultFolder ?? '');
    setNewFolderName('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const folder = folderChoice === NEW_FOLDER ? newFolderName.trim() : folderChoice;
      const res = await newNote(name.trim(), folder);
      if (!res.ok || !res.rel) {
        setError(res.error ?? "Couldn't create that note");
        return;
      }
      onCreated(res.rel);
      handleClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't create that note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="New note"
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
        <span className={styles.label}>Title</span>
        <input
          type="text"
          className={`${styles.input} ${styles.titleInput}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Folder</span>
        <span className={styles.selectWrap}>
          <select className={styles.select} value={folderChoice} onChange={(e) => setFolderChoice(e.target.value)}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value={NEW_FOLDER}>New folder…</option>
          </select>
          <span className={styles.selectChevron}>
            <ChevronDownIcon />
          </span>
        </span>
      </div>

      {folderChoice === NEW_FOLDER && (
        <div className={styles.field}>
          <span className={styles.label}>Folder name</span>
          <input type="text" className={styles.input} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} autoFocus />
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
