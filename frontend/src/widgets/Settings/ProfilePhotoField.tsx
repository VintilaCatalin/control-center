import { useRef, useState, type ChangeEvent } from 'react';
import { removeProfilePhoto, uploadProfilePhoto } from '../../api/actions/settings';
import styles from './ProfilePhotoField.module.css';

interface ProfilePhotoFieldProps {
  photoUrl: string;
  name: string;
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

// A real editor, not a raw URL field: preview, choose/replace, remove -
// there's no filesystem access from a browser, so "upload" here means
// reading the chosen file client-side and handing the backend actual
// image bytes (see /api/settings/profile-photo), not a path.
export function ProfilePhotoField({ photoUrl, name, onChanged }: ProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = (name || 'V').slice(0, 1).toUpperCase();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await uploadProfilePhoto(dataUrl);
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
      await removeProfilePhoto();
      onChanged(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>Photo</label>
      <div className={styles.row}>
        <div className={styles.preview}>{photoUrl ? <img src={photoUrl} alt="" className={styles.previewImg} /> : <span className={styles.previewInitial}>{initial}</span>}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Saving…' : photoUrl ? 'Replace' : 'Choose image'}
          </button>
          {photoUrl && (
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
