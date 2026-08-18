import { useState } from 'react';
import { nextPhoto, pinPhoto } from '../../api/actions/photo';
import type { PhotoData } from '../../api/types';
import { IconButton } from '../../primitives/IconButton/IconButton';
import styles from './RandomPhoto.module.css';

interface RandomPhotoProps {
  data?: PhotoData;
}

function ShuffleIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h3.5l8 12H21M3 18h3.5l3-4.5M14.5 6H21M18 3l3 3-3 3M18 15l3 3-3 3" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5c-2.8 0-5 2.2-5 5 0 3.5 5 11 5 11s5-7.5 5-11c0-2.8-2.2-5-5-5z" />
      <circle cx="12" cy="7.5" r="1.8" />
    </svg>
  );
}

// Immich's real library, one photo at a time - large and adapting to
// whatever size this panel happens to be (object-fit: contain, never
// cropped into a fixed thumbnail grid).
export function RandomPhoto({ data }: RandomPhotoProps) {
  const [busy, setBusy] = useState(false);

  if (!data?.configured) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>Immich isn't connected</span>
        <span className={styles.stateBody}>Add an Immich URL and API key in Settings to bring your library in.</span>
      </div>
    );
  }
  if (data.error || !data.url) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>No photo available</span>
        <span className={styles.stateBody}>{data.error || 'Immich returned nothing to show.'}</span>
      </div>
    );
  }

  async function handleNext() {
    setBusy(true);
    try {
      await nextPhoto();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.frame}>
      <img key={data.id} src={data.url} alt={data.name ?? 'Random photo'} className={styles.img} />
      <div className={styles.actions}>
        <IconButton icon={<ShuffleIcon />} label="New random photo" onClick={handleNext} disabled={busy} className={styles.action} />
        <IconButton icon={<PinIcon filled={!!data.pinned} />} label={data.pinned ? 'Unpin photo' : 'Pin photo'} onClick={() => pinPhoto(!data.pinned)} className={[styles.action, data.pinned ? styles.actionActive : ''].join(' ')} />
      </div>
      {(data.place || data.camera || data.when) && (
        <div className={styles.meta}>
          {data.place && <span className={styles.metaPlace}>{data.place}</span>}
          <span className={styles.metaSub}>
            {[data.camera, data.when].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}
