import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  HeadlinesViewIcon,
  ListViewIcon,
  MoodboardViewIcon,
  ViewIcon,
} from './icons';
import {
  type LibraryCoverSize,
  type LibraryShowFlags,
  type LibraryViewMode,
  type LibraryViewPrefs,
} from './utils';
import styles from './LibraryViewMenu.module.css';

interface LibraryViewMenuProps {
  prefs: LibraryViewPrefs;
  onChange: (prefs: LibraryViewPrefs) => void;
}

const MODES: { id: LibraryViewMode; label: string; icon: ReactNode }[] = [
  { id: 'list', label: 'List', icon: <ListViewIcon /> },
  { id: 'cards', label: 'Cards', icon: <ViewIcon /> },
  { id: 'headlines', label: 'Headlines', icon: <HeadlinesViewIcon /> },
  { id: 'moodboard', label: 'Moodboard', icon: <MoodboardViewIcon /> },
];

const SHOW_BY_MODE: Record<LibraryViewMode, { key: keyof LibraryShowFlags; label: string }[]> = {
  cards: [
    { key: 'cover', label: 'Cover' },
    { key: 'title', label: 'Title' },
    { key: 'excerpt', label: 'Description' },
    { key: 'tags', label: 'Tags' },
    { key: 'date', label: 'Date' },
  ],
  moodboard: [
    { key: 'cover', label: 'Cover' },
    { key: 'title', label: 'Title' },
    { key: 'excerpt', label: 'Description' },
    { key: 'tags', label: 'Tags' },
    { key: 'date', label: 'Date' },
  ],
  list: [
    { key: 'cover', label: 'Cover' },
    { key: 'title', label: 'Title' },
    { key: 'tags', label: 'Tags' },
    { key: 'date', label: 'Date' },
  ],
  headlines: [
    { key: 'title', label: 'Title' },
    { key: 'excerpt', label: 'Description' },
    { key: 'tags', label: 'Tags' },
    { key: 'date', label: 'Date' },
  ],
};

const SIZE_ORDER: LibraryCoverSize[] = ['s', 'm', 'l'];

export function LibraryViewMenu({ prefs, onChange }: LibraryViewMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const showKeys = SHOW_BY_MODE[prefs.mode];
  const sizeIndex = SIZE_ORDER.indexOf(prefs.coverSize);
  const showCoverSize = prefs.mode === 'cards' || prefs.mode === 'moodboard' || prefs.mode === 'list';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={[styles.trigger, open ? styles.triggerOpen : ''].join(' ')}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <ViewIcon />
        <span>{MODES.find((m) => m.id === prefs.mode)?.label ?? 'View'}</span>
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="View options">
          <p className={styles.sectionLabel}>View</p>
          <div className={styles.modeList}>
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={[styles.modeBtn, prefs.mode === mode.id ? styles.modeActive : ''].join(' ')}
                onClick={() => onChange({ ...prefs, mode: mode.id })}
              >
                <span className={styles.modeIcon}>{mode.icon}</span>
                <span>{mode.label}</span>
                <span className={styles.radio} aria-hidden="true" />
              </button>
            ))}
          </div>

          <p className={styles.sectionLabel}>
            {prefs.mode === 'list' ? 'Show in list' : prefs.mode === 'headlines' ? 'Show in headlines' : 'Show in cards'}
          </p>
          <div className={styles.checkList}>
            {showKeys.map(({ key, label }) => (
              <label key={key} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={prefs.show[key]}
                  onChange={(e) =>
                    onChange({
                      ...prefs,
                      show: { ...prefs.show, [key]: e.target.checked },
                    })
                  }
                />
                <span className={styles.checkBox} aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {showCoverSize && (
            <>
              <p className={styles.sectionLabel}>{prefs.mode === 'list' ? 'Thumb' : 'Cover'}</p>
              <div className={styles.sizeRow}>
                <span className={styles.sizeHint}>S</span>
                <input
                  className={styles.slider}
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={sizeIndex < 0 ? 1 : sizeIndex}
                  onChange={(e) =>
                    onChange({ ...prefs, coverSize: SIZE_ORDER[Number(e.target.value)] ?? 'm' })
                  }
                  aria-label={prefs.mode === 'list' ? 'Thumbnail size' : 'Cover size'}
                />
                <span className={styles.sizeHint}>L</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
