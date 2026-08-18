import { type ReactNode, useState } from 'react';
import { pickPath } from '../../api/actions/filePicker';
import { saveSettings } from '../../api/actions/settings';
import styles from './FolderSetup.module.css';

function FolderIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.13a1.5 1.5 0 0 1 1.2.6l1.14 1.5a1.5 1.5 0 0 0 1.2.6H19.5A1.5 1.5 0 0 1 21 9.2V17a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V6.5Z" strokeLinejoin="round" />
    </svg>
  );
}

interface FolderSetupProps {
  title: string;
  description: ReactNode;
  settingKey: string;
}

// The shared first-run "this feature needs a folder" flow - Notes and
// Scene's Yours library both used to just say "choose a folder in
// Settings," but Settings never actually had a working control for
// either (see SettingsField's new type:"folder" branch). This lets the
// feature configure itself in place instead: pick -> confirm -> save ->
// the parent unmounts us on its own once its own snapshot slice reports
// configured:true on the next poll (<=2s), so there's no manual refetch
// here - just a persistent "setting up" state that outlives the request.
type Phase = 'pick' | 'confirm' | 'applying';

export function FolderSetup({ title, description, settingKey }: FolderSetupProps) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBrowse() {
    setError(null);
    try {
      const r = await pickPath('folder');
      if (r.path) {
        setPath(r.path);
        setPhase('confirm');
      }
    } catch {
      setError("Couldn't open the folder picker.");
    }
  }

  async function handleConfirm() {
    if (!path) return;
    setError(null);
    setPhase('applying');
    try {
      const r = await saveSettings({ [settingKey]: path });
      if (!r.ok) {
        setError("Couldn't save that folder - try again.");
        setPhase('confirm');
      }
      // On success, stay in "applying" - the parent swaps this component
      // out itself once configured flips true, no timer/refetch needed.
    } catch {
      setError("Couldn't reach the panel backend.");
      setPhase('confirm');
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>
        <FolderIcon />
      </div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.desc}>{description}</p>

      {phase === 'applying' ? (
        <div className={styles.applying}>
          <span className={styles.spinner} />
          Setting up…
        </div>
      ) : phase === 'confirm' && path ? (
        <>
          <div className={styles.chosen} title={path}>
            {path}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={handleBrowse}>
              Change
            </button>
            <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </>
      ) : (
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={handleBrowse}>
          Browse…
        </button>
      )}

      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
