import { useEffect, useState } from 'react';
import { moveNote } from '../../api/actions/notes';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { ChevronDownIcon } from './icons';
import styles from './NoteSheets.module.css';

interface MoveNoteSheetProps {
  open: boolean;
  onClose: () => void;
  rel: string;
  currentFolder: string;
  folders: string[];
  onMoved: (rel: string) => void;
}

export function MoveNoteSheet({ open, onClose, rel, currentFolder, folders, onMoved }: MoveNoteSheetProps) {
  const [folder, setFolder] = useState(currentFolder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setFolder(currentFolder); setError(null); }
  }, [open, currentFolder]);

  async function handleMove() {
    if (busy || folder === currentFolder) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await moveNote(rel, folder);
      if (!result.ok || !result.rel) throw new Error(result.error ?? "Couldn't move that note");
      onMoved(result.rel);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't move that note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Move note"
      subtitle="The Markdown file itself moves. Its contents are not rewritten."
      size="compact"
      actions={<><button type="button" className={styles.btn} onClick={onClose}>Cancel</button><button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleMove} disabled={busy || folder === currentFolder}>{busy ? 'Moving…' : 'Move'}</button></>}
    >
      <div className={styles.field}>
        <span className={styles.label}>Destination</span>
        <span className={styles.selectWrap}>
          <select className={styles.select} value={folder} onChange={(event) => setFolder(event.target.value)} autoFocus>
            <option value="">Unfiled</option>
            {folders.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className={styles.selectChevron}><ChevronDownIcon /></span>
        </span>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
