import { useMemo, useState } from 'react';
import type { PlexItem, PlexSection } from '../../api/types';
import { PlexTile } from './PlexTile';
import styles from './PlexLibrary.module.css';

interface PlexLibraryProps {
  section: PlexSection;
  onSelect: (item: PlexItem) => void;
}

type SortKey = 'added' | 'title' | 'year';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'added', label: 'Recently Added' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'year', label: 'Year (Newest)' },
];

// Sorts/filters what the backend already sent (up to plex_limit items,
// addedAt-desc) client-side - there's no paginated/sortable backend
// route yet, and re-sorting the same capped list is honest about what
// data actually exists rather than faking server-side pagination.
export function PlexLibrary({ section, onSelect }: PlexLibraryProps) {
  const [sort, setSort] = useState<SortKey>('added');

  const items = useMemo(() => {
    if (sort === 'added') return section.items;
    const copy = [...section.items];
    if (sort === 'title') copy.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
    if (sort === 'year') copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return copy;
  }, [section.items, sort]);

  return (
    <div className={styles.library}>
      <div className={styles.header}>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>Library</span>
          <h1 className={styles.headline}>{section.title}</h1>
        </div>
        {items.length > 0 && (
          <label>
            <span className={styles.sortLabel}>Sort</span>
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {section.error && (
        <div className={styles.state}>
          <span className={styles.stateTitle}>Couldn't load this library</span>
          <span>{section.error}</span>
        </div>
      )}

      {!section.error && items.length === 0 && (
        <div className={styles.state}>
          <span className={styles.stateTitle}>Nothing here yet</span>
          <span>This library reported no items.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className={styles.grid}>
          {items.map((item, i) => (
            <PlexTile key={item.ratingKey ?? `${item.title}-${i}`} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
