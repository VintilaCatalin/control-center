import { useSnapshotData } from '../../api/SnapshotProvider';
import type { NoteEntry } from '../../api/types';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import styles from './NotesGlance.module.css';

function NotesIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M15 3v5h5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" />
    </svg>
  );
}

// The one "editorial/text" panel - prose (each row's own preview text),
// not icons standing in for content. Real sections now (Pinned / Recent),
// each row carrying a folder tag + a small pin/doc glyph so the list
// reads with real hierarchy instead of every row looking identical. No
// per-note deep link exists in this shell (same honest scope Global
// Search settled on) - a row click just takes you to Notes, which
// already opens at its own Search by convention.
export function NotesGlance({ hideHeader }: { hideHeader?: boolean } = {}) {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const notes = snapshot?.notes?.notes ?? [];

  const pinned = notes.filter((n) => n.pinned).slice(0, 3);
  const pinnedRels = new Set(pinned.map((n) => n.rel));
  const recent = [...notes].filter((n) => !pinnedRels.has(n.rel)).sort((a, b) => b.when - a.when).slice(0, 4);

  return (
    <div className={styles.glance}>
      <div className={styles.head}>
        {!hideHeader && (
          <span className={styles.heading}>
            <NotesIcon /> Notes
          </span>
        )}
        <button type="button" className={styles.viewAll} onClick={() => navigateToApp('notes')}>
          Open Notes
        </button>
      </div>

      {pinned.length === 0 && recent.length === 0 ? (
        <div className={styles.empty}>No notes yet.</div>
      ) : (
        <div className={styles.sections}>
          {pinned.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Pinned</span>
              <div className={styles.list}>
                {pinned.map((note) => (
                  <NoteRow key={note.rel} note={note} pinned onOpen={() => navigateToApp('notes')} />
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Recent</span>
              <div className={styles.list}>
                {recent.map((note) => (
                  <NoteRow key={note.rel} note={note} onOpen={() => navigateToApp('notes')} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, pinned, onOpen }: { note: NoteEntry; pinned?: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={styles.row} onClick={onOpen}>
      <span className={[styles.glyph, pinned ? styles.glyphPinned : ''].join(' ')}>{pinned ? <PinIcon /> : <DocIcon />}</span>
      <span className={styles.text}>
        <span className={styles.topRow}>
          <span className={styles.title}>{note.name}</span>
          {note.folder && <span className={styles.folder}>{note.folder}</span>}
        </span>
        {note.preview && <span className={styles.preview}>{note.preview}</span>}
      </span>
    </button>
  );
}
