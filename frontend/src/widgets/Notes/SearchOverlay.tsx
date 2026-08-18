import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteEntry } from '../../api/types';
import { Overlay } from '../../primitives/Overlay/Overlay';
import { duration, ease } from '../../tokens/motion';
import { NoteIcon, SearchIcon, StarIcon } from './icons';
import styles from './SearchOverlay.module.css';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  notes: NoteEntry[];
  onSelect: (rel: string) => void;
}

// Same shared Overlay chrome as Quick Capture/Tasks - a search field plus
// live-filtered, keyboard-navigable results is the only thing bespoke to
// this one. Deliberately still just that: one field, one list, no
// command-palette scope-switching or multi-category tabs.
export function SearchOverlay({ open, onClose, notes, onSelect }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes.slice(0, 8);
    return notes
      .filter((n) => n.name.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q))
      .slice(0, 20);
  }, [notes, query]);

  useEffect(() => {
    setActive(0);
  }, [results]);

  function commit(rel: string) {
    onSelect(rel);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      commit(results[active].rel);
    }
  }

  return (
    <Overlay open={open} onClose={onClose} title="Search" icon={<SearchIcon size={16} />} width={560}>
      <div className={styles.inputRow}>
        <SearchIcon size={16} />
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search your notes…"
          autoFocus
        />
      </div>

      {results.length > 0 && <div className={styles.groupLabel}>{query.trim() ? 'Results' : 'Recent'}</div>}

      <div className={styles.results} role="listbox">
        {results.length === 0 ? (
          <div className={styles.empty}>No matches.</div>
        ) : (
          <AnimatePresence initial={false}>
            {results.map((n, i) => (
              <motion.button
                key={n.rel}
                type="button"
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.fast, ease }}
                role="option"
                aria-selected={i === active}
                className={[styles.result, i === active ? styles.resultActive : ''].filter(Boolean).join(' ')}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(n.rel)}
              >
                <span className={styles.resultIcon}>
                  <NoteIcon size={14} />
                </span>
                <span className={styles.resultName}>{n.name}</span>
                {n.pinned && (
                  <span className={styles.resultPin}>
                    <StarIcon filled size={11} />
                  </span>
                )}
                <span className={styles.resultFolder}>{n.folder || 'Vault root'}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>
    </Overlay>
  );
}
