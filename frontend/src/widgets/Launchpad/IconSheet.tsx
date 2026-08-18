import { useEffect, useState } from 'react';
import { addApp } from '../../api/actions/apps';
import { detectAppIcon, fetchAppIcons } from '../../api/actions/appIcons';
import { pickImage, type CoverCandidate } from '../../api/actions/covers';
import type { AppData } from '../../api/types';
import { ArtPicker } from '../../primitives/ArtPicker/ArtPicker';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './IconSheet.module.css';

interface IconSheetProps {
  app: AppData | null;
  onClose: () => void;
}

// The apps equivalent of CoverSheet: same three ways to set an icon
// (local file/URL, SteamGridDB grid) plus one apps only has - automatic
// detection off the target exe/shortcut (/api/apps/icon-detect). There's
// no "reset to automatic" the way games have (icon is just a plain field,
// not a store override layered on an automatic resolution) - "Clear icon"
// is the closest equivalent, falling back to the letter-glyph tile.
export function IconSheet({ app, onClose }: IconSheetProps) {
  const [icons, setIcons] = useState<CoverCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!app) {
      setIcons(null);
      setError(null);
      setUrl('');
      return;
    }
    setIcons(null);
    setError(null);
    fetchAppIcons(app.label)
      .then((data) => {
        setIcons(data.icons);
        if (!data.icons.length) setError(data.error ?? 'No icons found for this name.');
      })
      .catch(() => {
        setIcons([]);
        setError('Request failed.');
      });
  }, [app]);

  async function apply(icon: string | null, clear?: boolean) {
    if (!app || busy) return;
    setBusy(true);
    try {
      const res = await addApp(app.label, app.target, { icon: icon ?? undefined, clear });
      if (!res.ok) {
        setError(res.error ?? "Couldn't set that icon");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFile() {
    const { path } = await pickImage();
    if (path) apply(path);
  }

  async function handleDetect() {
    if (!app || busy) return;
    setBusy(true);
    try {
      const res = await detectAppIcon(app.target, app.id);
      if (!res.ok || !res.icon) {
        setError(res.error ?? "Couldn't detect an icon for this target");
        return;
      }
      await apply(res.icon);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!app}
      onClose={onClose}
      title={app ? `Icon for ${app.label}` : ''}
      subtitle="Pick one below, choose a file, detect it automatically, or paste a link."
      actions={
        <>
          <button type="button" className={styles.btn} onClick={() => apply(null, true)} disabled={busy}>
            Clear icon
          </button>
          <button type="button" className={styles.btn} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <ArtPicker
        aspect="square"
        candidates={icons}
        error={error}
        onPick={(pickedUrl) => apply(pickedUrl)}
        onPickFile={handlePickFile}
        urlValue={url}
        onUrlChange={setUrl}
        onUseUrl={() => url.trim() && apply(url.trim())}
        busy={busy}
        sourceLabel="SteamGridDB"
        extraActions={
          <button type="button" className={styles.btn} onClick={handleDetect} disabled={busy}>
            Detect automatically
          </button>
        }
      />
    </Sheet>
  );
}
