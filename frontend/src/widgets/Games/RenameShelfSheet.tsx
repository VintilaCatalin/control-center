import { useEffect, useState } from 'react';
import { saveShelves, shelfPayload } from '../../api/actions/shelves';
import type { ShelfData } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './RenameShelfSheet.module.css';

interface RenameShelfSheetProps {
  open: boolean;
  onClose: () => void;
  shelves: ShelfData[];
  // null = creating a new shelf; otherwise the shelf being renamed.
  editingShelf: ShelfData | null;
}

// Shelves are the one place in the games/apps data model that genuinely
// supports an in-place rename (server.py:2814-2829 takes an explicit id) -
// unlike app/manual-game names, which don't, so no rename UI exists for
// those. Restores the old app's renameSheet() (index.html:5820-5847).
export function RenameShelfSheet({ open, onClose, shelves, editingShelf }: RenameShelfSheetProps) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(editingShelf?.label ?? '');
    setError(null);
  }, [editingShelf, open]);

  async function handleSave() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: { id?: string; label: string; claims?: string[] }[] = shelves.map(shelfPayload);
      if (editingShelf) {
        const target = payload.find((s) => s.id === editingShelf.id);
        if (target) target.label = label.trim();
      } else {
        payload.push({ label: label.trim() });
      }
      const res = await saveShelves(payload);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save that shelf");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editingShelf ? `Rename ${editingShelf.label}` : 'New shelf'}
      actions={
        <>
          <button type="button" className={styles.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleSave} disabled={busy || !label.trim()}>
            Save
          </button>
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>Label</span>
        <input
          type="text"
          className={styles.input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
