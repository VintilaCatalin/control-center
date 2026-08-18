import { useEffect, useMemo, useRef, useState } from 'react';
import { searchBooks } from '../api/actions/books';
import { launchTarget } from '../api/actions/launch';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { BookSearchResult, GameData, PlexItem } from '../api/types';
import { Overlay } from '../primitives/Overlay/Overlay';
import { TOPIC_LABELS } from '../widgets/Reading/topics';
import { useAppNavigation } from './AppNavigationContext';
import { GamesIcon, NotesIcon, PlexIcon, ReadingIcon, SearchIcon } from './icons';
import styles from './GlobalSearchOverlay.module.css';

interface GlobalSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ResultRow {
  id: string;
  kind: 'notes' | 'games' | 'plex' | 'reading' | 'books';
  title: string;
  subtitle: string;
  onSelect: () => void;
}

const KIND_LABEL: Record<ResultRow['kind'], string> = {
  notes: 'Notes',
  games: 'Games',
  plex: 'Plex',
  reading: 'Reading',
  books: 'Books',
};

const KIND_ICON: Record<ResultRow['kind'], () => React.ReactElement> = {
  notes: NotesIcon,
  games: GamesIcon,
  plex: PlexIcon,
  reading: ReadingIcon,
  books: ReadingIcon,
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((f) => (f ?? '').toLowerCase().includes(query));
}

// One search across everything the app already has loaded, not a new
// backend index - Notes/Games/Plex/Reading are all already sitting in the
// polled snapshot (the exact same data SearchOverlay/PlexLibrary already
// filter client-side, just aggregated here instead of duplicated per
// app). Books is the one exception (not in the snapshot at all) so it
// gets a real, debounced call to the existing Open Library search action.
// "Open the relevant item directly" means: Games/Plex results launch
// straight out (PlexItem.launch is the same pre-built deep link the Plex
// app itself uses), Notes/Reading/Books results switch to that
// application already on the right place (Notes always opens at its own
// Search; Reading opens on the matching topic/Books section) - there's no
// shared deep-link-into-another-app's-open-item state in this shell to
// reach any deeper than that without a much larger change.
export function GlobalSearchOverlay({ open, onClose }: GlobalSearchOverlayProps) {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const [query, setQuery] = useState('');
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setBookResults([]);
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setBookResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchBooks(q).then(
        (res) => setBookResults(res.ok ? res.results.slice(0, 5) : []),
        () => setBookResults([]),
      );
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function select(row: ResultRow) {
    row.onSelect();
    onClose();
  }

  const results = useMemo<ResultRow[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const rows: ResultRow[] = [];

    for (const note of snapshot?.notes?.notes ?? []) {
      if (rows.filter((r) => r.kind === 'notes').length >= 5) break;
      if (!matches(q, note.name, note.folder, note.preview)) continue;
      rows.push({
        id: `note-${note.rel}`,
        kind: 'notes',
        title: note.name,
        subtitle: note.folder || 'Notes',
        onSelect: () => navigateToApp('notes'),
      });
    }

    for (const game of snapshot?.games?.games ?? []) {
      if (rows.filter((r) => r.kind === 'games').length >= 5) break;
      if (!matches(q, game.name)) continue;
      rows.push(gameRow(game));
    }

    const plexItems = [...(snapshot?.plex?.recent ?? []), ...(snapshot?.plex?.sections ?? []).flatMap((s) => s.items)];
    const seenPlex = new Set<string>();
    for (const item of plexItems) {
      if (rows.filter((r) => r.kind === 'plex').length >= 5) break;
      const key = item.ratingKey ?? item.title ?? '';
      if (!key || seenPlex.has(key)) continue;
      if (!matches(q, item.title, item.show)) continue;
      seenPlex.add(key);
      rows.push(plexRow(item));
    }

    for (const item of snapshot?.reading?.items ?? []) {
      if (rows.filter((r) => r.kind === 'reading').length >= 5) break;
      if (!matches(q, item.title, item.blurb, item.domain)) continue;
      rows.push({
        id: `reading-${item.id}`,
        kind: 'reading',
        title: item.title,
        subtitle: TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] ?? item.source_label,
        onSelect: () => navigateToApp('reading', { readingSection: item.topic }),
      });
    }

    for (const book of bookResults) {
      rows.push({
        id: `book-${book.openlibrary_key ?? book.title}`,
        kind: 'books',
        title: book.title,
        subtitle: book.author,
        onSelect: () => navigateToApp('reading', { readingSection: 'books' }),
      });
    }

    return rows;
  }, [query, snapshot, bookResults, navigateToApp]);

  function gameRow(game: GameData): ResultRow {
    return {
      id: `game-${game.id}`,
      kind: 'games',
      title: game.name,
      subtitle: game.launch ? 'Launch' : 'No launcher',
      onSelect: () => {
        if (game.launch) launchTarget(game.launch).catch(() => {});
      },
    };
  }

  function plexRow(item: PlexItem): ResultRow {
    return {
      id: `plex-${item.ratingKey ?? item.title}`,
      kind: 'plex',
      title: item.title ?? '(untitled)',
      subtitle: item.show ?? (item.type ? item.type[0].toUpperCase() + item.type.slice(1) : 'Plex'),
      onSelect: () => {
        if (item.launch) launchTarget(item.launch).catch(() => {});
      },
    };
  }

  return (
    <Overlay open={open} onClose={onClose} title="Search" icon={<SearchIcon />} width={620}>
      <div className={styles.field}>
        <SearchIcon />
        <input
          type="text"
          className={styles.input}
          placeholder="Search Notes, Games, Plex, Reading, Books…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {query.trim().length < 2 ? (
        <p className={styles.hint}>Keep typing to search across the whole app.</p>
      ) : results.length === 0 ? (
        <p className={styles.hint}>No matches for "{query.trim()}".</p>
      ) : (
        <div className={styles.results}>
          {results.map((row) => {
            const Icon = KIND_ICON[row.kind];
            return (
              <button type="button" key={row.id} className={styles.row} onClick={() => select(row)}>
                <span className={styles.rowIcon}>
                  <Icon />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  <span className={styles.rowSubtitle}>{row.subtitle}</span>
                </span>
                <span className={styles.rowKind}>{KIND_LABEL[row.kind]}</span>
              </button>
            );
          })}
        </div>
      )}
    </Overlay>
  );
}
