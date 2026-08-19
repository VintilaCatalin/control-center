import { useState } from 'react';
import { addGame } from '../../api/actions/games';
import { pickPath } from '../../api/actions/filePicker';
import type { ShelfData } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './AddGameSheet.module.css';

interface AddGameSheetProps {
  open: boolean;
  onClose: () => void;
  shelves: ShelfData[];
  defaultShelfId?: string;
}

// Restores the old app's addGameSheet() (index.html:5746-5818): name,
// launch target (with native Browse…), an optional cover (with its own
// Browse… - leave blank and SteamGridDB fills it in automatically), and a
// shelf to land on.
export function AddGameSheet({ open, onClose, shelves, defaultShelfId }: AddGameSheetProps) {
  const [name, setName] = useState('');
  const [launch, setLaunch] = useState('');
  const [art, setArt] = useState('');
  const [shelfId, setShelfId] = useState(defaultShelfId ?? shelves[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setLaunch('');
    setArt('');
    setShelfId(defaultShelfId ?? shelves[0]?.id ?? '');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePickLaunch() {
    const { path } = await pickPath('exe');
    if (path) setLaunch(path);
  }

  async function handlePickArt() {
    const { path } = await pickPath('image');
    if (path) setArt(path);
  }

  async function handleSave() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await addGame(name.trim(), launch.trim(), art.trim(), shelfId || undefined);
      if (!res.ok) {
        setError(res.error ?? "Couldn't add that game");
        return;
      }
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      size="standard"
      title="Add a game"
      subtitle="Adds a manually-tracked entry to a shelf."
      actions={
        <>
          <button type="button" className={styles.btn} onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleSave} disabled={busy || !name.trim()}>
            Add
          </button>
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>Name</span>
        <input type="text" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Starts with</span>
        <div className={styles.row}>
          <input
            type="text"
            className={styles.input}
            value={launch}
            onChange={(e) => setLaunch(e.target.value)}
            placeholder="Path or steam://rungameid/..."
          />
          <button type="button" className={styles.btn} onClick={handlePickLaunch}>
            Browse…
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Cover (optional)</span>
        <div className={styles.row}>
          <input
            type="text"
            className={styles.input}
            value={art}
            onChange={(e) => setArt(e.target.value)}
            placeholder="Leave empty and SteamGridDB will try to find one"
          />
          <button type="button" className={styles.btn} onClick={handlePickArt}>
            Browse…
          </button>
        </div>
      </div>

      {shelves.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>Shelf</span>
          <select className={styles.input} value={shelfId} onChange={(e) => setShelfId(e.target.value)}>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
