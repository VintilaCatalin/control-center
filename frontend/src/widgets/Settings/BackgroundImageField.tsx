import { useRef, useState, type ChangeEvent } from 'react';
import { removeBackgroundImage, uploadBackgroundImage } from '../../api/actions/settings';
import styles from './ProfilePhotoField.module.css';

interface BackgroundImageFieldProps {
  imageUrl: string;
  onChanged: (url: string | null) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Same shape as ProfilePhotoField (reuses its CSS module directly - the
// preview/choose/remove layout doesn't need a second version of itself),
// just landscape-shaped since this becomes the whole app's backdrop, not
// a small circular avatar.
export function BackgroundImageField({ imageUrl, onChanged }: BackgroundImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await uploadBackgroundImage(dataUrl);
      if (res.ok) onChanged(res.url ?? null);
      else setError(res.error ?? 'Could not save that image.');
    } catch {
      setError('Could not read that image.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await removeBackgroundImage();
      onChanged(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>Background image</label>
      <div className={styles.row}>
        <div className={[styles.preview, styles.previewWide].join(' ')}>
          {imageUrl ? <img src={imageUrl} alt="" className={styles.previewImg} /> : <span className={styles.previewInitial}>—</span>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Saving…' : imageUrl ? 'Replace' : 'Choose image'}
          </button>
          {imageUrl && (
            <button type="button" className={styles.btnGhost} onClick={handleRemove} disabled={busy}>
              Remove
            </button>
          )}
          {error && <span className={styles.error}>{error}</span>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handleFile} />
      </div>
    </div>
  );
}
