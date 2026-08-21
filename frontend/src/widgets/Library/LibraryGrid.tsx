import { useEffect, useState } from 'react';
import { removeRaindrop, setRaindropFavorite } from '../../api/actions/library';
import type { LibraryCollection, LibraryItem } from '../../api/types';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { LibraryCard } from './LibraryCard';
import { LibraryRow } from './LibraryRow';
import { LibraryViewMenu } from './LibraryViewMenu';
import {
  coverSizeToDensity,
  filterItems,
  loadViewPrefs,
  saveViewPrefs,
  sectionLabel,
  type LibraryViewPrefs,
} from './utils';
import styles from './LibraryGrid.module.css';

interface LibraryGridProps {
  section: string;
  collections: LibraryCollection[];
  items: LibraryItem[];
  search: string;
  loading?: boolean;
  onSelect: (item: LibraryItem) => void;
  onItemsChange?: (items: LibraryItem[]) => void;
}

export function LibraryGrid({
  section,
  collections,
  items,
  search,
  loading,
  onSelect,
  onItemsChange,
}: LibraryGridProps) {
  const { push } = useToast();
  const [prefs, setPrefs] = useState<LibraryViewPrefs>(() => loadViewPrefs(section));
  const filtered = filterItems(items, search);
  const accent = collections.find((c) => c.id === section)?.color;
  const density = coverSizeToDensity(prefs.coverSize);

  useEffect(() => {
    setPrefs(loadViewPrefs(section));
  }, [section]);

  function handlePrefsChange(next: LibraryViewPrefs) {
    setPrefs(next);
    saveViewPrefs(section, next);
  }

  function handleFavorite(item: LibraryItem) {
    const next = !item.important;
    onItemsChange?.(items.map((i) => (i.id === item.id ? { ...i, important: next } : i)));
    setRaindropFavorite(item.id, next).then((res) => {
      if (!res.ok) {
        onItemsChange?.(items);
        push(res.error || 'Could not update favorite', 'error');
      }
    });
  }

  function handleRemove(item: LibraryItem) {
    onItemsChange?.(items.filter((i) => i.id !== item.id));
    removeRaindrop(item.id, item.url).then((res) => {
      if (!res.ok) {
        onItemsChange?.(items);
        push(res.error || 'Could not remove link', 'error');
      } else {
        push('Removed from Raindrop');
      }
    });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>{sectionLabel(section, collections)}</h1>
          <p className={styles.sub}>Favorite or remove from a link — changes sync to Raindrop</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.count}>{filtered.length} links</span>
          <LibraryViewMenu prefs={prefs} onChange={handlePrefsChange} />
        </div>
      </header>

      {loading && (
        <div className={styles.skelGrid} aria-busy="true" aria-label="Loading saves">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={148} radius={12} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className={styles.empty}>
          <span>{search.trim() ? 'No matches for that search.' : 'Nothing here yet.'}</span>
          <span>Save from the feed or your phone — they’ll show up here.</span>
        </div>
      )}

      {!loading && filtered.length > 0 && prefs.mode === 'list' && (
        <div className={styles.list}>
          {filtered.map((item) => (
            <LibraryRow
              key={item.id}
              item={item}
              variant="list"
              show={prefs.show}
              coverSize={prefs.coverSize}
              onSelect={onSelect}
              onToggleFavorite={handleFavorite}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && prefs.mode === 'headlines' && (
        <div className={styles.list}>
          {filtered.map((item) => (
            <LibraryRow
              key={item.id}
              item={item}
              variant="headlines"
              show={prefs.show}
              onSelect={onSelect}
              onToggleFavorite={handleFavorite}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (prefs.mode === 'cards' || prefs.mode === 'moodboard') && (
        <div
          className={[prefs.mode === 'moodboard' ? styles.moodboard : styles.grid, styles[density]].join(' ')}
        >
          {filtered.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              density={density}
              show={prefs.show}
              moodboard={prefs.mode === 'moodboard'}
              accent={
                item.collectionId === section
                  ? accent
                  : collections.find((c) => c.id === item.collectionId)?.color
              }
              onSelect={onSelect}
              onToggleFavorite={handleFavorite}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
