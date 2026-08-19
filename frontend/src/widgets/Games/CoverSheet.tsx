import { useEffect, useState } from 'react';
import { fetchCovers, pickImage, setGameArt, type CoverCandidate } from '../../api/actions/covers';
import type { GameData } from '../../api/types';
import { ArtPicker } from '../../primitives/ArtPicker/ArtPicker';
import { Sheet } from '../../primitives/Sheet/Sheet';
import styles from './CoverSheet.module.css';

interface CoverSheetProps {
  game: GameData | null;
  onClose: () => void;
}

// Restores the old app's coverSheet() (index.html:5849-5907): a local
// file/URL field plus a live SteamGridDB grid search, backed by the exact
// same routes (/api/covers, /api/pick, /api/games/art) - no new backend
// logic, this was just missing from the React side. The actual picker UI
// is the shared ArtPicker; this owns the games-specific fetch + apply.
export function CoverSheet({ game, onClose }: CoverSheetProps) {
  const [covers, setCovers] = useState<CoverCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!game) {
      setCovers(null);
      setError(null);
      setUrl('');
      return;
    }
    setCovers(null);
    setError(null);
    fetchCovers(game.name, game.source === 'steam' ? game.id : undefined)
      .then((data) => {
        setCovers(data.covers);
        if (!data.covers.length) setError(data.error ?? 'No covers found for this name.');
      })
      .catch(() => {
        setCovers([]);
        setError('Request failed.');
      });
  }, [game]);

  async function apply(newUrl: string | null) {
    if (!game || busy) return;
    setBusy(true);
    try {
      const res = await setGameArt(game.id, newUrl);
      if (!res.ok) {
        setError(res.error ?? "Couldn't set that cover");
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

  return (
    <Sheet
      open={!!game}
      onClose={onClose}
      title={game ? `Cover for ${game.name}` : ''}
      subtitle="Pick one below, choose a file, or paste a link."
      size="wide"
      actions={
        <>
          <button type="button" className={styles.btn} onClick={() => apply(null)} disabled={busy}>
            Reset to automatic
          </button>
          <button type="button" className={styles.btn} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <ArtPicker
        aspect="portrait"
        candidates={covers}
        error={error}
        onPick={(pickedUrl) => apply(pickedUrl)}
        onPickFile={handlePickFile}
        urlValue={url}
        onUrlChange={setUrl}
        onUseUrl={() => url.trim() && apply(url.trim())}
        busy={busy}
        sourceLabel="SteamGridDB"
      />
    </Sheet>
  );
}
