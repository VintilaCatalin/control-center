import { useState } from 'react';
import { addApp } from '../../api/actions/apps';
import { pickPath } from '../../api/actions/filePicker';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './AddAppSheet.module.css';

interface AddAppSheetProps {
  open: boolean;
  onClose: () => void;
}

// Restores the old app's addAppSheet() (index.html:5040-5090): name,
// target (with a native Browse…), and an optional icon path/URL (with its
// own Browse…) - leave the icon blank and the backend attempts an
// auto-detect on save (server.py:2691-2692). Full icon curation (the
// SteamGridDB grid) happens afterward via the tile's own context menu,
// same as the old app.
export function AddAppSheet({ open, onClose }: AddAppSheetProps) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [icon, setIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setTarget('');
    setIcon('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePickTarget() {
    const { path } = await pickPath('exe');
    if (path) setTarget(path);
  }

  async function handlePickIcon() {
    const { path } = await pickPath('image');
    if (path) setIcon(path);
  }

  async function handleSave() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await addApp(name.trim(), target.trim(), { icon: icon.trim() || undefined });
      if (!res.ok) {
        setError(res.error ?? "Couldn't add that app");
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
      title="Add an app"
      subtitle="Pins a quick-launch tile to the Launchpad."
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
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spotify"
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Starts with</span>
        <div className={styles.row}>
          <input
            type="text"
            className={styles.input}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Path, URI scheme, or shell:AppsFolder\..."
          />
          <button type="button" className={styles.btn} onClick={handlePickTarget}>
            Browse…
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Icon (optional)</span>
        <div className={styles.row}>
          <input
            type="text"
            className={styles.input}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="Leave empty to detect automatically"
          />
          <button type="button" className={styles.btn} onClick={handlePickIcon}>
            Browse…
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
    </Sheet>
  );
}
