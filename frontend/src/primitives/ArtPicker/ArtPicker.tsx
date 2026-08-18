import type { ReactNode } from 'react';
import styles from './ArtPicker.module.css';

export interface ArtCandidate {
  thumb: string;
  url: string;
  author?: string;
}

interface ArtPickerProps {
  aspect: 'portrait' | 'square';
  candidates: ArtCandidate[] | null; // null = still loading
  error?: string | null;
  onPick: (url: string) => void;
  onPickFile: () => void;
  urlValue: string;
  onUrlChange: (value: string) => void;
  onUseUrl: () => void;
  busy?: boolean;
  sourceLabel?: string; // e.g. "SteamGridDB" - shown above the results grid
  extraActions?: ReactNode; // e.g. apps' "Detect automatically" button
}

// Shared by game covers and app icons: a local file/URL field plus a live
// search-result grid, fully controlled (fetching and the actual "apply"
// semantics differ enough between the two - games set art directly, apps
// re-post the whole app record - that this stays presentational, not
// opinionated about either).
export function ArtPicker({
  aspect,
  candidates,
  error,
  onPick,
  onPickFile,
  urlValue,
  onUrlChange,
  onUseUrl,
  busy,
  sourceLabel = 'SteamGridDB',
  extraActions,
}: ArtPickerProps) {
  return (
    <>
      <div className={styles.field}>
        <span className={styles.label}>From this PC</span>
        <div className={styles.row}>
          <input
            type="text"
            className={styles.input}
            placeholder="…or paste an image link"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
          />
          <button type="button" className={styles.btn} onClick={onPickFile} disabled={busy}>
            Choose file…
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={onUseUrl}
            disabled={busy || !urlValue.trim()}
          >
            Use link
          </button>
          {extraActions}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>From {sourceLabel}</span>
        {candidates === null ? (
          <div className={styles.empty}>Searching…</div>
        ) : candidates.length === 0 ? (
          <div className={styles.empty}>{error ?? 'Nothing found for this name.'}</div>
        ) : (
          <div className={[styles.grid, aspect === 'square' ? styles.gridSquare : ''].join(' ')}>
            {candidates.map((c) => (
              <button
                key={c.url}
                type="button"
                className={[styles.item, aspect === 'square' ? styles.itemSquare : ''].join(' ')}
                title={c.author ? `by ${c.author}` : undefined}
                onClick={() => onPick(c.url)}
                disabled={busy}
              >
                <img src={c.thumb} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
